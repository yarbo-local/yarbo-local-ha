"""The plan to start. Choosing one sends nothing; Start and the mower's start use it."""

from __future__ import annotations

from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from yarbo_local import Action

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data.coordinator
    if coordinator.robot.can(Action.START):
        async_add_entities([YarboPlanSelect(coordinator)])


class YarboPlanSelect(YarboEntity, SelectEntity, RestoreEntity):
    """The robot's plans by name. The choice lives here, not on the robot."""

    _attr_translation_key = "plan"

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "plan")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        runs = self.coordinator.runs
        if last is not None and runs.selected_plan_id is None:
            runs.select_plan(runs.plan_options().get(last.state))

    @property
    def options(self) -> list[str]:
        return list(self.coordinator.runs.plan_options())

    @property
    def current_option(self) -> str | None:
        runs = self.coordinator.runs
        for name, plan_id in runs.plan_options().items():
            if plan_id == runs.selected_plan_id:
                return name
        return None

    async def async_select_option(self, option: str) -> None:
        self.coordinator.runs.select_plan(self.coordinator.runs.plan_options()[option])

    def _slice(self) -> Any:
        return (tuple(self.options), self.current_option)
