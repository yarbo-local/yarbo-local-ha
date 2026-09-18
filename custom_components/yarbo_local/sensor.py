"""Sensors read straight from the robot's telemetry."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
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
    UnitOfElectricCurrent,
    UnitOfElectricPotential,
    UnitOfLength,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.typing import StateType
from homeassistant.util import dt as dt_util

from yarbo_local import Activity, RobotState
from yarbo_local.models import FAULTS, HEAD_TYPES, PAUSE_REASONS

from . import YarboConfigEntry
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class YarboSensorDescription(SensorEntityDescription):
    value_fn: Callable[[RobotState], StateType]
    attrs_fn: Callable[[RobotState], dict[str, Any]] | None = None


FAULT_OPTIONS = ["none", *(key for key, _, _ in FAULTS.values()), "unidentified"]


def _fault_state(state: RobotState) -> str:
    fault = state.fault
    if fault is None:
        return "none"
    return fault.key or "unidentified"


def _fault_attrs(state: RobotState) -> dict[str, Any]:
    fault = state.fault
    if fault is None:
        return {}
    return {"code": fault.code, "description": fault.description, "hint": fault.hint}


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
        key="fault",
        translation_key="fault",
        device_class=SensorDeviceClass.ENUM,
        options=FAULT_OPTIONS,
        value_fn=_fault_state,
        attrs_fn=_fault_attrs,
    ),
    YarboSensorDescription(
        key="pause_reason",
        translation_key="pause_reason",
        device_class=SensorDeviceClass.ENUM,
        options=["not_paused", *PAUSE_REASONS.values(), "unknown"],
        value_fn=lambda s: s.pause_reason or "not_paused",
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
        key="battery_current",
        translation_key="battery_current",
        device_class=SensorDeviceClass.CURRENT,
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda s: s.battery_current,
    ),
    YarboSensorDescription(
        key="battery_voltage",
        translation_key="battery_voltage",
        device_class=SensorDeviceClass.VOLTAGE,
        native_unit_of_measurement=UnitOfElectricPotential.VOLT,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        entity_registry_enabled_default=False,
        value_fn=lambda s: s.battery_voltage,
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
    entities: list[SensorEntity] = [YarboSensor(coordinator, d) for d in SENSORS]
    entities.append(YarboObstacleCountSensor(coordinator))
    entities += [
        YarboPlanStatusSensor(coordinator),
        YarboPlanProgressSensor(coordinator),
        YarboPlanRemainingSensor(coordinator),
        YarboLastCompletedSensor(coordinator),
    ]
    async_add_entities(entities)


class YarboSensor(YarboEntity, SensorEntity):
    entity_description: YarboSensorDescription

    def __init__(self, coordinator: YarboCoordinator, description: YarboSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> StateType:
        return self.entity_description.value_fn(self.robot_state)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        attrs_fn = self.entity_description.attrs_fn
        return attrs_fn(self.robot_state) if attrs_fn else None

    def _slice(self) -> Any:
        return (self.native_value, self.extra_state_attributes)


class YarboObstacleCountSensor(YarboEntity, SensorEntity):
    """Obstacles logged in the current plan run, or the last one between runs."""

    _attr_translation_key = "obstacles_this_run"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "obstacles_this_run")

    @property
    def native_value(self) -> int | None:
        run = self.coordinator.obstacles.latest
        return run.obstacle_count if run is not None else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        run = self.coordinator.obstacles.latest
        if run is None:
            return {}
        return {
            "run_id": run.id,
            "plan": run.plan_name,
            "active": run.active,
        }

    def _slice(self) -> Any:
        run = self.coordinator.obstacles.latest
        return (self.native_value, run.plan_name if run else None, run.active if run else None)


PLAN_STATUS_OPTIONS = ["none", "running", "paused", "recharging"]


class YarboPlanStatusSensor(YarboEntity, SensorEntity):
    """Whether a plan run is under way, and which. A paused run is still a run."""

    _attr_translation_key = "plan_status"
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = PLAN_STATUS_OPTIONS

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "plan_status")

    @property
    def native_value(self) -> str:
        run = self.coordinator.runs.plans.current
        return run.phase.value if run is not None else "none"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        runs = self.coordinator.runs
        run = runs.plans.current
        attrs: dict[str, Any] = {"plan": runs.plan_name}
        if run is not None:
            attrs |= {
                "plan_id": run.plan_id,
                "run_id": run.run_id,
                "pauses": run.pauses,
                "pause_reason": run.pause_reason,
            }
        elif runs.plans.last_finish_reason is not None:
            attrs["last_run_ended"] = runs.plans.last_finish_reason.value
        return attrs

    def _slice(self) -> Any:
        return (self.native_value, self.extra_state_attributes)


class YarboPlanProgressSensor(YarboEntity, SensorEntity):
    """Percent of the plan's area finished. Kept while paused; gone when the run ends."""

    _attr_translation_key = "plan_progress"
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 0

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "plan_progress")

    @property
    def native_value(self) -> float | None:
        run = self.coordinator.runs.plans.current
        return run.progress if run is not None else None

    def _slice(self) -> Any:
        # Whole percents: progress creeps at 2 Hz and the recorder does not need every step.
        value = self.native_value
        return round(value) if value is not None else None


class YarboPlanRemainingSensor(YarboEntity, SensorEntity):
    """The robot's own estimate of the time left, while the plan is moving."""

    _attr_translation_key = "plan_remaining"
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_suggested_display_precision = 0

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "plan_remaining")

    @property
    def native_value(self) -> int | None:
        runs = self.coordinator.runs
        feedback = runs.plan_feedback
        if runs.plans.current is None or feedback is None or feedback.remaining_s is None:
            return None
        return round(feedback.remaining_s / 60)

    def _slice(self) -> Any:
        return self.native_value


class YarboLastCompletedSensor(YarboEntity, SensorEntity):
    """When a plan last ran to completion. What "every N days" automations compare with.

    Only a completed run counts: one that was sent home early, stopped or is still paused
    does not move this. The attributes give the time per plan.
    """

    _attr_translation_key = "last_completed"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "last_completed")

    @property
    def native_value(self) -> datetime | None:
        times = self.coordinator.runs.plans.last_completed.values()
        return dt_util.utc_from_timestamp(max(times)) if times else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            name: dt_util.utc_from_timestamp(at).isoformat()
            for name, at in self.coordinator.runs.last_completed().items()
        }

    def _slice(self) -> Any:
        return (self.native_value, self.extra_state_attributes)
