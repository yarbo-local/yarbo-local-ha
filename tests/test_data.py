"""The Settings page's data health: sizes, retention, clearing, administrators only."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import patch

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.yarbo_local.data import DATA_MANAGER, async_get_manager

from .test_history import T0, F, finished, started


def _seed(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """One finished run, one charge, one obstacle run and one completed plan."""
    coordinator = entry.runtime_data.coordinator
    history = coordinator.history
    history.on_lifecycle(started(T0), "west lawn plan")
    history.on_state(F(T0))
    history.on_state(F(T0 + 1))
    history.on_lifecycle(finished(T0 + 2), None)
    history.on_state(F(T0 + 3, charging=True, battery=50))
    history.on_state(F(T0 + 4, charging=False, battery=51))
    coordinator.runs.plans.last_completed[2] = T0


async def test_health_reports_every_dataset(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict[str, Any],
) -> None:
    _seed(hass, loaded_entry)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "yarbo_local/data/health"})
    msg = await client.receive_json()
    assert msg["success"], msg
    result = msg["result"]
    serial = loaded_entry.runtime_data.coordinator.serial
    assert result["robots"] == {serial: loaded_entry.title}
    by = {(d["dataset"], d["serial"]): d for d in result["datasets"]}
    assert by[("runs", serial)]["records"] == 1
    assert hass_storage[f"yarbo_local.history_runs.{serial}"]["data"]["runs"]  # flushed first
    assert by[("runs", serial)]["retention"] == {
        "unit": "days",
        "value": 0,
        "choices": [30, 90, 365, 730, 0],
    }
    assert by[("charges", serial)]["records"] == 1
    assert by[("obstacles", serial)]["retention"]["value"] == 30
    assert by[("plans", serial)]["records"] == 1
    assert by[("backgrounds", None)]["records"] == 0
    assert result["total_bytes"] == sum(d["bytes"] for d in result["datasets"])
    assert result["recorder_keep_days"] is None  # no recorder in this test


async def test_retention_is_saved_and_applied(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    coordinator.history.runs.append({"started_at": 0.0, "ended_at": 0.0})  # 1970, long gone
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "yarbo_local/data/retention", "dataset": "runs", "value": 30}
    )
    msg = await client.receive_json()
    assert msg["success"], msg
    assert msg["result"]["runs_days"] == 30
    assert coordinator.history.runs == []

    await client.send_json_auto_id(
        {"type": "yarbo_local/data/retention", "dataset": "obstacles", "value": 10}
    )
    assert (await client.receive_json())["success"]
    assert coordinator.runs.obstacles.max_runs == 10

    await client.send_json_auto_id(
        {"type": "yarbo_local/data/retention", "dataset": "obstacles", "value": 0}
    )
    assert (await client.receive_json())["error"]["code"] == "invalid"

    # a fresh manager reads the saved settings back
    manager = hass.data.pop(DATA_MANAGER)
    await manager._store.async_save({"runs_days": 30, "charges_days": 0, "obstacle_runs": 10})
    again = await async_get_manager(hass)
    assert again.retention.runs_days == 30


async def test_clear_needs_confirmation_and_clears(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    _seed(hass, loaded_entry)
    coordinator = loaded_entry.runtime_data.coordinator
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "yarbo_local/data/clear", "dataset": "runs"})
    assert (await client.receive_json())["error"]["code"] == "invalid_format"

    for dataset, expected in (
        ("runs", 1),
        ("charges", 1),
        ("plans", 1),
        ("obstacles", 0),
        ("backgrounds", 0),
    ):
        await client.send_json_auto_id(
            {
                "type": "yarbo_local/data/clear",
                "dataset": dataset,
                "serial": coordinator.serial,
                "confirm": True,
            }
        )
        msg = await client.receive_json()
        assert msg["success"], msg
        assert msg["result"] == {"cleared": expected}, dataset
    assert coordinator.history.runs == []
    assert coordinator.runs.plans.last_completed == {}


async def test_data_commands_are_for_administrators(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    for msg in (
        {"type": "yarbo_local/data/health"},
        {"type": "yarbo_local/data/retention", "dataset": "runs", "value": 30},
        {"type": "yarbo_local/data/clear", "dataset": "runs", "confirm": True},
    ):
        await reader.send_json_auto_id(msg)
        assert (await reader.receive_json())["error"]["code"] == "unauthorized"


async def test_unloading_forgets_the_robot(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    serial = loaded_entry.runtime_data.coordinator.serial
    assert serial in hass.data[DATA_MANAGER].robots
    await hass.config_entries.async_unload(loaded_entry.entry_id)
    assert serial not in hass.data[DATA_MANAGER].robots


async def test_recorder_keep_days_is_reported(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    manager = hass.data[DATA_MANAGER]
    hass.config.components.add("recorder")

    class Recorder:
        keep_days = 10

    with patch("homeassistant.helpers.recorder.get_instance", return_value=Recorder()):
        assert manager._recorder_keep_days() == 10


async def test_sizes_are_read_from_the_storage_folder(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, tmp_path: Path
) -> None:
    manager = hass.data[DATA_MANAGER]
    serial = loaded_entry.runtime_data.coordinator.serial
    (tmp_path / ".storage").mkdir()
    (tmp_path / ".storage" / f"yarbo_local.history_runs.{serial}").write_text("x" * 1234)
    hass.config.config_dir = str(tmp_path)
    sizes = manager._sizes()
    assert sizes[f"yarbo_local.history_runs.{serial}"] == 1234
    assert sizes[f"yarbo_local.obstacles.{serial}"] == 0
