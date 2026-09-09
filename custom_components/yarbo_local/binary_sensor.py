"""Binary sensors, including the connection itself."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from yarbo_local import RobotState

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class YarboBinarySensorDescription(BinarySensorEntityDescription):
    value_fn: Callable[[RobotState], bool | None]


SENSORS: tuple[YarboBinarySensorDescription, ...] = (
    YarboBinarySensorDescription(
        key="awake",
        translation_key="awake",
        value_fn=lambda s: s.awake,
    ),
    YarboBinarySensorDescription(
        key="charging",
        device_class=BinarySensorDeviceClass.BATTERY_CHARGING,
        value_fn=lambda s: s.charging,
    ),
    YarboBinarySensorDescription(
        key="problem",
        device_class=BinarySensorDeviceClass.PROBLEM,
        value_fn=lambda s: s.error_code != 0,
    ),
    YarboBinarySensorDescription(
        key="rtk_fix",
        translation_key="rtk_fix",
        value_fn=lambda s: s.rtk_usable,
    ),
    YarboBinarySensorDescription(
        key="person_detection",
        translation_key="person_detection",
        value_fn=lambda s: s.person_detection,
    ),
    YarboBinarySensorDescription(
        key="follow_mode",
        translation_key="follow_mode",
        value_fn=lambda s: s.follow_mode,
    ),
    YarboBinarySensorDescription(
        key="child_lock",
        translation_key="child_lock",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.child_lock,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data.coordinator
    entities: list[BinarySensorEntity] = [
        YarboBinarySensor(coordinator, description) for description in SENSORS
    ]
    entities.append(YarboOnlineSensor(coordinator))
    async_add_entities(entities)


class YarboBinarySensor(YarboEntity, BinarySensorEntity):
    entity_description: YarboBinarySensorDescription

    def __init__(
        self, coordinator: YarboCoordinator, description: YarboBinarySensorDescription
    ) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def is_on(self) -> bool | None:
        return self.entity_description.value_fn(self.robot_state)

    def _slice(self) -> Any:
        return self.is_on


class YarboOnlineSensor(YarboEntity, BinarySensorEntity):
    """Broker connection. Stays available so it can say "off"."""

    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_translation_key = "online"

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "online")

    @property
    def available(self) -> bool:
        return True

    @property
    def is_on(self) -> bool:
        return self.coordinator.connected

    def _slice(self) -> Any:
        return self.is_on
