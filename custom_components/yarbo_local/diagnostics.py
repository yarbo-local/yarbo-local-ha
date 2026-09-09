"""Diagnostics with the location, identity and Wi-Fi details redacted."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.const import CONF_HOST, CONF_MAC
from homeassistant.core import HomeAssistant

from . import YarboConfigEntry
from .const import CONF_DNS_NAME, CONF_SERIAL

TO_REDACT = {
    CONF_HOST,
    CONF_MAC,
    CONF_SERIAL,
    CONF_DNS_NAME,
    "unique_id",
    "title",
    "serial",
    # position and site
    "gngga",
    "gnrmc",
    "rtk_base_data",
    "latitude",
    "longitude",
    "lat_lon_hight",
    "ref",
    # network and identity
    "base_name",
    "BaseName",
    "ssid",
    "wifi_name",
    "password",
    "psk",
    "NetMSG",
    "iccid",
    "lte_iccid",
    "imei",
    "body_sn",
    "head_sn",
    "sn",
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: YarboConfigEntry
) -> dict[str, Any]:
    coordinator = entry.runtime_data.coordinator
    state = coordinator.data
    data = {
        "entry": {
            "data": dict(entry.data),
            "options": dict(entry.options),
            "unique_id": entry.unique_id,
        },
        "connection": {
            "connected": coordinator.connected,
            "last_update_success": coordinator.last_update_success,
        },
        "state": {
            "firmware": state.firmware,
            "awake": state.awake,
            "activity": state.activity.value,
            "head": state.head_name,
            "last_frame_at": state.last_frame_at,
            "last_heartbeat_at": state.last_heartbeat_at,
        },
        "raw": dict(state.raw),
    }
    return async_redact_data(data, TO_REDACT)
