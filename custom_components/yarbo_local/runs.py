"""Plan runs: lifecycle, obstacles, plan names and what of them survives a restart.

The library decides what happened (``PlanTracker``, ``ObstacleTracker``); this module
keeps those per robot, remembers them in Home Assistant's storage, and tells listeners.
It exists so the coordinator can stay what it should be: the latest snapshot.
"""

from __future__ import annotations

from collections.abc import Callable
import logging
import time
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from yarbo_local import (
    LifecycleEvent,
    ObstacleTracker,
    PlanFeedback,
    PlanTracker,
    RobotState,
    YarboError,
    YarboRobot,
)
from yarbo_local.models import parse_plans

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

SAVE_DELAY = 10.0

type ObstacleListener = Callable[[str, dict[str, Any]], None]
type LifecycleListener = Callable[[LifecycleEvent, str | None], None]


class RunLog:
    """One robot's runs. Fed by the coordinator; read by entities, services and the card."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        robot: YarboRobot,
        *,
        on_change: Callable[[], None],
        on_obstacles: Callable[[], None],
        obstacle_store: Store[dict[str, Any]] | None = None,
        obstacle_data: dict[str, Any] | None = None,
        plan_store: Store[dict[str, Any]] | None = None,
        plan_data: dict[str, Any] | None = None,
    ) -> None:
        self.hass = hass
        self.entry = entry
        self.robot = robot
        self._on_change = on_change
        self._on_obstacles = on_obstacles
        self.obstacles = ObstacleTracker.from_dict(obstacle_data)
        self.plans = PlanTracker.from_dict(plan_data)
        self.plan_feedback: PlanFeedback | None = None
        self.plan_names: dict[int, str] = {}
        self._obstacle_store = obstacle_store
        self._plan_store = plan_store
        self._obstacle_listeners: list[ObstacleListener] = []
        self._lifecycle_listeners: list[LifecycleListener] = []
        self._naming = False
        if obstacle_store is not None and ObstacleTracker.needs_migration(obstacle_data):
            # Earlier builds logged ultrasonic readings, which were grass; rewrite without them.
            obstacle_store.async_delay_save(self.obstacles.to_dict, 1.0)

    # -- listeners

    def add_obstacle_listener(self, cb: ObstacleListener) -> Callable[[], None]:
        """Called with ``(kind, attributes)`` for every new obstacle."""
        self._obstacle_listeners.append(cb)
        return lambda: self._obstacle_listeners.remove(cb)

    def add_lifecycle_listener(self, cb: LifecycleListener) -> Callable[[], None]:
        """Called with ``(event, plan name)`` when a run starts, pauses, resumes or ends."""
        self._lifecycle_listeners.append(cb)
        return lambda: self._lifecycle_listeners.remove(cb)

    # -- what the entities read

    @property
    def plan_name(self) -> str | None:
        """Name of the plan under way, or of the last one between runs."""
        run = self.plans.current or self.plans.last
        return self.plan_names.get(run.plan_id) if run and run.plan_id is not None else None

    def last_completed(self) -> dict[str, float]:
        """When each plan last ran to completion, by name where known, for automations."""
        return {
            self.plan_names.get(plan_id, f"plan {plan_id}"): at
            for plan_id, at in self.plans.last_completed.items()
        }

    def obstacle_run_payload(self, run_id: str | None = None) -> dict[str, Any] | None:
        run = self.obstacles.get(run_id) if run_id else self.obstacles.latest
        return run.to_dict() if run is not None else None

    # -- inputs

    @callback
    def on_state(self, state: RobotState) -> None:
        at = state.last_frame_at or time.time()
        if self.obstacles.on_state(state, at):
            self._obstacles_changed()
        self._emit(self.plans.on_state(state, at))
        if self.plans.current is None:
            self.plan_feedback = None  # nothing under way, so nothing to draw or report

    @callback
    def on_barriers(self, value: Any) -> None:
        added = self.obstacles.on_barriers(value, time.time())
        for barrier in added:
            cx, cy = barrier.centre
            self._notify_obstacle(
                "barrier", {"points": len(barrier.points), "x": round(cx, 2), "y": round(cy, 2)}
            )
        if added:
            self._obstacles_changed()

    @callback
    def on_plan_feedback(self, value: Any) -> None:
        at = time.time()
        feedback = PlanFeedback.from_wire(value)
        if feedback is None:
            return
        before = (
            (self.plan_feedback.progress, self.plan_feedback.run_id) if self.plan_feedback else None
        )
        self.plan_feedback = feedback
        if self.obstacles.on_plan_feedback(value, at):
            self._obstacles_changed()
        if feedback.plan_id is not None and feedback.plan_id not in self.plan_names:
            self._learn_names()
        events = self.plans.on_plan_feedback(feedback, at)
        self._emit(events)
        if not events and before != (feedback.progress, feedback.run_id):
            self._on_change()  # progress moved; entities that show it write their state

    # -- outputs

    @callback
    def _emit(self, events: list[LifecycleEvent]) -> None:
        if not events:
            return
        for event in events:
            name = self.plan_names.get(event.plan_id) if event.plan_id is not None else None
            _LOGGER.debug("Run %s: %s %s", event.run_id, event.kind.value, event.reason or "")
            for cb in list(self._lifecycle_listeners):
                cb(event, name)
        if self._plan_store is not None:
            self._plan_store.async_delay_save(self.plans.to_dict, SAVE_DELAY)
        self._on_change()

    @callback
    def _notify_obstacle(self, kind: str, attributes: dict[str, Any]) -> None:
        run = self.obstacles.latest
        attrs = {**attributes, "run_id": run.id if run else None}
        if run is not None and run.plan_name:
            attrs["plan"] = run.plan_name
        for cb in list(self._obstacle_listeners):
            cb(kind, attrs)

    @callback
    def _obstacles_changed(self) -> None:
        if self._obstacle_store is not None:
            self._obstacle_store.async_delay_save(self.obstacles.to_dict, SAVE_DELAY)
        self._on_obstacles()
        self._on_change()

    # -- plan names: read once per unknown plan, never on a timer

    @callback
    def _learn_names(self) -> None:
        if self._naming:
            return
        self._naming = True
        self.entry.async_create_background_task(
            self.hass, self.async_learn_names(), name=f"{DOMAIN}_plan_names"
        )

    async def async_learn_names(self) -> None:
        try:
            fb = await self.robot.session.request("read_all_plan", timeout=10.0)
        except YarboError as err:
            _LOGGER.debug("Could not read plan names: %s", err)
            return
        finally:
            self._naming = False
        self.plan_names = {plan.id: plan.name for plan in parse_plans(fb.payload)}
        for run in self.obstacles.runs:
            if run.plan_name is None and run.plan_id in self.plan_names:
                run.plan_name = self.plan_names[run.plan_id]
        self._obstacles_changed()

    async def async_save(self) -> None:
        if self._obstacle_store is not None:
            await self._obstacle_store.async_save(self.obstacles.to_dict())
        if self._plan_store is not None:
            await self._plan_store.async_save(self.plans.to_dict())
