"""Map image, get_map action, refresh after app edits."""

from __future__ import annotations

import asyncio
from http import HTTPStatus
from unittest.mock import patch

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.yarbo_local.const import DOMAIN
from custom_components.yarbo_local.diagnostics import async_get_config_entry_diagnostics
from custom_components.yarbo_local.map_render import render_svg
from yarbo_local import RobotState, Simulator
from yarbo_local.models import parse_site_map

IMAGE = "image.yarbo_test_map"


async def test_map_image_shows_the_driveway(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, hass_client: ClientSessionGenerator
) -> None:
    state = hass.states.get(IMAGE)
    assert state is not None
    assert state.state != "unavailable"
    client = await hass_client()
    resp = await client.get(f"/api/image_proxy/{IMAGE}")
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Content-Type"].startswith("image/svg+xml")
    body = await resp.text()
    assert body.startswith("<svg")
    assert "Area 1" in body
    assert body.count("<polygon") == 1
    assert body.count("<polyline") == 1


async def test_get_map_action(hass: HomeAssistant, loaded_entry: MockConfigEntry) -> None:
    response = await hass.services.async_call(
        DOMAIN,
        "get_map",
        {"config_entry_id": loaded_entry.entry_id},
        blocking=True,
        return_response=True,
    )
    assert response is not None
    zones = response["summary"]["zones"]
    assert [(z["family"], z["name"]) for z in zones] == [
        ("areas", "Area 1"),
        ("pathways", "Pathway 1"),
    ]
    assert zones[0]["area_m2"] == 126.4
    kinds = sorted(f["geometry"]["type"] for f in response["geojson"]["features"])
    assert kinds == ["LineString", "Point", "Polygon"]

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            "get_map",
            {"config_entry_id": "nope"},
            blocking=True,
            return_response=True,
        )


async def test_app_edit_refreshes_map_and_image(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    coordinator = loaded_entry.runtime_data.coordinator
    assert coordinator.site_map is not None
    assert coordinator.site_map.nogozones == []
    before = hass.states.get(IMAGE).state

    area = coordinator.site_map.areas[0]
    nogo = {
        "id": 3,
        "name": "Flower bed",
        "type": 0,
        "enable": True,
        "range": [
            {"x": 2.0, "y": -5.0, "phi": 0.0},
            {"x": 4.0, "y": -5.0, "phi": 0.0},
            {"x": 4.0, "y": -7.0, "phi": 0.0},
        ],
        "ref": {"latitude": area.ref[0], "longitude": area.ref[1]},
    }
    with patch("custom_components.yarbo_local.coordinator.MAP_REFRESH_DELAY", 0.01):
        sim.edit_map("nogozones", nogo, command="save_nogozone")
        await asyncio.sleep(0.1)
        await hass.async_block_till_done()

    assert [z.name for z in coordinator.site_map.nogozones] == ["Flower bed"]
    assert hass.states.get(IMAGE).state != before


async def test_diagnostics_include_map_summary_without_coordinates(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    diag = await async_get_config_entry_diagnostics(hass, loaded_entry)
    assert diag["map"]["zones"][0]["name"] == "Area 1"
    assert "ref" not in str(diag["map"])


def test_render_without_map_or_pose() -> None:
    svg = render_svg(None, None)
    assert svg.startswith("<svg")
    assert "No areas mapped yet" in svg
    empty = render_svg(parse_site_map({}), RobotState())
    assert "No areas mapped yet" in empty


def test_render_escapes_names() -> None:
    site = parse_site_map(
        {
            "areas": [
                {
                    "id": 1,
                    "name": "Front <&> back",
                    "range": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 5}],
                    "ref": {"latitude": 10.0, "longitude": 10.0},
                }
            ]
        }
    )
    svg = render_svg(site, None)
    assert "Front &lt;&amp;&gt; back" in svg
