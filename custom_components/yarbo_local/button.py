"""Buttons for the verified commands that take no arguments."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from yarbo_local import Action, YarboError

from . import YarboConfigEntry
from .actions import async_act
from .const import DOMAIN
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 1


@dataclass(frozen=True, kw_only=True)
class YarboButtonDescription(ButtonEntityDescription):
    press_fn: Callable[[YarboCoordinator], Awaitable[object]]
    # A button for a moving action exists only while its command is verified.
    action: Action | None = None


BUTTONS: tuple[YarboButtonDescription, ...] = (
    YarboButtonDescription(key="wake", translation_key="wake", press_fn=lambda c: c.robot.wake()),
    YarboButtonDescription(
        key="refresh",
        translation_key="refresh",
        entity_category=EntityCategory.DIAGNOSTIC,
        press_fn=lambda c: c.async_refresh_all(),
    ),
    YarboButtonDescription(
        key="return_to_dock",
        translation_key="return_to_dock",
        action=Action.DOCK,
        press_fn=lambda c: async_act(c, Action.DOCK),
    ),
    YarboButtonDescription(
        key="resume",
        translation_key="resume",
        action=Action.RESUME,
        press_fn=lambda c: async_act(c, Action.RESUME),
    ),
    YarboButtonDescription(
        key="pause",
        translation_key="pause",
        action=Action.PAUSE,
        press_fn=lambda c: async_act(c, Action.PAUSE),
    ),
    YarboButtonDescription(
        key="stop",
        translation_key="stop",
        action=Action.STOP,
        press_fn=lambda c: async_act(c, Action.STOP),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data.coordinator
    async_add_entities(
        YarboButton(coordinator, description)
        for description in BUTTONS
        if description.action is None or coordinator.robot.can(description.action)
    )


class YarboButton(YarboEntity, ButtonEntity):
    entity_description: YarboButtonDescription

    def __init__(self, coordinator: YarboCoordinator, description: YarboButtonDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    async def async_press(self) -> None:
        try:
            await self.entity_description.press_fn(self.coordinator)
        except YarboError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="command_failed",
                translation_placeholders={
                    "command": self.entity_description.key,
                    "error": str(err),
                },
            ) from err
