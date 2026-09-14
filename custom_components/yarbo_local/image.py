"""The site map as an image entity, redrawn when the map changes or the robot moves."""

from __future__ import annotations

import math
from typing import Any

from homeassistant.components.image import ImageEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity
from .map_render import render_svg

PARALLEL_UPDATES = 0

# Redraw when the robot has moved this far or turned this much. Telemetry is 1 Hz.
POSE_STEP_M = 0.5
HEADING_STEP_DEG = 20.0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([YarboMapImage(entry.runtime_data.coordinator)])


class YarboMapImage(YarboEntity, ImageEntity):
    _attr_translation_key = "map"
    _attr_content_type = "image/svg+xml"

    def __init__(self, coordinator: YarboCoordinator) -> None:
        YarboEntity.__init__(self, coordinator, "map")
        ImageEntity.__init__(self, coordinator.hass)
        self._map_version = 0
        self._attr_image_last_updated = dt_util.utcnow()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.coordinator.add_map_listener(self._on_map_changed))

    @callback
    def _on_map_changed(self) -> None:
        self._map_version += 1
        self._handle_coordinator_update()

    def _slice(self) -> Any:
        pos = self.robot_state.position
        pose = (
            None
            if pos is None
            else (
                round(pos[0] / POSE_STEP_M),
                round(pos[1] / POSE_STEP_M),
                round(math.degrees(pos[2]) / HEADING_STEP_DEG),
            )
        )
        return (self._map_version, pose)

    @callback
    def _handle_coordinator_update(self) -> None:
        current = self._slice()
        available = self.available
        if current == self._last_slice and available == self._last_available:
            return
        if current != self._last_slice:
            self._attr_image_last_updated = dt_util.utcnow()
        self._last_slice = current
        self._last_available = available
        self.async_write_ha_state()

    async def async_image(self) -> bytes:
        return render_svg(self.coordinator.site_map, self.robot_state).encode("utf-8")
