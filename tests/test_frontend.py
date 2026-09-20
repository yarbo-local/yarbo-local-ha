"""The integration serves its own browser code and asks Home Assistant to load it."""

from __future__ import annotations

from unittest.mock import patch

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.yarbo_local import frontend
from custom_components.yarbo_local.const import DOMAIN


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
    with patch.object(frontend, "add_extra_js_url") as add:
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
