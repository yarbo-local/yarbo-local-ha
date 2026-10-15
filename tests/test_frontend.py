"""The integration serves its own browser code and asks Home Assistant to load it."""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.yarbo_local import frontend, sensor
from custom_components.yarbo_local.const import ATTR_MORE_INFO, DOMAIN, MORE_INFO_ELEMENT
from custom_components.yarbo_local.sensor import YarboSensor


def test_the_build_is_in_the_package() -> None:
    """HACS installs the folder as it is in the repository, so the build has to be there."""
    entry = frontend.WWW / frontend.ENTRY
    assert entry.is_file()
    views = list(frontend.WWW.glob("yarbo-local-view-*.js"))
    assert views, "the entry file has nothing to fetch"
    assert entry.stat().st_size < 8_000, "this file loads on every page; keep it a loader"
    for view in views:
        assert view.name in entry.read_text() or any(
            view.name in other.read_text() for other in views if other != view
        ), f"{view.name} is left over from an older build"


async def test_files_are_served(hass: HomeAssistant, hass_client: ClientSessionGenerator) -> None:
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_client()
    response = await client.get(f"{frontend.URL_BASE}/{frontend.ENTRY}")
    assert response.status == 200
    assert "yarbo-local-card" in await response.text()


async def test_home_assistant_is_told_to_load_the_entry_once(hass: HomeAssistant) -> None:
    hass.config.components.add("frontend")
    with (
        patch.object(frontend, "add_extra_js_url") as add,
        patch.object(frontend.panel_custom, "async_register_panel"),
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        await frontend.async_register(hass)  # a second robot changes nothing
    add.assert_called_once()
    url = add.call_args.args[1]
    assert url.startswith(f"{frontend.URL_BASE}/{frontend.ENTRY}?v=")
    assert len(url.rsplit("=", 1)[1]) == 12


async def test_without_a_user_interface_nothing_is_loaded(hass: HomeAssistant) -> None:
    with patch.object(frontend, "add_extra_js_url") as add:
        assert await async_setup_component(hass, DOMAIN, {})
    add.assert_not_called()


async def test_no_sensor_opens_our_popup_yet(
    hass: HomeAssistant, loaded_entry: MockConfigEntry
) -> None:
    """The battery's "hello world" pop-up was a demo; no pop-up has a body of ours yet."""
    for state in hass.states.async_all("sensor"):
        assert ATTR_MORE_INFO not in state.attributes, state.entity_id


async def test_a_sensor_can_open_our_popup(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: MagicMock,
    mock_resolve: AsyncMock,
) -> None:
    """A sensor that asks for our pop-up says so in an attribute that is not recorded."""
    sensors = tuple(replace(d, our_popup=True) if d.key == "battery" else d for d in sensor.SENSORS)
    config_entry.add_to_hass(hass)
    with patch.object(sensor, "SENSORS", sensors):
        assert await hass.config_entries.async_setup(config_entry.entry_id)
        await hass.async_block_till_done()
    battery = hass.states.get("sensor.yarbo_test_battery")
    assert battery.attributes[ATTR_MORE_INFO] == MORE_INFO_ELEMENT
    assert ATTR_MORE_INFO not in hass.states.get("sensor.yarbo_test_activity").attributes
    assert ATTR_MORE_INFO in YarboSensor._unrecorded_attributes


async def test_the_yard_page_is_registered_once(hass: HomeAssistant) -> None:
    hass.config.components.add("frontend")
    with (
        patch.object(frontend, "add_extra_js_url"),
        patch.object(frontend.panel_custom, "async_register_panel") as panel,
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        await frontend.async_register(hass)
    panel.assert_called_once()
    kwargs = panel.call_args.kwargs
    assert kwargs["frontend_url_path"] == "yard"
    assert kwargs["webcomponent_name"] == "yarbo-local-panel"
    assert kwargs["require_admin"] is False
    assert kwargs["module_url"].startswith(f"{frontend.URL_BASE}/{frontend.ENTRY}?v=")
