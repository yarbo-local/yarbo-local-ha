"""Base entity: device link, unique id, and write-only-on-change."""

from __future__ import annotations

from typing import Any

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from yarbo_local import RobotState

from .const import DOMAIN
from .coordinator import YarboCoordinator

_UNSET = object()


class YarboEntity(CoordinatorEntity[YarboCoordinator]):
    """Common behaviour for every entity of one robot."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: YarboCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.serial}_{key}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, coordinator.serial)})
        self._last_slice: Any = _UNSET
        self._last_available: bool | None = None

    @property
    def robot_state(self) -> RobotState:
        return self.coordinator.data

    def _slice(self) -> Any:
        """The part of the state this entity renders. Compared to skip writes."""
        return None

    @callback
    def _handle_coordinator_update(self) -> None:
        # DeviceMSG arrives at 1 Hz while the robot is awake. Every write fires a
        # state_reported event, so only write when this entity's own value moved.
        current = self._slice()
        available = self.available
        if current == self._last_slice and available == self._last_available:
            return
        self._last_slice = current
        self._last_available = available
        self.async_write_ha_state()
