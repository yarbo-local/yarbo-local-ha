"""The blueprints load as Home Assistant blueprints, and their templates say what they claim."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from homeassistant.components.automation.config import AUTOMATION_BLUEPRINT_SCHEMA
from homeassistant.components.blueprint import models
from homeassistant.core import HomeAssistant
from homeassistant.helpers.template import Template
from homeassistant.util import dt as dt_util, yaml as yaml_util
import pytest

BLUEPRINTS = sorted((Path(__file__).parents[1] / "blueprints" / "automation").rglob("*.yaml"))


def load(path: Path) -> models.Blueprint:
    return models.Blueprint(
        yaml_util.load_yaml_dict(str(path)),
        expected_domain="automation",
        path=path.name,
        schema=AUTOMATION_BLUEPRINT_SCHEMA,
    )


@pytest.mark.parametrize("path", BLUEPRINTS, ids=lambda p: p.stem)
def test_blueprint_loads_and_uses_every_input(path: Path) -> None:
    assert len(BLUEPRINTS) == 2
    blueprint = load(path)
    assert blueprint.metadata["source_url"].endswith(f"yarbo_local/{path.name}")
    text = path.read_text()
    for name in blueprint.inputs:
        assert f"!input {name}" in text, f"input {name} is declared but never used"


def condition(path: Path, alias: str) -> str:
    data = load(path).data
    found = [c for c in data["conditions"] if c.get("alias") == alias]
    assert found, alias
    return str(found[0]["value_template"])


def test_due_only_when_the_plan_has_not_completed_lately(hass: HomeAssistant) -> None:
    path = next(p for p in BLUEPRINTS if p.stem == "mow_every_n_days")
    template = Template(condition(path, "The plan has not completed within the last N days"), hass)
    sensor = "sensor.yarbo_last_completed_plan"
    now = dt_util.utcnow()
    variables = {"last_completed": sensor, "plan": "east lawn plan", "days": 3}

    hass.states.async_set(sensor, "unknown", {})
    assert template.async_render(variables) is True, "never completed means due"

    hass.states.async_set(
        sensor, now.isoformat(), {"east lawn plan": (now - timedelta(days=1)).isoformat()}
    )
    assert template.async_render(variables) is False

    hass.states.async_set(
        sensor,
        now.isoformat(),
        {
            "east lawn plan": (now - timedelta(days=4)).isoformat(),
            "west lawn plan": now.isoformat(),
        },
    )
    assert template.async_render(variables) is True, "another plan's run does not count"


def test_not_now_blocks_while_any_entity_is_on(hass: HomeAssistant) -> None:
    path = next(p for p in BLUEPRINTS if p.stem == "mow_every_n_days")
    template = Template(condition(path, "Nothing says not now"), hass)
    hass.states.async_set("binary_sensor.rain", "off")
    hass.states.async_set("input_boolean.guests", "off")
    blockers = ["binary_sensor.rain", "input_boolean.guests"]
    assert template.async_render({"not_now": blockers}) is True
    assert template.async_render({"not_now": []}) is True
    hass.states.async_set("binary_sensor.rain", "on")
    assert template.async_render({"not_now": blockers}) is False


@pytest.mark.parametrize(
    ("kind", "reason", "fault", "told", "says"),
    [
        ("plan_paused", "fault", "Tilted or flipped over", True, "paused at 42.5%: Tilted or"),
        ("plan_paused", "emergency_stop", "", True, "paused at 42.5%: emergency stop."),
        ("plan_paused", "manual", "", False, ""),
        ("plan_paused", "low_battery_recharging", "", False, ""),
        ("plan_resumed", "", "", False, ""),
        ("plan_finished", "completed", "", False, ""),
        ("plan_finished", "returned_to_dock", "", True, "ended at 42.5% before it was finished"),
    ],
)
def test_attention_speaks_only_when_someone_should_hear(
    hass: HomeAssistant, kind: str, reason: str, fault: str, told: bool, says: str
) -> None:
    path = next(p for p in BLUEPRINTS if p.stem == "plan_needs_attention")
    data = load(path).data
    variables = {
        "quiet_reasons": ["manual", "low_battery_recharging"],
        "kind": kind,
        "plan": "east lawn plan",
        "reason": reason,
        "fault": fault,
        "progress": 42.5,
    }
    rule = condition(path, "It is a pause or an ending someone should hear about")
    assert Template(rule, hass).async_render(variables) is told
    if told:
        message = Template(data["variables"]["message"], hass).async_render(variables)
        assert says in message
        assert message.startswith("east lawn plan")
