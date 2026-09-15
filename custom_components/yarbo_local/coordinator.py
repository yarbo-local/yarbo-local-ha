"""Push coordinator fed by the library: robot state, site map, feedback and the obstacle log."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
import time
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from yarbo_local import (
    ConnectionLostError,
    ObstacleTracker,
    RobotState,
    SiteMap,
    YarboError,
    YarboRobot,
)
from yarbo_local.models import parse_plans

from .const import DOMAIN, KEEP_AWAKE_INTERVAL

_LOGGER = logging.getLogger(__name__)

# Map objects the app edits with save_*/del_* commands (verified for clean_area and
# pathway on 3.14.11; the rest follow the same verb pattern).
_MAP_OBJECTS = (
    "clean_area",
    "pathway",
    "nogozone",
    "sidewalk",
    "deadend",
    "elec_fence",
    "novisionzone",
    "charging_point",
)
MAP_EDIT_COMMANDS = frozenset(
    {f"{verb}_{obj}" for verb in ("save", "del", "del_list", "del_all") for obj in _MAP_OBJECTS}
    | {"map_recovery", "erase_map", "correct_map"}
)
# Feedback the card draws directly: plan progress and the return-to-dock route.
FEEDBACK_LEAVES = frozenset({"plan_feedback", "recharge_feedback"})
# The app saves an area twice within a second; wait for the burst to settle.
MAP_REFRESH_DELAY = 2.0
OBSTACLE_SAVE_DELAY = 10.0

type ObstacleListener = Callable[[str, dict[str, Any]], None]


class YarboCoordinator(DataUpdateCoordinator[RobotState]):
    """One robot. Data is the latest ``RobotState``; there is no polling."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        robot: YarboRobot,
        *,
        obstacle_store: Store[dict[str, Any]] | None = None,
        obstacle_data: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} {robot.serial}",
            update_interval=None,
            always_update=False,
        )
        self.entry = entry
        self.robot = robot
        self.serial: str = robot.serial or ""
        self.site_map: SiteMap | None = None
        self.feedback: dict[str, Any] = {}
        self.obstacles = ObstacleTracker.from_dict(obstacle_data)
        self._obstacle_store = obstacle_store
        if obstacle_store is not None and ObstacleTracker.needs_migration(obstacle_data):
            # Earlier builds logged ultrasonic readings, which were grass; rewrite without them.
            obstacle_store.async_delay_save(self.obstacles.to_dict, 1.0)
        self._map_listeners: list[Callable[[], None]] = []
        self._feedback_listeners: list[Callable[[str, Any], None]] = []
        self._obstacle_listeners: list[ObstacleListener] = []
        self._map_refresh: asyncio.TimerHandle | None = None
        entry.async_on_unload(robot.on_state(self._on_state))
        entry.async_on_unload(robot.session.add_connection_listener(self._on_connection))
        entry.async_on_unload(robot.session.add_topic_listener(self._on_topic))
        entry.async_on_unload(self._cancel_map_refresh)

    @property
    def connected(self) -> bool:
        return self.robot.session.connected

    # -- listeners

    def add_map_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._map_listeners.append(cb)
        return lambda: self._map_listeners.remove(cb)

    def add_feedback_listener(self, cb: Callable[[str, Any], None]) -> Callable[[], None]:
        self._feedback_listeners.append(cb)
        return lambda: self._feedback_listeners.remove(cb)

    def add_obstacle_listener(self, cb: ObstacleListener) -> Callable[[], None]:
        """Called with ``(kind, attributes)`` for every new obstacle."""
        self._obstacle_listeners.append(cb)
        return lambda: self._obstacle_listeners.remove(cb)

    # -- inbound

    @callback
    def _on_state(self, state: RobotState) -> None:
        self._expire_feedback(state)
        if self.obstacles.on_state(state, state.last_frame_at or time.time()):
            self._obstacles_changed()
        self.async_set_updated_data(state)

    @callback
    def _on_connection(self, connected: bool) -> None:
        if self.entry.state is not ConfigEntryState.LOADED:
            return  # our own close during unload is not an outage
        if connected:
            self.async_set_updated_data(self.robot.state)
        else:
            self.async_set_update_error(ConnectionLostError("connection to the robot lost"))

    @callback
    def _on_topic(self, leaf: str, value: Any) -> None:
        t = time.time()
        if leaf == "cloud_points_feedback":
            added = self.obstacles.on_barriers(value, t)
            for barrier in added:
                cx, cy = barrier.centre
                self._notify_obstacle(
                    "barrier", {"points": len(barrier.points), "x": round(cx, 2), "y": round(cy, 2)}
                )
            if added:
                self._obstacles_changed()
                self.async_update_listeners()
            return
        if leaf in FEEDBACK_LEAVES:
            if leaf == "plan_feedback" and self.obstacles.on_plan_feedback(value, t):
                self._obstacles_changed()
                run = self.obstacles.current
                if run is not None and run.plan_name is None:
                    self.entry.async_create_background_task(
                        self.hass, self._name_run(run.id), name=f"{DOMAIN}_plan_name"
                    )
                self.async_update_listeners()
            self._set_feedback(leaf, value)
            return
        # The phone app's edits pass through the robot's broker; their acks tell us
        # the stored map changed, without polling.
        if leaf != "data_feedback" or not isinstance(value, dict):
            return
        if value.get("topic") in MAP_EDIT_COMMANDS and value.get("state") == 0:
            self._schedule_map_refresh()

    # -- feedback

    @callback
    def _expire_feedback(self, state: RobotState) -> None:
        """Drop feedback that no longer describes the robot, so a card never replays it."""
        if "recharge_feedback" in self.feedback and state.recharging_code == 0:
            self._set_feedback("recharge_feedback", None)
        if "plan_feedback" in self.feedback and state.planning_code == 0:
            self._set_feedback("plan_feedback", None)

    @callback
    def _set_feedback(self, leaf: str, value: Any) -> None:
        if value is None:
            self.feedback.pop(leaf, None)
        else:
            self.feedback[leaf] = value
        for cb in list(self._feedback_listeners):
            cb(leaf, value)

    # -- obstacles

    def obstacle_run_payload(self, run_id: str | None = None) -> dict[str, Any] | None:
        run = self.obstacles.get(run_id) if run_id else self.obstacles.latest
        return run.to_dict() if run is not None else None

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
        payload = self.obstacle_run_payload()
        for cb in list(self._feedback_listeners):
            cb("obstacles", payload)
        if self._obstacle_store is not None:
            self._obstacle_store.async_delay_save(self.obstacles.to_dict, OBSTACLE_SAVE_DELAY)

    async def _name_run(self, run_id: str) -> None:
        try:
            fb = await self.robot.session.request("read_all_plan", timeout=10.0)
        except YarboError as err:
            _LOGGER.debug("Could not read plan names: %s", err)
            return
        run = self.obstacles.get(run_id)
        if run is None:
            return
        for plan in parse_plans(fb.payload):
            if plan.id == run.plan_id:
                run.plan_name = plan.name
                self._obstacles_changed()
                self.async_update_listeners()
                return

    async def async_save_obstacles(self) -> None:
        if self._obstacle_store is not None:
            await self._obstacle_store.async_save(self.obstacles.to_dict())

    # -- map

    async def async_refresh_map(self) -> SiteMap:
        """Read the map from the robot; notify listeners when it changed."""
        site = await self.robot.site_map()
        changed = site != self.site_map
        self.site_map = site
        if changed:
            for cb in list(self._map_listeners):
                cb()
        return site

    async def async_refresh_all(self) -> None:
        await self.robot.snapshot()
        await self.async_refresh_map()

    def _schedule_map_refresh(self) -> None:
        self._cancel_map_refresh()
        self._map_refresh = self.hass.loop.call_later(MAP_REFRESH_DELAY, self._fire_map_refresh)

    @callback
    def _cancel_map_refresh(self) -> None:
        if self._map_refresh is not None:
            self._map_refresh.cancel()
            self._map_refresh = None

    @callback
    def _fire_map_refresh(self) -> None:
        self._map_refresh = None
        self.entry.async_create_background_task(
            self.hass, self._refresh_map_quietly(), name=f"{DOMAIN}_map_{self.entry.entry_id}"
        )

    async def _refresh_map_quietly(self) -> None:
        try:
            await self.async_refresh_map()
        except YarboError as err:
            _LOGGER.debug("Map refresh after an app edit failed: %s", err)

    # -- keep awake

    def start_keep_awake(self) -> None:
        self.entry.async_create_background_task(
            self.hass, self._keep_awake(), name=f"{DOMAIN}_keep_awake_{self.entry.entry_id}"
        )

    async def _keep_awake(self) -> None:
        while True:
            await asyncio.sleep(KEEP_AWAKE_INTERVAL)
            if not self.connected:
                continue
            try:
                await self.robot.session.send("set_working_state")
            except YarboError as err:
                _LOGGER.debug("Keep-awake renewal failed: %s", err)
