"""Setup, entities, availability, unload."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.const import DOMAIN
from custom_components.yarbo_local.diagnostics import async_get_config_entry_diagnostics
from yarbo_local import FakeTransport, RobotNotFoundError, Simulator


async def test_setup_entities_and_unload(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    assert loaded_entry.state is ConfigEntryState.LOADED

    assert hass.states.get("sensor.yarbo_test_battery").state == "100"
    assert hass.states.get("sensor.yarbo_test_activity").state == "charging"
    assert hass.states.get("sensor.yarbo_test_head").state == "none"
    assert hass.states.get("sensor.yarbo_test_firmware").state == "3.14.11"
    assert hass.states.get("sensor.yarbo_test_network_path").state == "halow"
    assert hass.states.get("binary_sensor.yarbo_test_awake").state == "off"
    assert hass.states.get("binary_sensor.yarbo_test_charging").state == "on"
    assert hass.states.get("binary_sensor.yarbo_test_problem").state == "off"
    assert hass.states.get("binary_sensor.yarbo_test_online").state == "on"

    tracker = hass.states.get("device_tracker.yarbo_test_location")
    assert tracker is not None
    assert isinstance(tracker.attributes["latitude"], float)
    assert tracker.attributes["fix_quality"] == 1

    # Noisy diagnostics stay out of the state machine until enabled.
    assert hass.states.get("sensor.yarbo_test_satellites") is None

    device = dr.async_get(hass).async_get_device(identifiers={(DOMAIN, sim.serial)})
    assert device is not None
    assert device.serial_number == sim.serial
    assert device.sw_version == "3.14.11"
    assert device.manufacturer == "Yarbo"

    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    await hass.async_block_till_done()
    assert loaded_entry.state is ConfigEntryState.NOT_LOADED


async def test_wake_button_streams_state(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    assert not sim.awake
    await hass.services.async_call(
        "button", "press", {"entity_id": "button.yarbo_test_wake"}, blocking=True
    )
    await hass.async_block_till_done()
    assert sim.awake
    assert hass.states.get("binary_sensor.yarbo_test_awake").state == "on"

    # Only entities whose value moved get written; the DeviceMSG frame is
    # identical to the snapshot, so the battery's last_reported is untouched.
    before = hass.states.get("sensor.yarbo_test_battery").last_reported
    sim.tick()
    await hass.async_block_till_done()
    assert hass.states.get("sensor.yarbo_test_battery").last_reported == before


async def test_disconnect_marks_unavailable_then_recovers(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, transports: list[FakeTransport]
) -> None:
    transports[-1].drop()
    await hass.async_block_till_done()
    assert hass.states.get("sensor.yarbo_test_battery").state == STATE_UNAVAILABLE
    assert hass.states.get("binary_sensor.yarbo_test_online").state == "off"

    await asyncio.sleep(0.3)  # backoff is patched to 50 ms
    await hass.async_block_till_done()
    assert hass.states.get("sensor.yarbo_test_battery").state == "100"
    assert hass.states.get("binary_sensor.yarbo_test_online").state == "on"


async def test_setup_retries_when_robot_missing(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: MagicMock,
    mock_resolve: AsyncMock,
) -> None:
    mock_resolve.side_effect = RobotNotFoundError("nothing on the subnet")
    config_entry.add_to_hass(hass)
    assert not await hass.config_entries.async_setup(config_entry.entry_id)
    assert config_entry.state is ConfigEntryState.SETUP_RETRY
    mock_create_robot.assert_not_called()


async def test_diagnostics_redact_location_and_identity(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    diag = await async_get_config_entry_diagnostics(hass, loaded_entry)
    assert diag["entry"]["data"]["host"] == "**REDACTED**"
    assert diag["entry"]["data"]["serial"] == "**REDACTED**"
    assert diag["entry"]["unique_id"] == "**REDACTED**"
    assert diag["raw"]["rtk_base_data"] == "**REDACTED**"
    assert diag["raw"]["BatteryMSG"]["capacity"] == 100
    assert diag["state"]["activity"] == "charging"
