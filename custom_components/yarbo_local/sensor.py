"""Sensors read straight from the robot's telemetry."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import (
    DEGREE,
    PERCENTAGE,
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    EntityCategory,
    UnitOfLength,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.typing import StateType

from yarbo_local import Activity, RobotState
from yarbo_local.models import HEAD_TYPES

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class YarboSensorDescription(SensorEntityDescription):
    value_fn: Callable[[RobotState], StateType]


def _position(index: int) -> Callable[[RobotState], StateType]:
    def inner(state: RobotState) -> StateType:
        pos = state.position
        return round(pos[index], 3) if pos else None

    return inner


SENSORS: tuple[YarboSensorDescription, ...] = (
    YarboSensorDescription(
        key="battery",
        device_class=SensorDeviceClass.BATTERY,
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: s.battery,
    ),
    YarboSensorDescription(
        key="activity",
        translation_key="activity",
        device_class=SensorDeviceClass.ENUM,
        options=[a.value for a in Activity],
        value_fn=lambda s: s.activity.value,
    ),
    YarboSensorDescription(
        key="head_type",
        translation_key="head_type",
        device_class=SensorDeviceClass.ENUM,
        options=[*HEAD_TYPES.values(), "unknown"],
        value_fn=lambda s: s.head_name,
    ),
    YarboSensorDescription(
        key="ambient_temperature",
        translation_key="ambient_temperature",
        device_class=SensorDeviceClass.TEMPERATURE,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: s.ambient_temperature,
    ),
    YarboSensorDescription(
        key="error_code",
        translation_key="error_code",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.error_code,
    ),
    YarboSensorDescription(
        key="battery_health",
        translation_key="battery_health",
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.battery_health,
    ),
    YarboSensorDescription(
        key="rtk_status",
        translation_key="rtk_status",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.rtk_status,
    ),
    YarboSensorDescription(
        key="network_path",
        translation_key="network_path",
        device_class=SensorDeviceClass.ENUM,
        options=["halow", "wifi", "lte"],
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.network_path,
    ),
    YarboSensorDescription(
        key="firmware",
        translation_key="firmware",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.firmware,
    ),
    YarboSensorDescription(
        key="satellites",
        translation_key="satellites",
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda s: s.satellites,
    ),
    YarboSensorDescription(
        key="heading",
        translation_key="heading",
        native_unit_of_measurement=DEGREE,
        state_class=SensorStateClass.MEASUREMENT_ANGLE,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda s: s.heading_degrees,
    ),
    YarboSensorDescription(
        key="position_x",
        translation_key="position_x",
        device_class=SensorDeviceClass.DISTANCE,
        native_unit_of_measurement=UnitOfLength.METERS,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=_position(0),
    ),
    YarboSensorDescription(
        key="position_y",
        translation_key="position_y",
        device_class=SensorDeviceClass.DISTANCE,
        native_unit_of_measurement=UnitOfLength.METERS,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=_position(1),
    ),
    YarboSensorDescription(
        key="halow_rssi",
        translation_key="halow_rssi",
        device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda s: s.halow_rssi,
    ),
    YarboSensorDescription(
        key="body_firmware",
        translation_key="body_firmware",
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda s: s.body_firmware,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data.coordinator
    async_add_entities(YarboSensor(coordinator, description) for description in SENSORS)


class YarboSensor(YarboEntity, SensorEntity):
    entity_description: YarboSensorDescription

    def __init__(self, coordinator: YarboCoordinator, description: YarboSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> StateType:
        return self.entity_description.value_fn(self.robot_state)

    def _slice(self) -> Any:
        return self.native_value
