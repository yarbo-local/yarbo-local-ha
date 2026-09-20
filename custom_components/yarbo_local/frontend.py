"""Serve the integration's own browser code and have Home Assistant load it.

``www/`` holds what ``frontend/`` builds: one small entry file, loaded on every
page so that the map card and the pop-ups exist wherever an entity is tapped, and
the drawing code it fetches on first use. Nothing else reaches the browser, and
nothing here talks to the robot.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.util.hass_dict import HassKey

from .const import DOMAIN

URL_BASE = f"/{DOMAIN}/www"
ENTRY = "yarbo-local.js"
WWW = Path(__file__).parent / "www"

DATA_REGISTERED: HassKey[bool] = HassKey(f"{DOMAIN}_frontend")


def _fingerprint() -> str:
    """Changes whenever the build does, so a browser never runs a stale entry file."""
    return hashlib.sha256((WWW / ENTRY).read_bytes()).hexdigest()[:12]


async def async_register(hass: HomeAssistant) -> None:
    """Once per Home Assistant, however many robots there are."""
    if hass.data.get(DATA_REGISTERED):
        return
    hass.data[DATA_REGISTERED] = True
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(WWW), cache_headers=True)]
    )
    if "frontend" not in hass.config.components:
        return  # a Home Assistant without a user interface has no page to load it on
    fingerprint = await hass.async_add_executor_job(_fingerprint)
    add_extra_js_url(hass, f"{URL_BASE}/{ENTRY}?v={fingerprint}")
