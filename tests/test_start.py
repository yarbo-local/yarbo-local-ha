"""Choosing a plan and starting it: the picker, the Start button, the mower and the action."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch

from homeassistant.core import HomeAssistant, State
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import entity_registry as er
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, mock_restore_cache

from custom_components.yarbo_local.const import DOMAIN
from yarbo_local import Simulator

from .test_plan import entity_id, value, with_mower

PLANS = [
    {"id": 1, "name": "east lawn plan", "areaIds": [4], "enable_self_order": True},
    {"id": 2, "name": "west lawn plan", "areaIds": [9], "enable_self_order": True},
]


def ready(sim: Simulator, plans: list[dict[str, Any]] | None = None) -> None:
    """A mower on the dock with a good fix and two plans, as on the real site."""
    with_mower(sim)
    sim.snapshot["RTKMSG"] = {**sim.snapshot.get("RTKMSG", {}), "status": "4"}
    sim.plans[:] = PLANS if plans is None else plans


async def setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_picker_lists_the_robots_plans_and_choosing_sends_nothing(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    await setup(hass, config_entry)
    picker = entity_id(hass, "select", sim.serial, "plan")
    state = hass.states.get(picker)
    assert state is not None
    assert state.attributes["options"] == ["east lawn plan", "west lawn plan"]
    assert state.state == "unknown", "nothing is chosen until a person chooses"

    before = len(sim.log)
    await hass.services.async_call(
        "select", "select_option", {"entity_id": picker, "option": "east lawn plan"}, blocking=True
    )
    assert value(hass, "select", sim.serial, "plan") == "east lawn plan"
    assert len(sim.log) == before, "choosing a plan must not send anything to the robot"


async def test_start_without_a_choice_says_what_to_do(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    await setup(hass, config_entry)
    before = len(sim.log)
    with pytest.raises(ServiceValidationError) as refused:
        await hass.services.async_call(
            "button",
            "press",
            {"entity_id": entity_id(hass, "button", sim.serial, "start")},
            blocking=True,
        )
    assert refused.value.translation_key == "no_plan_selected"
    assert len(sim.log) == before


async def test_mower_start_from_rest_starts_the_chosen_plan(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    await setup(hass, config_entry)
    picker = entity_id(hass, "select", sim.serial, "plan")
    mower = entity_id(hass, "lawn_mower", sim.serial, "mower")
    await hass.services.async_call(
        "select", "select_option", {"entity_id": picker, "option": "west lawn plan"}, blocking=True
    )
    await hass.services.async_call(
        "lawn_mower", "start_mowing", {"entity_id": mower}, blocking=True
    )
    await asyncio.sleep(0.05)
    await hass.async_block_till_done()
    assert [name for name, _ in sim.log][-3:] == [
        "set_working_state",
        "get_controller",
        "start_plan",
    ]
    assert sim.log[-1] == ("start_plan", {"id": 2, "percent": 0})
    assert value(hass, "sensor", sim.serial, "activity") == "calculating_route"


async def test_start_is_refused_in_words_when_it_cannot_work(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    sim.snapshot["RTKMSG"] = {**sim.snapshot["RTKMSG"], "status": "1"}
    await setup(hass, config_entry)
    before = len(sim.log)
    with pytest.raises(ServiceValidationError) as refused:
        await hass.services.async_call(
            DOMAIN,
            "start_plan",
            {"config_entry_id": config_entry.entry_id, "plan": "East Lawn Plan"},
            blocking=True,
        )
    assert refused.value.translation_key == "refused_rtk_not_ready"
    assert len(sim.log) == before


async def test_action_starts_by_name_and_names_the_plans_when_it_cannot_find_one(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    await setup(hass, config_entry)
    with pytest.raises(ServiceValidationError) as missing:
        await hass.services.async_call(
            DOMAIN,
            "start_plan",
            {"config_entry_id": config_entry.entry_id, "plan": "north lawn"},
            blocking=True,
        )
    assert missing.value.translation_key == "plan_not_found"
    assert missing.value.translation_placeholders == {
        "plan": "north lawn",
        "plans": "east lawn plan, west lawn plan",
    }
    await hass.services.async_call(
        DOMAIN,
        "start_plan",
        {"config_entry_id": config_entry.entry_id, "plan": " East Lawn Plan "},
        blocking=True,
    )
    assert sim.log[-1] == ("start_plan", {"id": 1, "percent": 0})


async def test_choice_survives_a_restart_and_a_deleted_plan_does_not(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    config_entry.add_to_hass(hass)
    known = er.async_get(hass).async_get_or_create(
        "select",
        DOMAIN,
        f"{sim.serial}_plan",
        config_entry=config_entry,
        suggested_object_id="plan",
    )
    mock_restore_cache(hass, [State(known.entity_id, "west lawn plan")])
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    picker = entity_id(hass, "select", sim.serial, "plan")
    assert picker == known.entity_id
    assert value(hass, "select", sim.serial, "plan") == "west lawn plan", "restored"

    await hass.services.async_call(
        "select", "select_option", {"entity_id": picker, "option": "west lawn plan"}, blocking=True
    )
    sim.plans[:] = PLANS[:1]  # the west plan is deleted in the app
    coordinator = config_entry.runtime_data.coordinator
    await coordinator.runs.async_learn_names()
    await hass.async_block_till_done()
    state = hass.states.get(picker)
    assert state is not None
    assert state.attributes["options"] == ["east lawn plan"]
    assert state.state == "unknown", "a plan that no longer exists must not stay chosen"


async def test_two_plans_of_one_name_are_told_apart(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(
        sim, [{"id": 3, "name": "lawn", "areaIds": [4]}, {"id": 7, "name": "lawn", "areaIds": [9]}]
    )
    await setup(hass, config_entry)
    state = hass.states.get(entity_id(hass, "select", sim.serial, "plan"))
    assert state is not None
    assert state.attributes["options"] == ["lawn (3)", "lawn (7)"]


async def test_a_start_the_robot_cannot_route_is_told_in_words(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    ready(sim)
    await setup(hass, config_entry)
    coordinator = config_entry.runtime_data.coordinator
    coordinator.runs.plan_names[9] = "ghost plan"  # known here, gone on the robot: it cannot route
    with (
        patch("yarbo_local.client.START_CONFIRM_S", 0.3),
        pytest.raises(HomeAssistantError) as failed,
    ):
        await hass.services.async_call(
            DOMAIN,
            "start_plan",
            {"config_entry_id": config_entry.entry_id, "plan": "ghost plan"},
            blocking=True,
        )
    assert failed.value.translation_key == "plan_start_failed"
    placeholders = failed.value.translation_placeholders or {}
    assert placeholders["reason"] == "Failed to calculate route"
    assert "WP005" in placeholders["hint"]
