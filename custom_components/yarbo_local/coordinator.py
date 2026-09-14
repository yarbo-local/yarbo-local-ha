"""Push coordinator fed by the library's state listener, plus the site map."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from yarbo_local import ConnectionLostError, RobotState, SiteMap, YarboError, YarboRobot

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
# Feedback topics the card draws: plan progress, return route, detected obstacles.
# Formats come from the steves2j reverse engineering; not yet seen on our robot.
FEEDBACK_LEAVES = frozenset({"plan_feedback", "recharge_feedback", "cloud_points_feedback"})
# The app saves an area twice within a second; wait for the burst to settle.
MAP_REFRESH_DELAY = 2.0


class YarboCoordinator(DataUpdateCoordinator[RobotState]):
    """One robot. Data is the latest ``RobotState``; there is no polling."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, robot: YarboRobot) -> None:
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
        self._map_listeners: list[Callable[[], None]] = []
        self._feedback_listeners: list[Callable[[str, Any], None]] = []
        self.feedback: dict[str, Any] = {}
        self._map_refresh: asyncio.TimerHandle | None = None
        entry.async_on_unload(robot.on_state(self._on_state))
        entry.async_on_unload(robot.session.add_connection_listener(self._on_connection))
        entry.async_on_unload(robot.session.add_topic_listener(self._on_topic))
        entry.async_on_unload(self._cancel_map_refresh)

    @property
    def connected(self) -> bool:
        return self.robot.session.connected

    @callback
    def _on_state(self, state: RobotState) -> None:
        self.async_set_updated_data(state)

    @callback
    def _on_connection(self, connected: bool) -> None:
        if self.entry.state is not ConfigEntryState.LOADED:
            return  # our own close during unload is not an outage
        if connected:
            self.async_set_updated_data(self.robot.state)
        else:
            self.async_set_update_error(ConnectionLostError("connection to the robot lost"))

    # -- map

    def add_feedback_listener(self, cb: Callable[[str, Any], None]) -> Callable[[], None]:
        self._feedback_listeners.append(cb)
        return lambda: self._feedback_listeners.remove(cb)

    def add_map_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._map_listeners.append(cb)
        return lambda: self._map_listeners.remove(cb)

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

    @callback
    def _on_topic(self, leaf: str, value: Any) -> None:
        if leaf in FEEDBACK_LEAVES:
            self.feedback[leaf] = value
            for cb in list(self._feedback_listeners):
                cb(leaf, value)
            return
        # The phone app's edits pass through the robot's broker; their acks tell us
        # the stored map changed, without polling.
        if leaf != "data_feedback" or not isinstance(value, dict):
            return
        if value.get("topic") in MAP_EDIT_COMMANDS and value.get("state") == 0:
            self._schedule_map_refresh()

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
