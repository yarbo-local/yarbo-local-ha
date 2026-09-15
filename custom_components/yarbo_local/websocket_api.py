"""Websocket commands for the dashboard card.

``yarbo_local/map`` returns the stored map in the robot's metric frame (metres,
x west, y north). ``yarbo_local/subscribe_live`` streams the pose and status at
most twice a second, plus map-changed and feedback events. The aerial-image
alignment is stored server-side so every dashboard and device shares it; only
admins can change it.
"""

from __future__ import annotations

from collections.abc import Callable
import time
from typing import Any

from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.const import ERR_NOT_FOUND
from homeassistant.components.websocket_api.decorators import (
    async_response,
    require_admin,
    websocket_command,
)
from homeassistant.components.websocket_api.messages import event_message
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
import voluptuous as vol

from .const import DOMAIN
from .coordinator import YarboCoordinator

LIVE_MIN_INTERVAL = 0.5
STORE_VERSION = 1
DATA_BACKGROUNDS = f"{DOMAIN}_backgrounds"

TARGET: dict[str | vol.Marker, Any] = {
    vol.Optional("entity_id"): str,
    vol.Optional("entry_id"): str,
}


def async_setup_websocket(hass: HomeAssistant) -> None:
    for command in (
        ws_map,
        ws_obstacles,
        ws_subscribe_live,
        ws_background_get,
        ws_background_save,
        ws_background_clear,
    ):
        async_register_command(hass, command)


def _entry(hass: HomeAssistant, msg: dict[str, Any]) -> ConfigEntry | None:
    entry_id = msg.get("entry_id")
    if entity_id := msg.get("entity_id"):
        registry_entry = er.async_get(hass).async_get(entity_id)
        if registry_entry is None or registry_entry.platform != DOMAIN:
            return None
        entry_id = registry_entry.config_entry_id
    if not entry_id:
        return None
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN or entry.state is not ConfigEntryState.LOADED:
        return None
    return entry


def _not_found(connection: ActiveConnection, msg: dict[str, Any]) -> None:
    connection.send_error(msg["id"], ERR_NOT_FOUND, "No loaded Yarbo Local robot for that target")


def map_payload(entry: ConfigEntry, coordinator: YarboCoordinator) -> dict[str, Any]:
    site = coordinator.site_map
    zones: list[dict[str, Any]] = []
    docks: list[dict[str, Any]] = []
    if site is not None:
        for zone in site.zones:
            zones.append(
                {
                    "family": zone.family,
                    "id": zone.id,
                    "name": zone.name,
                    "enabled": zone.enabled,
                    "closed": zone.closed,
                    "points": [[round(p[0], 3), round(p[1], 3)] for p in zone.points],
                    "area_m2": round(zone.area_m2, 1) if zone.area_m2 is not None else None,
                    "length_m": round(zone.length_m, 1),
                }
            )
        for dock in site.charging:
            docks.append(
                {
                    "id": dock.id,
                    "name": dock.name,
                    "point": [round(dock.point[0], 3), round(dock.point[1], 3)],
                    "straight_phi": dock.straight_phi,
                    "start_point": (
                        [round(dock.start_point[0], 3), round(dock.start_point[1], 3)]
                        if dock.start_point is not None
                        else None
                    ),
                }
            )
    return {
        "entry_id": entry.entry_id,
        "title": entry.title,
        "serial": coordinator.serial,
        "frame": "local metres, x west, y north",
        "zones": zones,
        "docks": docks,
        "bounds": site.bounds() if site is not None else None,
    }


def live_payload(coordinator: YarboCoordinator) -> dict[str, Any]:
    state = coordinator.data
    pos = state.position
    fix = state.fix
    left = state.get("WheelSpeedMSG.left")
    right = state.get("WheelSpeedMSG.right")
    moving_back = (
        isinstance(left, int | float) and isinstance(right, int | float) and left < 0 and right < 0
    )
    return {
        "type": "live",
        "t": time.time(),
        "connected": coordinator.connected,
        "awake": state.awake,
        "activity": state.activity.value,
        "battery": state.battery,
        "charging": state.charging,
        "error_code": state.error_code,
        "head": state.head_name,
        "plan_running": state.plan_running,
        "x": round(pos[0], 3) if pos else None,
        "y": round(pos[1], 3) if pos else None,
        "phi": round(pos[2], 4) if pos else None,
        "rtk_status": state.rtk_status,
        "fix_quality": fix.quality if fix else None,
        "satellites": fix.satellites if fix else None,
        "hdop": fix.hdop if fix else None,
        "reverse": moving_back,
    }


