"""Faults: the tilt on the West Lawn reads as what happened, not as "error"."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.websocket_api import live_payload
from yarbo_local import RobotState
from yarbo_local.models import FAULTS

FIXTURE = Path(__file__).parent / "fixtures" / "mower-pro-fault-902-tilted.jsonl"
STRINGS = Path(__file__).parents[1] / "custom_components" / "yarbo_local" / "strings.json"
FAULT = "sensor.yarbo_test_fault"
PAUSE = "sensor.yarbo_test_pause_reason"


def frames() -> list[tuple[float, dict[str, Any]]]:
    out = []
    for line in FIXTURE.read_text().splitlines():
        rec = json.loads(line)
        if rec["topic"].endswith("/device/DeviceMSG"):
            out.append((rec["t"], rec["payload"]))
    return out


async def test_tilt_is_named_with_code_time_and_hint(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    state = RobotState(serial=coordinator.serial)
    started = None
    for t, payload in frames():
        state, _ = state.with_frame(payload, t)
        coordinator._on_state(state)
        await hass.async_block_till_done()
        if state.error_code == 902:
            started = started or t
            break

    fault = hass.states.get(FAULT)
    assert fault.state == "tilted"
    assert fault.attributes["code"] == 902
    assert fault.attributes["description"] == "Tilted or flipped over"
    assert "Yarbo app" in fault.attributes["hint"]
    assert hass.states.get(PAUSE).state == "fault"

    live = live_payload(coordinator)
    assert live["activity"] == "error"
    assert live["fault"]["description"] == "Tilted or flipped over"
    assert live["fault"]["since"] == started
    assert live["pause_reason"] == "fault"

    # Later frames of the same fault keep the start time; the resume clears it.
    for t, payload in frames():
        if t <= started:
            continue
        state, _ = state.with_frame(payload, t)
        coordinator._on_state(state)
        if state.error_code == 902:
            assert coordinator.fault_since == started
    await hass.async_block_till_done()
    assert hass.states.get(FAULT).state == "none"
    assert hass.states.get(PAUSE).state == "not_paused"
    assert live_payload(coordinator)["fault"] is None


async def test_unidentified_code_keeps_its_number(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    state, _ = RobotState(serial=coordinator.serial).with_frame(
        {"StateMSG": {"error_code": 901, "planning_paused": 7}}, 1.0
    )
    coordinator._on_state(state)
    await hass.async_block_till_done()
    fault = hass.states.get(FAULT)
    assert fault.state == "unidentified"
    assert fault.attributes["code"] == 901
    assert live_payload(coordinator)["fault"]["description"] == "Fault 901"


def test_translations_match_the_library_wording() -> None:
    states = json.loads(STRINGS.read_text())["entity"]["sensor"]["fault"]["state"]
    for key, description, _ in FAULTS.values():
        assert states[key] == description
