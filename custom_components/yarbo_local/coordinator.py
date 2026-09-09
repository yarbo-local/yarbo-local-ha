"""Push coordinator fed by the library's state listener."""

from __future__ import annotations

import asyncio
import logging

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from yarbo_local import ConnectionLostError, RobotState, YarboError, YarboRobot

from .const import DOMAIN, KEEP_AWAKE_INTERVAL

_LOGGER = logging.getLogger(__name__)


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
        entry.async_on_unload(robot.on_state(self._on_state))
        entry.async_on_unload(robot.session.add_connection_listener(self._on_connection))

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
