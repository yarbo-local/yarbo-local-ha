"""The obstacle log: replay of the West Lawn run, events, sensor, websocket, action, persistence."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any
from unittest.mock import patch

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.yarbo_local.const import DOMAIN
from yarbo_local import RobotState, Simulator

FIXTURE = Path(__file__).parent / "fixtures" / "mower-pro-ultrasonic-avoidance.jsonl"
SAMPLE = Path(__file__).parent / "fixtures" / "plan-feedback-sample.json"
EVENT = "event.yarbo_test_obstacle"
COUNT = "sensor.yarbo_test_obstacles_this_run"


def replay(coordinator: Any) -> None:
    state = RobotState(serial=coordinator.serial)
    for line in FIXTURE.read_text().splitlines():
        rec = json.loads(line)
        leaf = rec["topic"].rsplit("/", 1)[-1]
        if leaf == "DeviceMSG":
            state, _ = state.with_frame(rec["payload"], rec["t"])
            coordinator._on_state(state)
        elif leaf in ("plan_feedback", "cloud_points_feedback"):
            coordinator._on_topic(leaf, rec["payload"])


async def test_grass_next_to_the_strip_is_not_logged(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    sim: Simulator,
) -> None:
    """The West Lawn window has many close ultrasonic readings and no real obstacles."""
    sim.plans = [{"id": 2, "name": "west lawn plan", "areaIds": [9]}]
    coordinator = loaded_entry.runtime_data.coordinator
    fired: list[str] = []
    coordinator.add_obstacle_listener(lambda kind, attrs: fired.append(kind))
    replay(coordinator)
    await asyncio.sleep(0.05)  # the plan name is read in the background
    await hass.async_block_till_done()

    run = coordinator.obstacles.latest
    assert run is not None
    assert run.plan_id == 2
    assert run.plan_name == "west lawn plan"
    assert run.obstacle_count == 0
    assert fired == []
    assert hass.states.get(EVENT).state == "unknown"
    assert hass.states.get(COUNT).state == "0"

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "yarbo_local/obstacles", "entry_id": loaded_entry.entry_id}
    )
    result = (await client.receive_json())["result"]
    assert result["runs"][0]["id"] == run.id
    assert result["run"]["barriers"] == []


async def test_stored_ultrasonic_detections_are_removed_on_setup(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: Any,
    mock_resolve: Any,
    hass_storage: dict[str, Any],
    sim: Simulator,
) -> None:
    hass_storage[f"{DOMAIN}.obstacles.{sim.serial}"] = {
        "version": 1,
        "key": f"{DOMAIN}.obstacles.{sim.serial}",
        "data": {
            "runs": [
                {
                    "id": "2-1",
                    "plan_id": 2,
                    "area_ids": [9],
                    "started": 1.0,
                    "ended": 2.0,
                    "detections": [
                        {"t": 1, "source": "ultrasonic_right", "point": [1, 2], "robot": [0, 0, 0]}
                    ],
                    "barriers": [{"points": [[1, 2]], "first_seen": 1, "last_seen": 1}],
                }
            ]
        },
    }
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    coordinator = config_entry.runtime_data.coordinator
    assert coordinator.obstacles.latest.obstacle_count == 1
    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()
    saved = hass_storage[f"{DOMAIN}.obstacles.{sim.serial}"]["data"]
    assert "detections" not in saved["runs"][0]
    assert len(saved["runs"][0]["barriers"]) == 1


async def test_obstacle_log_survives_a_reload(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    sample = json.loads(SAMPLE.read_text())
    replay(coordinator)
    coordinator._on_topic("plan_feedback", sample["plan_feedback"])
    for message in sample["cloud_points_feedback"]:
        coordinator._on_topic("cloud_points_feedback", message)
    await asyncio.sleep(0.05)
    await hass.async_block_till_done()
    logged = coordinator.obstacles.to_dict()
    assert logged["runs"][-1]["barriers"]

    assert await hass.config_entries.async_reload(loaded_entry.entry_id)
    await hass.async_block_till_done()
    assert loaded_entry.state is ConfigEntryState.LOADED
    assert loaded_entry.runtime_data.coordinator.obstacles.to_dict() == logged


async def test_barriers_and_live_stream(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    sample = json.loads(SAMPLE.read_text())
    coordinator = loaded_entry.runtime_data.coordinator
    client = await hass_ws_client(hass)
    with patch("custom_components.yarbo_local.websocket_api.LIVE_MIN_INTERVAL", 0.0):
        await client.send_json_auto_id(
            {"type": "yarbo_local/subscribe_live", "entry_id": loaded_entry.entry_id}
        )
        assert (await client.receive_json())["success"]
        coordinator._on_topic("plan_feedback", sample["plan_feedback"])
        for message in sample["cloud_points_feedback"]:
            coordinator._on_topic("cloud_points_feedback", message)
        await hass.async_block_till_done()
        barriers = len(coordinator.obstacles.current.barriers)
        assert barriers > 0
        # The robot's list going empty does not remove logged obstacles.
        coordinator._on_topic(
            "cloud_points_feedback", {"rotate_rad": 0.0, "tmp_barrier_points": []}
        )
        assert len(coordinator.obstacles.current.barriers) == barriers

        events = []
        while True:
            try:
                events.append((await asyncio.wait_for(client.receive_json(), 0.3))["event"])
            except TimeoutError:
                break
        last = [e for e in events if e.get("leaf") == "obstacles"][-1]
        assert len(last["data"]["barriers"]) == barriers
        assert hass.states.get(EVENT).attributes["event_type"] == "barrier"

        # Stale return route expires once the robot is not returning.
        coordinator._on_topic("recharge_feedback", {"path": [{"x": 0, "y": 0}, {"x": 1, "y": 1}]})
        coordinator._on_state(coordinator.data)
        assert "recharge_feedback" not in coordinator.feedback


async def test_get_obstacles_action_returns_reported_obstacles(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    sample = json.loads(SAMPLE.read_text())
    coordinator = loaded_entry.runtime_data.coordinator
    coordinator._on_topic("plan_feedback", sample["plan_feedback"])
    for message in sample["cloud_points_feedback"]:
        coordinator._on_topic("cloud_points_feedback", message)
    await asyncio.sleep(0.05)
    response = await hass.services.async_call(
        DOMAIN,
        "get_obstacles",
        {"config_entry_id": loaded_entry.entry_id},
        blocking=True,
        return_response=True,
    )
    run = coordinator.obstacles.latest
    assert response["run"]["id"] == run.id
    assert len(response["run"]["barriers"]) == run.obstacle_count > 0
    assert len(response["geojson"]["features"]) == run.obstacle_count
