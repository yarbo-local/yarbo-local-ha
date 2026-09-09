"""Buttons for the verified commands that take no arguments."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from yarbo_local import YarboError, YarboRobot

from . import YarboConfigEntry
from .const import DOMAIN
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 1


@dataclass(frozen=True, kw_only=True)
class YarboButtonDescription(ButtonEntityDescription):
    press_fn: Callable[[YarboRobot], Awaitable[object]]


BUTTONS: tuple[YarboButtonDescription, ...] = (
    YarboButtonDescription(key="wake", translation_key="wake", press_fn=lambda r: r.wake()),
    YarboButtonDescription(
        key="refresh",
        translation_key="refresh",
        entity_category=EntityCategory.DIAGNOSTIC,
        press_fn=lambda r: r.snapshot(),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data.coordinator
    async_add_entities(YarboButton(coordinator, description) for description in BUTTONS)


class YarboButton(YarboEntity, ButtonEntity):
    entity_description: YarboButtonDescription

    def __init__(self, coordinator: YarboCoordinator, description: YarboButtonDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    async def async_press(self) -> None:
        try:
            await self.entity_description.press_fn(self.coordinator.robot)
        except YarboError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="command_failed",
                translation_placeholders={
                    "command": self.entity_description.key,
                    "error": str(err),
                },
            ) from err
