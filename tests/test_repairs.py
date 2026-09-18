"""Repairs appear when a person has something to fix and leave when it is fixed."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.yarbo_local import repairs
from custom_components.yarbo_local.const import DOMAIN
from yarbo_local import RobotState, Simulator

from .test_plan import with_mower


def issue(hass: HomeAssistant, kind: str, sim: Simulator) -> ir.IssueEntry | None:
    return ir.async_get(hass).async_get_issue(DOMAIN, repairs.issue_id(kind, sim.serial))


async def setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_a_healthy_robot_on_checked_firmware_raises_nothing(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    for kind in repairs.KINDS:
        assert issue(hass, kind, sim) is None, kind


async def test_a_start_that_failed_before_we_looked_is_reported_and_clears_on_a_start(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    with_mower(sim, on_going_planning=-12)  # latched from a start made in the app, days ago
    await setup(hass, config_entry)
    found = issue(hass, repairs.PLAN_CANNOT_START, sim)
    assert found is not None
    assert found.translation_placeholders is not None
    assert found.translation_placeholders["reason"] == "Failed to calculate route"
    assert "WP005" in found.translation_placeholders["hint"]
    assert found.is_fixable is False

    coordinator = config_entry.runtime_data.coordinator
    started, _ = RobotState(serial=sim.serial).with_frame(
        {**sim.snapshot, "StateMSG": {**sim.snapshot["StateMSG"], "on_going_planning": 2}}, 1.0
    )
    coordinator._on_state(started)
    assert issue(hass, repairs.PLAN_CANNOT_START, sim) is None


async def test_an_unknown_code_is_reported_without_a_made_up_meaning(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    with_mower(sim, on_going_planning=-24)
    await setup(hass, config_entry)
    found = issue(hass, repairs.PLAN_CANNOT_START, sim)
    assert found is not None
    assert found.translation_placeholders is not None
    assert found.translation_placeholders["reason"] == "Plan error -24"


async def test_silence_is_reported_after_a_quarter_of_an_hour_not_before(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    coordinator.robot.session.connected = False
    coordinator._on_connection(False)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=5))
    await hass.async_block_till_done()
    assert issue(hass, repairs.UNREACHABLE, sim) is None, "a reconnect usually takes seconds"

    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=16))
    await hass.async_block_till_done()
    assert issue(hass, repairs.UNREACHABLE, sim) is not None

    coordinator.robot.session.connected = True
    coordinator._on_connection(True)
    assert issue(hass, repairs.UNREACHABLE, sim) is None


async def test_a_short_outage_never_becomes_a_repair(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    coordinator._on_connection(False)
    coordinator._on_connection(True)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=20))
    await hass.async_block_till_done()
    assert issue(hass, repairs.UNREACHABLE, sim) is None


async def test_firmware_nobody_has_checked_is_said_once_and_plainly(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    repairs.async_check_firmware(hass, sim.serial, "Yard", "3.20.0", frozenset({"3.14.11"}))
    found = issue(hass, repairs.UNVERIFIED_FIRMWARE, sim)
    assert found is not None
    assert found.translation_placeholders == {
        "name": "Yard",
        "firmware": "3.20.0",
        "verified": "3.14.11",
    }
    repairs.async_check_firmware(hass, sim.serial, "Yard", "3.14.11", frozenset({"3.14.11"}))
    assert issue(hass, repairs.UNVERIFIED_FIRMWARE, sim) is None
    repairs.async_check_firmware(hass, sim.serial, "Yard", None, frozenset({"3.14.11"}))
    assert issue(hass, repairs.UNVERIFIED_FIRMWARE, sim) is None, "unknown is not unverified"


async def test_unloading_takes_the_notices_with_it(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    with_mower(sim, on_going_planning=-12)
    await setup(hass, config_entry)
    assert issue(hass, repairs.PLAN_CANNOT_START, sim) is not None
    assert await hass.config_entries.async_unload(config_entry.entry_id)
    assert issue(hass, repairs.PLAN_CANNOT_START, sim) is None
