"""The paths that only run when something goes wrong, or rarely: each says something useful."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_HOST
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.yarbo_local import client as client_module
from custom_components.yarbo_local.const import CONF_KEEP_AWAKE, DOMAIN
from yarbo_local import (
    CommandRefusedError,
    ControllerError,
    ReplyTimeoutError,
    Simulator,
    YarboRobot,
    discover,
)

from .test_plan import entity_id, with_mower

# -- setup


async def test_a_robot_that_does_not_answer_is_retried_not_failed(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
) -> None:
    config_entry.add_to_hass(hass)
    with patch.object(YarboRobot, "snapshot", AsyncMock(side_effect=ReplyTimeoutError("silent"))):
        assert not await hass.config_entries.async_setup(config_entry.entry_id)
    assert config_entry.state is ConfigEntryState.SETUP_RETRY


async def test_setup_survives_a_map_that_will_not_load(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    config_entry.add_to_hass(hass)
    with patch.object(YarboRobot, "site_map", AsyncMock(side_effect=ReplyTimeoutError("no map"))):
        assert await hass.config_entries.async_setup(config_entry.entry_id)
    assert config_entry.state is ConfigEntryState.LOADED
    assert "Map not loaded" in caplog.text


async def test_a_robot_found_at_a_new_address_is_remembered_there(
    hass: HomeAssistant, config_entry: MockConfigEntry, mock_create_robot: Any
) -> None:
    config_entry.add_to_hass(hass)
    with patch("custom_components.yarbo_local.resolve", AsyncMock(return_value="192.168.50.77")):
        assert await hass.config_entries.async_setup(config_entry.entry_id)
    assert config_entry.data[CONF_HOST] == "192.168.50.77"


async def test_keep_awake_renews_the_wake_and_shrugs_off_a_failure(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    config_entry.add_to_hass(hass)
    hass.config_entries.async_update_entry(config_entry, options={CONF_KEEP_AWAKE: True})
    with patch("custom_components.yarbo_local.coordinator.KEEP_AWAKE_INTERVAL", 0.02):
        assert await hass.config_entries.async_setup(config_entry.entry_id)
        await asyncio.sleep(0.1)
        assert "set_working_state" in [name for name, _ in sim.log]
        session = config_entry.runtime_data.coordinator.robot.session
        with patch.object(session, "send", AsyncMock(side_effect=ReplyTimeoutError("busy"))):
            await asyncio.sleep(0.06)
        session.connected = False
        await asyncio.sleep(0.06)  # offline: it waits, it does not send
        session.connected = True
    assert config_entry.state is ConfigEntryState.LOADED


# -- the library object


def test_the_client_module_builds_a_robot_without_touching_the_network() -> None:
    robot = client_module.create_robot("192.0.2.1", 1883, "SN1", None)
    assert isinstance(robot, YarboRobot)
    assert robot.serial == "SN1"


async def test_listing_robots_listens_for_one_heartbeat_window() -> None:
    with patch.object(discover, "sample", AsyncMock(return_value="sampled")) as sample:
        assert await client_module.list_robots("192.0.2.1", 1883) == "sampled"
    sample.assert_awaited_once_with("192.0.2.1", 1883, wait=discover.HEARTBEAT_WINDOW)


# -- commands that fail after the pre-flight passed


@pytest.mark.parametrize(
    ("error", "kind", "key"),
    [
        (ControllerError("held by the app"), HomeAssistantError, "controller_unavailable"),
        (CommandRefusedError("candidate"), ServiceValidationError, "not_verified"),
        (ReplyTimeoutError("nothing came back"), HomeAssistantError, "command_failed"),
    ],
)
async def test_a_failed_command_is_a_sentence_never_a_traceback(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
    error: Exception,
    kind: type[HomeAssistantError],
    key: str,
) -> None:
    with_mower(sim, planning_paused=7, error_code=902)
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    mower = entity_id(hass, "lawn_mower", sim.serial, "mower")
    with (
        patch.object(YarboRobot, "act", AsyncMock(side_effect=error)),
        pytest.raises(kind) as failed,
    ):
        await hass.services.async_call("lawn_mower", "dock", {"entity_id": mower}, blocking=True)
    assert failed.value.translation_key == key


async def test_a_button_whose_command_fails_says_which_and_why(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    wake = entity_id(hass, "button", sim.serial, "wake")
    with (
        patch.object(YarboRobot, "wake", AsyncMock(side_effect=ReplyTimeoutError("asleep"))),
        pytest.raises(HomeAssistantError) as failed,
    ):
        await hass.services.async_call("button", "press", {"entity_id": wake}, blocking=True)
    assert failed.value.translation_key == "command_failed"
    assert (failed.value.translation_placeholders or {})["command"] == "wake"


# -- refresh, and the app editing the map


async def test_refresh_rereads_state_map_and_plans(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    before = len(sim.log)
    refresh = entity_id(hass, "button", sim.serial, "refresh")
    await hass.services.async_call("button", "press", {"entity_id": refresh}, blocking=True)
    assert [name for name, _ in sim.log[before:]] == ["get_device_msg", "get_map", "read_all_plan"]


async def test_an_edit_in_the_app_rereads_the_map_once_the_burst_settles(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    before = len(sim.log)
    with patch("custom_components.yarbo_local.coordinator.MAP_REFRESH_DELAY", 0.02):
        ack = {"topic": "save_pathway", "state": 0, "msg": "", "data": {}}
        coordinator._on_topic("data_feedback", ack)
        coordinator._on_topic("data_feedback", ack)  # the app saves twice within a second
        await asyncio.sleep(0.1)
        await hass.async_block_till_done()
    assert [name for name, _ in sim.log[before:]] == ["get_map", "read_all_plan"], "one reread"

    with (
        patch("custom_components.yarbo_local.coordinator.MAP_REFRESH_DELAY", 0.02),
        patch.object(YarboRobot, "site_map", AsyncMock(side_effect=ReplyTimeoutError("busy"))),
    ):
        coordinator._on_topic("data_feedback", ack)
        await asyncio.sleep(0.1)
        await hass.async_block_till_done()
    assert loaded_entry.state is ConfigEntryState.LOADED, "a failed reread is not an outage"


# -- actions


async def test_actions_name_what_is_wrong_with_the_target(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    with pytest.raises(ServiceValidationError) as missing:
        await hass.services.async_call(
            DOMAIN, "get_map", {"config_entry_id": "nope"}, blocking=True, return_response=True
        )
    assert missing.value.translation_key == "entry_not_found"

    with (
        patch.object(YarboRobot, "site_map", AsyncMock(side_effect=ReplyTimeoutError("busy"))),
        pytest.raises(HomeAssistantError),
    ):
        await hass.services.async_call(
            DOMAIN,
            "get_map",
            {"config_entry_id": loaded_entry.entry_id},
            blocking=True,
            return_response=True,
        )

    with pytest.raises(ServiceValidationError) as no_run:
        await hass.services.async_call(
            DOMAIN,
            "get_obstacles",
            {"config_entry_id": loaded_entry.entry_id, "run_id": "9-9"},
            blocking=True,
            return_response=True,
        )
    assert no_run.value.translation_key == "run_not_found"

    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    with pytest.raises(ServiceValidationError) as unloaded:
        await hass.services.async_call(
            DOMAIN,
            "get_map",
            {"config_entry_id": loaded_entry.entry_id},
            blocking=True,
            return_response=True,
        )
    assert unloaded.value.translation_key == "entry_not_loaded"


# -- websocket


@pytest.mark.parametrize(
    "command",
    [
        {"type": "yarbo_local/map"},
        {"type": "yarbo_local/obstacles"},
        {"type": "yarbo_local/subscribe_live"},
        {"type": "yarbo_local/background/get"},
        {"type": "yarbo_local/background/save", "background": {"url": "/local/x.png"}},
        {"type": "yarbo_local/background/clear"},
    ],
)
async def test_every_websocket_command_answers_not_found_for_a_stranger(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    command: dict[str, Any],
) -> None:
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({**command, "entity_id": "sensor.not_a_yarbo"})
    reply = await ws.receive_json()
    assert reply["success"] is False
    assert reply["error"]["code"] in ("not_found", "invalid_format")


async def test_map_command_says_when_the_robot_will_not_give_the_map(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    loaded_entry.runtime_data.coordinator.site_map = None
    ws = await hass_ws_client(hass)
    with patch.object(YarboRobot, "site_map", AsyncMock(side_effect=ReplyTimeoutError("busy"))):
        await ws.send_json_auto_id({"type": "yarbo_local/map", "entry_id": loaded_entry.entry_id})
        reply = await ws.receive_json()
    assert reply["success"] is False
    assert reply["error"]["code"] == "map_unavailable"


async def test_an_outage_is_logged_once_going_and_once_coming_back(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, caplog: pytest.LogCaptureFixture
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    caplog.set_level("INFO", logger="custom_components.yarbo_local.coordinator")
    for _ in range(3):  # the link flaps
        coordinator._on_connection(False)
    coordinator._on_connection(True)
    coordinator._on_connection(True)
    assert caplog.text.count("is unreachable") == 1
    assert caplog.text.count("is reachable again") == 1
