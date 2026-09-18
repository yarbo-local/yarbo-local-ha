"""Push coordinator fed by the library: the robot's state, its map, and what the card draws.

Runs, their lifecycle and the obstacle log live in ``runs.py``; this forwards to it.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime
import logging
import time
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from yarbo_local import (
    ConnectionLostError,
    FlightRecorder,
    ObstacleTracker,
    RobotState,
    SiteMap,
    YarboError,
    YarboRobot,
)

from . import repairs
from .const import DOMAIN, KEEP_AWAKE_INTERVAL
from .runs import ObstacleListener, RunLog

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
        plan_store: Store[dict[str, Any]] | None = None,
        plan_data: dict[str, Any] | None = None,
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
        self.fault_started: tuple[int, float] | None = None
        self.runs = RunLog(
            hass,
            entry,
            robot,
            on_change=self.async_update_listeners,
            on_obstacles=self._obstacles_changed,
            obstacle_store=obstacle_store,
            obstacle_data=obstacle_data,
            plan_store=plan_store,
            plan_data=plan_data,
        )
        self._map_listeners: list[Callable[[], None]] = []
        self._feedback_listeners: list[Callable[[str, Any], None]] = []
        self._map_refresh: asyncio.TimerHandle | None = None
        self._unreachable: CALLBACK_TYPE | None = None
        self._plan_error_code = 0
        self._logged_unavailable = False
        # The last minutes of traffic, for diagnostics. In memory only, redacted on the way out.
        self.recorder = FlightRecorder()
        entry.async_on_unload(self.recorder.attach(robot.session))
        entry.async_on_unload(self._cancel_unreachable)
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
        return self.runs.add_obstacle_listener(cb)

    @property
    def obstacles(self) -> ObstacleTracker:
        return self.runs.obstacles

    def obstacle_run_payload(self, run_id: str | None = None) -> dict[str, Any] | None:
        return self.runs.obstacle_run_payload(run_id)

    async def async_save_obstacles(self) -> None:
        await self.runs.async_save()

    @callback
    def _obstacles_changed(self) -> None:
        """The obstacle log changed: send the card the current run's log."""
        payload = self.runs.obstacle_run_payload()
        for cb in list(self._feedback_listeners):
            cb("obstacles", payload)

    # -- inbound

    @callback
    def _on_state(self, state: RobotState) -> None:
        self._track_fault(state)
        self.track_plan_error(state)
        self.runs.on_state(state)
        self._expire_feedback(state)
        self.async_set_updated_data(state)

    @callback
    def _on_connection(self, connected: bool) -> None:
        if self.entry.state is not ConfigEntryState.LOADED:
            return  # our own close during unload is not an outage
        self.recorder.note(time.time(), "connected" if connected else "connection lost")
        # Once when it goes and once when it is back, however often the link flaps in between.
        if connected and self._logged_unavailable:
            _LOGGER.info("%s is reachable again", self.entry.title)
            self._logged_unavailable = False
        elif not connected and not self._logged_unavailable:
            _LOGGER.info("%s is unreachable; reconnecting in the background", self.entry.title)
            self._logged_unavailable = True
        if connected:
            self._cancel_unreachable()
            repairs.async_clear(self.hass, self.serial, repairs.UNREACHABLE)
            self.async_set_updated_data(self.robot.state)
        else:
            if self._unreachable is None:
                self._unreachable = async_call_later(
                    self.hass, repairs.UNREACHABLE_AFTER, self._report_unreachable
                )
            self.async_set_update_error(ConnectionLostError("connection to the robot lost"))

    @callback
    def _cancel_unreachable(self) -> None:
        if self._unreachable is not None:
            self._unreachable()
            self._unreachable = None

    @callback
    def _report_unreachable(self, _now: datetime) -> None:
        self._unreachable = None
        if not self.connected:
            repairs.async_unreachable(
                self.hass, self.serial, self.entry.title, str(self.entry.data.get("host", ""))
            )

    @callback
    def track_plan_error(self, state: RobotState) -> None:
        """A start that could not work leaves only a code, and leaves it until a start works."""
        error = state.plan_error
        code = error.code if error else 0
        if code == self._plan_error_code:
            return
        self._plan_error_code = code
        if error is None:
            repairs.async_clear(self.hass, self.serial, repairs.PLAN_CANNOT_START)
        else:
            repairs.async_plan_cannot_start(self.hass, self.serial, self.entry.title, error)

    @callback
    def _on_topic(self, leaf: str, value: Any) -> None:
        if leaf == "cloud_points_feedback":
            self.runs.on_barriers(value)
            return
        if leaf in FEEDBACK_LEAVES:
            if leaf == "plan_feedback":
                self.runs.on_plan_feedback(value)
            self._set_feedback(leaf, value)
            return
        # The phone app's edits pass through the robot's broker; their acks tell us
        # the stored map changed, without polling.
        if leaf != "data_feedback" or not isinstance(value, dict):
            return
        if value.get("topic") in MAP_EDIT_COMMANDS and value.get("state") == 0:
            self._schedule_map_refresh()

    # -- feedback

    @property
    def fault_since(self) -> float | None:
        return self.fault_started[1] if self.fault_started else None

    @callback
    def _track_fault(self, state: RobotState) -> None:
        code = state.error_code
        if code == 0:
            self.fault_started = None
        elif self.fault_started is None or self.fault_started[0] != code:
            self.fault_started = (code, state.last_frame_at or time.time())

    @callback
    def _expire_feedback(self, state: RobotState) -> None:
        """Drop feedback that no longer describes the robot, so a card never replays it."""
        if "recharge_feedback" in self.feedback and state.recharging_code == 0:
            self._set_feedback("recharge_feedback", None)
        # A paused plan reports planning 0 and goes quiet, but it is still the plan on the
        # map. Only the end of the run takes it away.
        if "plan_feedback" in self.feedback and self.runs.plans.current is None:
            self._set_feedback("plan_feedback", None)

    @callback
    def _set_feedback(self, leaf: str, value: Any) -> None:
        if value is None:
            self.feedback.pop(leaf, None)
        else:
            self.feedback[leaf] = value
        for cb in list(self._feedback_listeners):
            cb(leaf, value)

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
        await self.runs.async_learn_names()

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
        await self.runs.async_learn_names()  # plans are edited in the same sitting

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
