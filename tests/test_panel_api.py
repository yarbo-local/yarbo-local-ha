"""The Yard panel's commands, with the robot in reach and out of it."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.yarbo_local import tracks
from custom_components.yarbo_local.tracks import TrackLog
from yarbo_local import Simulator
from yarbo_local.simulator import MOWER_AREA_PARAMS_DEFAULT

from .conftest import Site


async def _ask(client, **message):
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def test_yard_reads_plans_runs_and_robot(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    sim: Simulator,
) -> None:
    sim.plans = [{"id": 7, "name": "West", "areaIds": [1], "selfOrder": False}]
    client = await hass_ws_client(hass)
    msg = await _ask(client, type="yarbo_local/yard", entry_id=loaded_entry.entry_id)
    assert msg["success"], msg
    result = msg["result"]
    assert result["reachable"] is True
    assert result["plans"] == [{"id": 7, "name": "West", "area_ids": [1]}]
    assert result["robot"]["firmware"]
    assert result["runs"] == []


async def test_yard_answers_from_disk_when_the_robot_is_out_of_reach(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: MagicMock,
    mock_resolve: AsyncMock,
    site: Site,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict,
) -> None:
    site.dead.add("192.168.50.184")
    serial = config_entry.unique_id
    hass_storage[f"yarbo_local.history_runs.{serial}"] = {
        "version": 1,
        "key": f"yarbo_local.history_runs.{serial}",
        "data": {"runs": [{"id": "1-1", "plan": "West", "started_at": 100.0, "ended_at": 200.0}]},
    }
    hass_storage[f"yarbo_local.site.{serial}"] = {
        "version": 1,
        "key": f"yarbo_local.site.{serial}",
        "data": {
            "plans": [{"id": 1, "name": "West", "area_ids": [1]}],
            "map": {"zones": [], "docks": [], "bounds": None, "title": "Stored"},
            "last_seen": 150.0,
        },
    }
    config_entry.add_to_hass(hass)
    await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    assert config_entry.state is not ConfigEntryState.LOADED

    client = await hass_ws_client(hass)
    msg = await _ask(client, type="yarbo_local/yard", entry_id=config_entry.entry_id)
    assert msg["success"], msg
    assert msg["result"]["reachable"] is False
    assert msg["result"]["runs"][0]["plan"] == "West"
    assert msg["result"]["plans"][0]["name"] == "West"
    assert msg["result"]["last_seen"] == 150.0

    stored = await _ask(client, type="yarbo_local/map", entry_id=config_entry.entry_id)
    assert stored["result"]["title"] == "Stored"

    await client.send_json_auto_id(
        {"type": "yarbo_local/subscribe_live", "entry_id": config_entry.entry_id}
    )
    assert (await client.receive_json())["success"]
    event = (await client.receive_json())["event"]
    assert event["connected"] is False
    assert event["activity"] == "offline"

    refused = await _ask(
        client, type="yarbo_local/command", entry_id=config_entry.entry_id, action="dock"
    )
    assert refused["error"]["code"] == "not_found"


async def test_start_needs_a_plan_and_stop_reaches_the_robot(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
) -> None:
    client = await hass_ws_client(hass)
    no_plan = await _ask(
        client, type="yarbo_local/command", entry_id=loaded_entry.entry_id, action="start"
    )
    assert no_plan["error"]["code"] == "invalid"
    bad = await _ask(
        client, type="yarbo_local/command", entry_id=loaded_entry.entry_id, action="drive"
    )
    assert bad["error"]["code"] == "invalid_format"


async def test_commands_are_for_administrators(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    client = await hass_ws_client(hass, hass_read_only_access_token)
    msg = await _ask(
        client, type="yarbo_local/command", entry_id=loaded_entry.entry_id, action="stop"
    )
    assert msg["error"]["code"] == "unauthorized"
    saved = await _ask(
        client,
        type="yarbo_local/area_settings/save",
        entry_id=loaded_entry.entry_id,
        area_id=1,
        changes={"edge_circles": 1},
    )
    assert saved["error"]["code"] == "unauthorized"


async def test_preview_returns_paths_by_area(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    sim: Simulator,
) -> None:
    sim.plans = [{"id": 7, "name": "West", "areaIds": [1], "selfOrder": False}]
    client = await hass_ws_client(hass)
    msg = await _ask(client, type="yarbo_local/preview", entry_id=loaded_entry.entry_id, plan_id=7)
    assert msg["success"], msg
    assert [(p["area_id"], p["kind"]) for p in msg["result"]["paths"]] == [(1, "fill"), (1, "edge")]
    assert msg["result"]["paths"][0]["points"][1] == [1.0, 0.0]


async def test_settings_save_reads_back_and_rejects_unknown_values(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    sim: Simulator,
) -> None:
    client = await hass_ws_client(hass)
    area = 1
    read = await _ask(
        client, type="yarbo_local/area_settings", entry_id=loaded_entry.entry_id, area_id=area
    )
    assert read["success"], read
    unknown = await _ask(
        client,
        type="yarbo_local/area_settings/save",
        entry_id=loaded_entry.entry_id,
        area_id=area,
        changes={"blade_speed": 3},
    )
    assert unknown["error"]["code"] == "invalid_format"
    direction = await _ask(
        client,
        type="yarbo_local/area_settings/save",
        entry_id=loaded_entry.entry_id,
        area_id=area,
        changes={"edge_direction_mode": 1},
    )
    assert direction["error"]["code"] == "invalid_format"


async def test_settings_save_writes_and_returns_the_old_values(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    sim: Simulator,
) -> None:
    sim.mower_area_params[1] = {**MOWER_AREA_PARAMS_DEFAULT, "id": 1}
    client = await hass_ws_client(hass)
    before = await _ask(
        client, type="yarbo_local/area_settings", entry_id=loaded_entry.entry_id, area_id=1
    )
    assert before["success"], before
    wanted = 0 if before["result"]["edge_circles"] else 1
    saved = await _ask(
        client,
        type="yarbo_local/area_settings/save",
        entry_id=loaded_entry.entry_id,
        area_id=1,
        changes={"edge_circles": wanted},
    )
    assert saved["success"], saved
    assert saved["result"]["after"]["edge_circles"] == wanted
    assert saved["result"]["before"]["edge_circles"] == before["result"]["edge_circles"]


async def test_settings_are_locked_while_a_plan_runs(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    sim: Simulator,
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    with patch.object(type(coordinator.data), "plan_running", True):
        client = await hass_ws_client(hass)
        msg = await _ask(
            client,
            type="yarbo_local/area_settings/save",
            entry_id=loaded_entry.entry_id,
            area_id=1,
            changes={"edge_circles": 1},
        )
    assert msg["error"]["code"] == "busy"


async def test_the_map_and_plans_are_kept_for_when_the_robot_is_gone(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict,
    sim: Simulator,
) -> None:
    sim.plans = [{"id": 7, "name": "West", "areaIds": [1], "selfOrder": False}]
    client = await hass_ws_client(hass)
    assert (await _ask(client, type="yarbo_local/yard", entry_id=loaded_entry.entry_id))["success"]
    coordinator = loaded_entry.runtime_data.coordinator
    coordinator.site_map = None  # the next read counts as a change
    await coordinator.async_refresh_map()
    await hass.async_block_till_done()
    stored = hass_storage[f"yarbo_local.site.{sim.serial}"]["data"]
    assert stored["plans"][0]["name"] == "West"
    assert stored["map"]["zones"]
    assert "ref" not in stored["map"]


class _Frame:
    def __init__(self, at: float, x: float, fix: int = 4) -> None:
        self.last_frame_at = at
        self.position = (x, 0.0, 0.0)
        self.fix = MagicMock(quality=fix)
        self.halow_rssi = -60
        self.battery = 80


async def test_a_track_keeps_movement_and_fix_changes_only(hass: HomeAssistant) -> None:
    log = TrackLog(hass, "SN")
    log.on_state(_Frame(1000.0, 0.0), 1000.0)
    log.on_state(_Frame(1001.0, 0.1), 1000.0)  # too close and too soon
    log.on_state(_Frame(1002.0, 1.0), 1000.0)
    log.on_state(_Frame(1003.0, 1.0, fix=5), 1000.0)  # same place, the fix fell
    log.on_state(_Frame(1020.0, 1.0, fix=5), 1000.0)  # still there, some time later
    track = await log.async_get(1000.0)
    assert track is not None
    assert [p[0] for p in track["points"]] == [0.0, 2.0, 3.0, 20.0]
    assert track["points"][2] == [3.0, 1.0, 0.0, 5, -60, 80]


async def test_tracks_are_pruned_and_a_finished_run_can_be_read_back(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    log = TrackLog(hass, "SN")
    log.on_state(_Frame(500.0, 0.0), 500.0)
    log.on_state(_Frame(501.0, 5.0), None)
    await hass.async_block_till_done()
    await log.async_save()
    assert log.keys == [500]
    for key in range(1000, 1000 + tracks.MAX_RUNS + 2):
        log.on_state(_Frame(float(key), 0.0), float(key))
    await hass.async_block_till_done()
    assert len(log.keys) == tracks.MAX_RUNS
    assert 500 not in log.keys
    assert await log.async_get(500.0) is None
