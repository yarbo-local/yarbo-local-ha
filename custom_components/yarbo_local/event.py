"""Obstacle events: one per obstacle the robot reports, so they land in the logbook and history."""

from __future__ import annotations

from typing import Any

from homeassistant.components.event import EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 0

EVENT_TYPES = ["barrier"]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([YarboObstacleEvent(entry.runtime_data.coordinator)])


class YarboObstacleEvent(YarboEntity, EventEntity):
    _attr_translation_key = "obstacle"
    _attr_event_types = EVENT_TYPES

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "obstacle")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.coordinator.add_obstacle_listener(self._on_obstacle))

    @callback
    def _on_obstacle(self, kind: str, attributes: dict[str, Any]) -> None:
        self._trigger_event(kind, attributes)
        self.async_write_ha_state()
