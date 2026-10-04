"""The waiting state and the stop button: what the robot does not say in words."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from yarbo_local import Activity, Simulator

from .test_plan import entity_id, value
from .test_start import ready, setup

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "yarbo_local"


def test_every_activity_has_words_everywhere() -> None:
    """A state the library can report must read as words in HA and on the card."""
    wanted = {activity.value for activity in Activity}
    assert "waiting" in wanted, "a plan that runs while the robot stands still"
    for name in ("strings.json", "translations/en.json"):
        states = json.loads((COMPONENT / name).read_text())["entity"]["sensor"]["activity"]["state"]
        assert set(states) == wanted, name
    labels = (ROOT / "frontend" / "src" / "status.ts").read_text()
    for activity in wanted:
        assert f"\n  {activity}: " in labels, f"the card has no words for {activity}"


async def test_the_activity_sensor_offers_waiting(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    await setup(hass, config_entry)
    state = hass.states.get(entity_id(hass, "sensor", sim.serial, "activity"))
    assert state is not None
    assert "waiting" in state.attributes["options"]


async def test_stop_button(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    """Pressed reads on, as it did when the button was hit by accident on 2026-09-15."""
    ready(sim)
    sim.snapshot["BodyMsg"] = {**sim.snapshot.get("BodyMsg", {}), "body_stop_button_state": 1}
    await setup(hass, config_entry)
    assert value(hass, "binary_sensor", sim.serial, "stop_button") == "on"
