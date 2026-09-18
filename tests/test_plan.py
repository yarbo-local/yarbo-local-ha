"""Plan runs in Home Assistant: the lawn mower, its controls, lifecycle events and sensors.

The long test replays a real afternoon (West Lawn, eight tilt faults, an emergency stop,
eight resumes, then sent home) and checks every surface a person or an automation sees.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import time
from typing import Any

from homeassistant.core import Event, HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import entity_registry as er
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.const import DOMAIN
from yarbo_local import LifecycleEvent, RobotState, Simulator

FIXTURES = Path(__file__).parent / "fixtures"
RUN = FIXTURES / "mower-pro-run-faults-estop.jsonl"
HOME = FIXTURES / "return-to-dock-from-fault.jsonl"


def entity_id(hass: HomeAssistant, platform: str, serial: str, key: str) -> str:
    found = er.async_get(hass).async_get_entity_id(platform, DOMAIN, f"{serial}_{key}")
    assert found is not None, f"no {platform} entity for {key}"
    return found


def value(hass: HomeAssistant, platform: str, serial: str, key: str) -> str:
    state = hass.states.get(entity_id(hass, platform, serial, key))
    assert state is not None
    return state.state


async def replay(hass: HomeAssistant, coordinator: Any, *files: Path) -> RobotState:
    state = RobotState(serial=coordinator.serial)
    for file in files:
        for line in file.read_text().splitlines():
            rec = json.loads(line)
            if "/device/" not in rec["topic"]:
                continue
            leaf = rec["topic"].rsplit("/", 1)[-1]
            if leaf == "DeviceMSG":
                state, _ = state.with_frame(rec["payload"], time.time())
                coordinator._on_state(state)
            elif leaf in ("plan_feedback", "recharge_feedback"):
                coordinator._on_topic(leaf, rec["payload"])
    await hass.async_block_till_done()
    return state


def with_mower(sim: Simulator, **state: Any) -> None:
    sim.snapshot = {
        **sim.snapshot,
        "HeadMsg": {**sim.snapshot.get("HeadMsg", {}), "head_type": 5},
        "StateMSG": {**sim.snapshot["StateMSG"], **state},
    }


# -- the real afternoon


async def test_the_west_lawn_afternoon_as_home_assistant_saw_it(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    sim.plans = [{"id": 2, "name": "west lawn plan", "areaIds": [9]}]
    coordinator = loaded_entry.runtime_data.coordinator
    serial = coordinator.serial
    seen: list[tuple[str, str | None, str | None]] = []
    coordinator.runs.add_lifecycle_listener(
        lambda event, plan: seen.append((event.kind.value, event.reason, plan))
    )
    mower_states: list[str] = []
    mower = entity_id(hass, "lawn_mower", serial, "mower")

    def on_change(event: Event[Any]) -> None:
        new = event.data["new_state"]
        if event.data["entity_id"] == mower and new is not None:
            mower_states.append(new.state)

    hass.bus.async_listen("state_changed", on_change)

    await replay(hass, coordinator, RUN)
    await asyncio.sleep(0.05)  # plan names are read in the background

    # Paused on the last fault, 89 percent done: still a run, still on the map.
    assert value(hass, "sensor", serial, "plan_status") == "paused"
    assert value(hass, "sensor", serial, "plan_progress") == "89.3"
    assert value(hass, "sensor", serial, "fault") == "tilted"
    assert value(hass, "lawn_mower", serial, "mower") == "error"
    assert "plan_feedback" in coordinator.feedback, "a paused plan must stay on the card"
    status = hass.states.get(entity_id(hass, "sensor", serial, "plan_status"))
    assert status is not None
    assert status.attributes["plan"] == "west lawn plan"
    assert status.attributes["pauses"] == 9
    assert status.attributes["pause_reason"] == "fault"

    await replay(hass, coordinator, HOME)

    kinds = [kind for kind, _, _ in seen]
    assert kinds.count("plan_paused") == 9
    assert kinds.count("plan_resumed") == 8
    assert kinds.count("plan_started") == 0, "we began watching mid-run; no start is invented"
    assert seen[-1] == ("plan_finished", "returned_to_dock", "west lawn plan")
    assert [reason for kind, reason, _ in seen if kind == "plan_paused"].count(
        "emergency_stop"
    ) == 1

    event = hass.states.get(entity_id(hass, "event", serial, "plan"))
    assert event is not None
    assert event.attributes["event_type"] == "plan_finished"
    assert event.attributes["reason"] == "returned_to_dock"
    assert event.attributes["plan"] == "west lawn plan"
    assert event.attributes["progress"] == 89.3
    assert "at" not in event.attributes

    assert value(hass, "sensor", serial, "plan_status") == "none"
    assert value(hass, "sensor", serial, "plan_progress") == "unknown"
    assert value(hass, "sensor", serial, "last_completed") == "unknown", (
        "89 percent and a trip home is not a completed run; 'every N days' must not reset"
    )
    ended = hass.states.get(entity_id(hass, "sensor", serial, "plan_status"))
    assert ended is not None
    assert ended.attributes["last_run_ended"] == "returned_to_dock"
    assert "plan_feedback" not in coordinator.feedback, "the run is over; take it off the card"

    assert "paused" in mower_states, "the emergency stop"
    assert "returning" in mower_states
    assert set(mower_states) <= {"mowing", "error", "paused", "returning", "docked"}
    assert "docked" not in mower_states[:-1], "a paused or faulted plan is never 'docked'"


async def test_a_completed_run_is_remembered_across_a_restart(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator, hass_storage: dict[str, Any]
) -> None:
    sim.plans = [{"id": 2, "name": "west lawn plan", "areaIds": [9]}]
    coordinator = loaded_entry.runtime_data.coordinator
    state = await replay(hass, coordinator, RUN)
    done, _ = state.with_frame({"StateMSG": {"on_going_planning": 5, "planning_paused": 0}}, 1.0)
    coordinator._on_state(done)
    await hass.async_block_till_done()
    await asyncio.sleep(0.05)
    assert value(hass, "sensor", coordinator.serial, "last_completed") != "unknown"

    assert await hass.config_entries.async_unload(loaded_entry.entry_id)
    stored = hass_storage[f"{DOMAIN}.plans.{sim.serial}"]["data"]
    assert list(stored["last_completed"]) == ["2"]
    assert await hass.config_entries.async_setup(loaded_entry.entry_id)
    await hass.async_block_till_done()
    assert value(hass, "sensor", sim.serial, "last_completed") != "unknown"


# -- the lawn mower entity and the controls


async def test_no_mower_head_no_lawn_mower(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    assert value(hass, "lawn_mower", sim.serial, "mower") == "unavailable"


async def test_controls_exist_only_for_verified_commands(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    registry = er.async_get(hass)
    keys = {
        e.unique_id.removeprefix(f"{sim.serial}_")
        for e in er.async_entries_for_config_entry(registry, loaded_entry.entry_id)
        if e.domain == "button"
    }
    assert keys == {"wake", "refresh", "return_to_dock", "resume"}, (
        "pause and stop have no capture yet, so they must not exist. They appear when "
        "commands.yaml marks them verified."
    )


async def test_return_to_dock_from_a_fault(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    with_mower(sim, planning_paused=7, error_code=902)
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    mower = entity_id(hass, "lawn_mower", sim.serial, "mower")
    state = hass.states.get(mower)
    assert state is not None
    assert state.state == "error"
    assert state.attributes["supported_features"] == 1 | 4, "start (resume) and dock; no pause yet"

    await hass.services.async_call("lawn_mower", "dock", {"entity_id": mower}, blocking=True)
    await hass.async_block_till_done()
    assert [name for name, _ in sim.log][-3:] == [
        "set_working_state",
        "get_controller",
        "cmd_recharge",
    ]
    assert hass.states.get(mower).state == "returning"  # type: ignore[union-attr]
    assert value(hass, "sensor", sim.serial, "fault") == "none"

    with pytest.raises(ServiceValidationError) as refused:
        await hass.services.async_call("lawn_mower", "dock", {"entity_id": mower}, blocking=True)
    assert refused.value.translation_key == "refused_already_returning"


async def test_resume_and_what_it_says_when_it_cannot(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    with_mower(sim)
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    mower = entity_id(hass, "lawn_mower", sim.serial, "mower")
    resume = entity_id(hass, "button", sim.serial, "resume")

    with pytest.raises(ServiceValidationError) as nothing:
        await hass.services.async_call("button", "press", {"entity_id": resume}, blocking=True)
    assert nothing.value.translation_key == "refused_nothing_to_resume"
    with pytest.raises(ServiceValidationError) as start:
        await hass.services.async_call(
            "lawn_mower", "start_mowing", {"entity_id": mower}, blocking=True
        )
    assert start.value.translation_key == "start_not_verified"
    assert [name for name, _ in sim.log if name in ("resume", "start_plan")] == [], (
        "a refused action must send nothing"
    )

    with_mower(sim, planning_paused=4)
    sim.awake = True
    sim.tick()
    await hass.async_block_till_done()
    assert hass.states.get(mower).state == "paused"  # type: ignore[union-attr]
    await hass.services.async_call(
        "lawn_mower", "start_mowing", {"entity_id": mower}, blocking=True
    )
    await hass.async_block_till_done()
    assert hass.states.get(mower).state == "mowing"  # type: ignore[union-attr]


async def test_the_phone_app_holding_control_is_explained(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    sim: Simulator,
) -> None:
    with_mower(sim, on_going_planning=1)
    sim.cmd_get_controller = lambda value: sim._feedback("get_controller", -1, "busy", "")  # type: ignore[method-assign]
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    dock = entity_id(hass, "button", sim.serial, "return_to_dock")
    with pytest.raises(HomeAssistantError) as refused:
        await hass.services.async_call("button", "press", {"entity_id": dock}, blocking=True)
    assert refused.value.translation_key == "controller_unavailable"
    assert "cmd_recharge" not in [name for name, _ in sim.log]


def test_every_refusal_has_its_sentence() -> None:
    """A refusal key the library can produce must never reach a person untranslated."""
    import inspect  # noqa: PLC0415
    import re  # noqa: PLC0415

    from yarbo_local import preflight  # noqa: PLC0415

    keys = set(re.findall(r'Refusal\(\s*"([a-z_]+)"', inspect.getsource(preflight)))
    strings = json.loads(
        (
            Path(__file__).parents[1] / "custom_components" / "yarbo_local" / "strings.json"
        ).read_text()
    )["exceptions"]
    assert keys, "no refusal keys found; did preflight.py change shape?"
    assert {f"refused_{k}" for k in keys} <= set(strings), sorted(keys)


def test_lifecycle_event_attributes_carry_no_empty_fields() -> None:
    from yarbo_local import EventKind  # noqa: PLC0415

    event = LifecycleEvent(EventKind.PAUSED, 1.0, "2-1", 2, reason="fault", fault_code=902)
    assert event.attributes() == {
        "at": 1.0,
        "run_id": "2-1",
        "plan_id": 2,
        "reason": "fault",
        "fault_code": 902,
    }
