"""Diagnostics: enough to act on, nothing that says who or where."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.const import DOMAIN
from custom_components.yarbo_local.diagnostics import async_get_config_entry_diagnostics
from yarbo_local import Simulator

from .test_start import ready


async def test_recent_traffic_tells_the_story_without_identity_or_place(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    sim.snapshot["RTKMSG"] = {**sim.snapshot["RTKMSG"], "status": "1"}  # no fix: start refused
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            "start_plan",
            {"config_entry_id": config_entry.entry_id, "plan": "east lawn plan"},
            blocking=True,
        )
    sim.snapshot["RTKMSG"] = {**sim.snapshot["RTKMSG"], "status": "4"}
    await config_entry.runtime_data.coordinator.robot.wake()
    await asyncio.sleep(0.05)
    await hass.services.async_call(
        DOMAIN,
        "start_plan",
        {"config_entry_id": config_entry.entry_id, "plan": "east lawn plan"},
        blocking=True,
    )
    await asyncio.sleep(0.05)

    diagnostics = await async_get_config_entry_diagnostics(hass, config_entry)
    recent = diagnostics["recent"]
    told = [r.get("note") or f"{r['from']}:{r['leaf']}" for r in recent]
    assert "start refused" in told
    assert "us:start_plan" in told
    refusal = next(r for r in recent if r.get("note") == "start refused")
    assert refusal["keys"] == ["rtk_not_ready"]
    planning = [
        r["value"]["StateMSG.on_going_planning"] for r in recent if r.get("leaf") == "DeviceMSG"
    ]
    assert planning[-1] == 2, "the state change the start caused is in the record"

    text = json.dumps(diagnostics)
    assert sim.serial not in text
    assert "gngga" not in json.dumps(recent).lower()
    assert str(config_entry.data["host"]) not in text
