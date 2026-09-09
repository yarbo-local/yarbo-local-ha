"""GNSS position from the rover's own GGA sentence."""

from __future__ import annotations

from typing import Any

from homeassistant.components.device_tracker.entity import TrackerEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 0

# Rough horizontal accuracy by GGA fix quality, in metres.
_ACCURACY = {4: 0.05, 5: 0.5, 2: 2.0, 1: 3.0}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([YarboTracker(entry.runtime_data.coordinator)])


class YarboTracker(YarboEntity, TrackerEntity):
    _attr_translation_key = "location"

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "location")

    @property
    def latitude(self) -> float | None:
        fix = self.robot_state.fix
        return fix.latitude if fix else None

    @property
    def longitude(self) -> float | None:
        fix = self.robot_state.fix
        return fix.longitude if fix else None

    @property
    def location_accuracy(self) -> float:
        fix = self.robot_state.fix
        return _ACCURACY.get(fix.quality, 10.0) if fix else 0.0

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        fix = self.robot_state.fix
        return {
            "fix_quality": fix.quality if fix else None,
            "satellites": fix.satellites if fix else None,
            "hdop": fix.hdop if fix else None,
            "heading": self.robot_state.heading_degrees,
        }

    def _slice(self) -> Any:
        fix = self.robot_state.fix
        if fix is None:
            return None
        # Five decimals is about a metre; a docked robot's jitter is below that.
        return (round(fix.latitude, 5), round(fix.longitude, 5), fix.quality)
