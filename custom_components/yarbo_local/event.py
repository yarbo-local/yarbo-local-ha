"""Events: plan runs starting, pausing, resuming and ending, and obstacles the robot reports.

They land in the logbook and history, and they are what automations should trigger on.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.event import EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from yarbo_local import EventKind, LifecycleEvent

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 0

EVENT_TYPES = ["barrier"]
PLAN_EVENT_TYPES = [kind.value for kind in EventKind]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data.coordinator
    async_add_entities([YarboPlanEvent(coordinator), YarboObstacleEvent(coordinator)])


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


class YarboPlanEvent(YarboEntity, EventEntity):
    """plan_started, plan_paused, plan_resumed, plan_finished, each with its reason."""

    _attr_translation_key = "plan"
    _attr_event_types = PLAN_EVENT_TYPES

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "plan")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.coordinator.runs.add_lifecycle_listener(self._on_event))

    @callback
    def _on_event(self, event: LifecycleEvent, plan_name: str | None) -> None:
        attributes = event.attributes()
        attributes.pop("at", None)  # Home Assistant stamps the event itself
        if plan_name:
            attributes["plan"] = plan_name
        self._trigger_event(event.kind.value, attributes)
        self.async_write_ha_state()