@websocket_command({vol.Required("type"): "yarbo_local/map", **TARGET})
@async_response
async def ws_map(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    entry = _entry(hass, msg)
    if entry is None:
        _not_found(connection, msg)
        return
    coordinator: YarboCoordinator = entry.runtime_data.coordinator
    if coordinator.site_map is None:
        try:
            await coordinator.async_refresh_map()
        except Exception as err:
            connection.send_error(msg["id"], "map_unavailable", str(err))
            return
    connection.send_result(msg["id"], map_payload(entry, coordinator))


@websocket_command(
    {vol.Required("type"): "yarbo_local/obstacles", **TARGET, vol.Optional("run_id"): str}
)
@callback
def ws_obstacles(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    entry = _entry(hass, msg)
    if entry is None:
        _not_found(connection, msg)
        return
    coordinator: YarboCoordinator = entry.runtime_data.coordinator
    connection.send_result(
        msg["id"],
        {
            "runs": [run.summary() for run in reversed(coordinator.obstacles.runs)],
            "run": coordinator.obstacle_run_payload(msg.get("run_id")),
        },
    )


@websocket_command({vol.Required("type"): "yarbo_local/subscribe_live", **TARGET})
@callback
def ws_subscribe_live(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    entry = _entry(hass, msg)
    if entry is None:
        _not_found(connection, msg)
        return
    coordinator: YarboCoordinator = entry.runtime_data.coordinator
    msg_id = msg["id"]
    last_sent = 0.0
    pending: list[Any] = []

    def send(payload: dict[str, Any]) -> None:
        connection.send_message(event_message(msg_id, payload))

    @callback
    def send_live() -> None:
        nonlocal last_sent
        pending.clear()
        last_sent = time.monotonic()
        send(live_payload(coordinator))

    @callback
    def on_update() -> None:
        if pending:
            return
        wait = LIVE_MIN_INTERVAL - (time.monotonic() - last_sent)
        if wait <= 0:
            send_live()
        else:
            pending.append(hass.loop.call_later(wait, send_live))

    @callback
    def on_map() -> None:
        send({"type": "map_changed"})

    @callback
    def on_feedback(leaf: str, value: Any) -> None:
        send({"type": "feedback", "leaf": leaf, "data": value})

    unsubscribers: list[Callable[[], None]] = [
        coordinator.async_add_listener(on_update),
        coordinator.add_map_listener(on_map),
        coordinator.add_feedback_listener(on_feedback),
    ]

    @callback
    def unsubscribe() -> None:
        for unsub in unsubscribers:
            unsub()
        for handle in pending:
            handle.cancel()

    connection.subscriptions[msg_id] = unsubscribe
    connection.send_result(msg_id)
    send_live()
    for leaf, value in coordinator.feedback.items():
        on_feedback(leaf, value)
    if coordinator.obstacles.latest is not None:
        on_feedback("obstacles", coordinator.obstacle_run_payload())


# -- aerial background ----------------------------------------------------------


class BackgroundStore:
    """Image URL, similarity transform and opacity per robot serial."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, f"{DOMAIN}.backgrounds")
        self._data: dict[str, Any] | None = None

    async def _load(self) -> dict[str, Any]:
        if self._data is None:
            self._data = await self._store.async_load() or {}
        return self._data

    async def async_get(self, serial: str) -> dict[str, Any] | None:
        data = await self._load()
        value = data.get(serial)
        return dict(value) if isinstance(value, dict) else None

    async def async_set(self, serial: str, value: dict[str, Any] | None) -> None:
        data = await self._load()
        if value is None:
            data.pop(serial, None)
        else:
            data[serial] = value
        await self._store.async_save(data)


def _backgrounds(hass: HomeAssistant) -> BackgroundStore:
    store = hass.data.get(DATA_BACKGROUNDS)
    if store is None:
        store = hass.data[DATA_BACKGROUNDS] = BackgroundStore(hass)
    return store


def _image_url(value: Any) -> str:
    text = str(value).strip()
    if len(text) > 512 or not (text.startswith("/") or text.startswith(("http://", "https://"))):
        raise vol.Invalid("image must be a path such as /local/yarbo/aerial.jpg or an http(s) URL")
    return text


BACKGROUND_SCHEMA: dict[vol.Marker, Any] = {
    vol.Required("image"): _image_url,
    vol.Required("transform"): vol.Schema(
        {
            vol.Required("a"): vol.Coerce(float),
            vol.Required("b"): vol.Coerce(float),
            vol.Required("e"): vol.Coerce(float),
            vol.Required("f"): vol.Coerce(float),
        }
    ),
    vol.Required("width"): vol.All(vol.Coerce(int), vol.Range(min=1, max=20000)),
    vol.Required("height"): vol.All(vol.Coerce(int), vol.Range(min=1, max=20000)),
    vol.Optional("opacity", default=0.85): vol.All(vol.Coerce(float), vol.Range(min=0, max=1)),
}


@websocket_command({vol.Required("type"): "yarbo_local/background/get", **TARGET})
@async_response
async def ws_background_get(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    entry = _entry(hass, msg)
    if entry is None:
        _not_found(connection, msg)
        return
    serial = entry.runtime_data.coordinator.serial
    connection.send_result(msg["id"], await _backgrounds(hass).async_get(serial))


@require_admin
@websocket_command(
    {
        vol.Required("type"): "yarbo_local/background/save",
        **TARGET,
        vol.Required("background"): BACKGROUND_SCHEMA,
    }
)
@async_response
async def ws_background_save(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    entry = _entry(hass, msg)
    if entry is None:
        _not_found(connection, msg)
        return
    serial = entry.runtime_data.coordinator.serial
    await _backgrounds(hass).async_set(serial, msg["background"])
    connection.send_result(msg["id"], msg["background"])


@require_admin
@websocket_command({vol.Required("type"): "yarbo_local/background/clear", **TARGET})
@async_response
async def ws_background_clear(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    entry = _entry(hass, msg)
    if entry is None:
        _not_found(connection, msg)
        return
    await _backgrounds(hass).async_set(entry.runtime_data.coordinator.serial, None)
    connection.send_result(msg["id"])
