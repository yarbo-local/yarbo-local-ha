"""The robot as a lawn mower, while a mower head is attached.

Home Assistant's lawn mower has five activities and the robot has more states than
that, so the detail lives in the Activity sensor and this entity answers the simple
question: is it mowing, paused, coming home, at rest, or in trouble?

A control is offered only while the command behind it is verified in the library's
registry. Today that is pausing, resuming and returning to the dock. Starting a plan from
rest is verified in the library and waits here for a way to choose the plan; stopping
appears the day its capture is in, with no change here.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.lawn_mower import LawnMowerEntity
from homeassistant.components.lawn_mower.const import LawnMowerActivity, LawnMowerEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from yarbo_local import Action, Activity

from . import YarboConfigEntry
from .actions import async_act
from .const import DOMAIN
from .coordinator import YarboCoordinator
from .entity import YarboEntity

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YarboConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([YarboMower(entry.runtime_data.coordinator)])


class YarboMower(YarboEntity, LawnMowerEntity):
    _attr_name = None  # the robot's own name
    _attr_translation_key = "mower"

    def __init__(self, coordinator: YarboCoordinator) -> None:
        super().__init__(coordinator, "mower")

    @property
    def available(self) -> bool:
        return super().available and self.robot_state.has_mower_head

    @property
    def supported_features(self) -> LawnMowerEntityFeature:
        robot = self.coordinator.robot
        features = LawnMowerEntityFeature(0)
        if robot.can(Action.DOCK):
            features |= LawnMowerEntityFeature.DOCK
        if robot.can(Action.PAUSE):
            features |= LawnMowerEntityFeature.PAUSE
        if robot.can(Action.RESUME):
            features |= LawnMowerEntityFeature.START_MOWING
        return features

    @property
    def activity(self) -> LawnMowerActivity:
        state = self.robot_state
        if state.fault is not None:
            return LawnMowerActivity.ERROR
        if state.activity is Activity.PAUSED:
            return LawnMowerActivity.PAUSED
        if state.returning:
            return LawnMowerActivity.RETURNING
        if state.plan_running:
            return LawnMowerActivity.MOWING
        # At rest: charging, idle, asleep or done. Home Assistant has no word for "at rest
        # away from the dock"; the Activity sensor tells those apart.
        return LawnMowerActivity.DOCKED

    async def async_dock(self) -> None:
        await async_act(self.coordinator, Action.DOCK)

    async def async_pause(self) -> None:
        await async_act(self.coordinator, Action.PAUSE)

    async def async_start_mowing(self) -> None:
        """Resume a paused plan. Starting one from rest waits for start_plan to be verified."""
        state = self.robot_state
        if state.activity is Activity.PAUSED or state.fault is not None:
            await async_act(self.coordinator, Action.RESUME)
            return
        if state.plan_running:
            return  # already mowing; nothing to do and nothing to complain about
        # Choosing which plan to start comes with start_plan, once it has been captured.
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="start_not_verified"
        )

    def _slice(self) -> Any:
        return (self.activity, self.supported_features)
