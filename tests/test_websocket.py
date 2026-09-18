"""Websocket commands the card uses."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from yarbo_local import Simulator

TRACKER = "device_tracker.yarbo_test_location"


async def test_map_command(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "yarbo_local/map", "entity_id": TRACKER})
    msg = await client.receive_json()
    assert msg["success"], msg
    result = msg["result"]
    assert [(z["family"], z["name"], z["closed"]) for z in result["zones"]] == [
        ("areas", "Area 1", True),
        ("pathways", "Pathway 1", False),
    ]
    assert len(result["zones"][0]["points"]) == 25
    assert result["docks"][0]["straight_phi"] is not None
    assert "ref" not in str(result)

    await client.send_json_auto_id({"type": "yarbo_local/map", "entity_id": "sensor.nope"})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "not_found"


async def test_subscribe_live_streams_pose_map_and_feedback(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    sim: Simulator,
) -> None:
    client = await hass_ws_client(hass)
    with patch("custom_components.yarbo_local.websocket_api.LIVE_MIN_INTERVAL", 0.0):
        await client.send_json_auto_id(
            {"type": "yarbo_local/subscribe_live", "entry_id": loaded_entry.entry_id}
        )
        assert (await client.receive_json())["success"]
        first = await client.receive_json()
        assert first["event"]["type"] == "live"
        assert first["event"]["x"] is not None
        assert first["event"]["connected"] is True

        # The robot wakes and starts moving.
        sim.awake = True
        sim.woke_at = sim.now()
        sim.snapshot = {**sim.snapshot, "CombinedOdom": {"x": 5.0, "y": -10.0, "phi": 1.0}}
        sim.tick()
        await hass.async_block_till_done()
        events = []
        for _ in range(3):
            events.append((await asyncio.wait_for(client.receive_json(), 1.0))["event"])
            if any(e.get("x") == 5.0 for e in events):
                break
        assert any(e["type"] == "live" and e["x"] == 5.0 and e["awake"] for e in events)

        coordinator = loaded_entry.runtime_data.coordinator
        coordinator._on_topic("plan_feedback", {"planId": 1, "cleanPathProgress": []})
        wanted = {
            "type": "feedback",
            "leaf": "plan_feedback",
            "data": {"planId": 1, "cleanPathProgress": []},
        }
        got: list[dict[str, Any]] = []
        while wanted not in got and len(got) < 10:
            got.append((await asyncio.wait_for(client.receive_json(), 1.0))["event"])
        assert wanted in got
        assert any(e.get("leaf") == "obstacles" for e in got)  # a plan run starts the log

        with patch("custom_components.yarbo_local.coordinator.MAP_REFRESH_DELAY", 0.01):
            sim.edit_map(
                "nogozones",
                {
                    "id": 9,
                    "name": "Bed",
                    "range": [{"x": 1, "y": 1}, {"x": 2, "y": 1}, {"x": 2, "y": 2}],
                },
                command="save_nogozone",
            )
            await asyncio.sleep(0.1)
            await hass.async_block_till_done()
        seen = set()
        for _ in range(4):
            try:
                seen.add((await asyncio.wait_for(client.receive_json(), 0.5))["event"]["type"])
            except TimeoutError:
                break
        assert "map_changed" in seen


async def test_background_roundtrip_and_admin_only(
    hass: HomeAssistant,
    loaded_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    background = {
        "image": "/local/yarbo/aerial.jpg",
        "transform": {"a": 0.05, "b": 0.01, "e": -20.0, "f": -3.0},
        "width": 1200,
        "height": 900,
        "opacity": 0.7,
    }
    admin = await hass_ws_client(hass)
    await admin.send_json_auto_id({"type": "yarbo_local/background/get", "entity_id": TRACKER})
    assert (await admin.receive_json())["result"] is None

    await admin.send_json_auto_id(
        {"type": "yarbo_local/background/save", "entity_id": TRACKER, "background": background}
    )
    assert (await admin.receive_json())["success"]
    await admin.send_json_auto_id({"type": "yarbo_local/background/get", "entity_id": TRACKER})
    assert (await admin.receive_json())["result"] == background

    await admin.send_json_auto_id(
        {
            "type": "yarbo_local/background/save",
            "entity_id": TRACKER,
            "background": {**background, "image": "javascript:alert(1)"},
        }
    )
    assert not (await admin.receive_json())["success"]

    reader = await hass_ws_client(hass, hass_read_only_access_token)
    await reader.send_json_auto_id(
        {"type": "yarbo_local/background/save", "entity_id": TRACKER, "background": background}
    )
    msg = await reader.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"
    await reader.send_json_auto_id({"type": "yarbo_local/background/get", "entity_id": TRACKER})
    assert (await reader.receive_json())["result"] == background

    await admin.send_json_auto_id({"type": "yarbo_local/background/clear", "entity_id": TRACKER})
    assert (await admin.receive_json())["success"]
