"""What the Yard panel reads and sends.

The panel has to stay useful while the robot is out of reach, and a robot Home Assistant
cannot find has no coordinator at all. So everything that is only being read falls back
to what is on disk: the run summaries, the tracks and the last map and plans the robot
gave us. Sending anything needs the robot, and an administrator.
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
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
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
import voluptuous as vol

from yarbo_local import Action, YarboError
from yarbo_local.models import PlanSummary

from .actions import async_act
from .const import CONF_SERIAL, DOMAIN
from .coordinator import YarboCoordinator
from .tracks import index_key, run_key, track_key

TARGET: dict[str | vol.Marker, Any] = {
    vol.Optional("entity_id"): str,
    vol.Optional("entry_id"): str,
}
RECENT_CHARGES = 60
SITE_REFRESH_S = 600.0
VOLATILE = frozenset({"robot", "last_seen"})
ROBOT_READ_TIMEOUT = 8.0

# The settings the panel may change, because what they do has been seen on the robot.
ALGORITHMS = (0, 1, 4)  # rows, contour spiral, rows with fewer turns
DIRECTIONS = (0, 2)  # counter-clockwise, clockwise; 1 drew the same route as 0
SETTINGS_SCHEMA = vol.Schema(
    {
        vol.Optional("algorithm_type"): vol.In(ALGORITHMS),
        vol.Optional("edge_direction_mode"): vol.In(DIRECTIONS),
        vol.Optional("edge_circles"): vol.All(int, vol.Range(min=0, max=5)),
        vol.Optional("route_angle"): vol.All(vol.Coerce(float), vol.Range(min=0, max=359)),
    }
)


def async_setup_panel_websocket(hass: HomeAssistant) -> None:
    for command in (
        ws_yard,
        ws_track,
        ws_command,
        ws_preview,
        ws_area_settings,
        ws_area_settings_save,
    ):
        async_register_command(hass, command)


# -- finding the robot, reachable or not


def known_entry(hass: HomeAssistant, msg: dict[str, Any]) -> ConfigEntry | None:
    """The robot's entry in whatever state it is in."""
    entry_id = msg.get("entry_id")
    if entity_id := msg.get("entity_id"):
        registered = er.async_get(hass).async_get(entity_id)
        if registered is None or registered.platform != DOMAIN:
            return None
        entry_id = registered.config_entry_id
    entry = hass.config_entries.async_get_entry(entry_id) if entry_id else None
    return entry if entry is not None and entry.domain == DOMAIN else None


def loaded_coordinator(entry: ConfigEntry) -> YarboCoordinator | None:
    return entry.runtime_data.coordinator if entry.state is ConfigEntryState.LOADED else None


def entry_serial(entry: ConfigEntry) -> str:
    return str(entry.unique_id or entry.data.get(CONF_SERIAL) or "")


def site_key(serial: str) -> str:
    return f"{DOMAIN}.site.{serial}"


def _site_store(hass: HomeAssistant, serial: str) -> Store[dict[str, Any]]:
    return Store(hass, 1, site_key(serial))


async def async_load_site(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    return await _site_store(hass, entry_serial(entry)).async_load() or {}


async def async_save_site(hass: HomeAssistant, serial: str, **changes: Any) -> None:
    """Keep what the robot last told us.

    Its readings and the time it was seen change on every read, so they alone are
    written at most every few minutes; the map, plans or schedules are written as soon
    as they change.
    """
    store = _site_store(hass, serial)
    site = await store.async_load() or {}
    fresh = {**site, **changes}
    lasting = {k: v for k, v in fresh.items() if k not in VOLATILE}
    stale = time.time() - float(site.get("last_seen") or 0) >= SITE_REFRESH_S
    if lasting != {k: v for k, v in site.items() if k not in VOLATILE} or stale:
        await store.async_save(fresh)


def plan_payload(plan: PlanSummary) -> dict[str, Any]:
    return {"id": plan.id, "name": plan.name, "area_ids": list(plan.area_ids)}


def robot_payload(coordinator: YarboCoordinator) -> dict[str, Any]:
    state = coordinator.data
    return {
        "firmware": state.firmware,
        "body_firmware": state.body_firmware,
        "head_firmware": state.head_firmware,
        "head": state.head_name,
        "battery_health": state.battery_health,
        "voltage": state.battery_voltage,
        "current": state.battery_current,
        "temperature": state.ambient_temperature,
        "network_path": state.network_path,
        "halow_rssi": state.halow_rssi,
        "person_detection": state.person_detection,
        "child_lock": state.child_lock,
        "stop_button_engaged": state.stop_button_engaged,
    }


async def _read_robot(coordinator: YarboCoordinator) -> dict[str, Any]:
    """What only the robot knows. Whatever it does not answer is left out, not guessed."""
    out: dict[str, Any] = {}
    if not coordinator.connected:
        return out
    try:
        async with asyncio.timeout(ROBOT_READ_TIMEOUT):
            out["plans"] = [plan_payload(p) for p in await coordinator.robot.plans()]
            out["schedules"] = [
                {
                    "id": s.id,
                    "plan_id": s.plan_id,
                    "name": s.name,
                    "enabled": s.enabled,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "week_day": s.week_day,
                }
                for s in await coordinator.robot.schedules()
            ]
    except YarboError, TimeoutError:
        pass
    return out


async def _stored_records(hass: HomeAssistant, kind: str, serial: str) -> dict[str, Any]:
    store: Store[dict[str, Any]] = Store(hass, 1, f"{DOMAIN}.{kind}.{serial}")
    return await store.async_load() or {}


@websocket_command({vol.Required("type"): "yarbo_local/yard", **TARGET})
@async_response
async def ws_yard(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    entry = known_entry(hass, msg)
    if entry is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "No Yarbo Local robot for that target")
        return
    serial = entry_serial(entry)
    site = await async_load_site(hass, entry)
    coordinator = loaded_coordinator(entry)
    result: dict[str, Any] = {
        "entry_id": entry.entry_id,
        "title": entry.title,
        "serial": serial,
        "host": entry.data.get("host"),
        "reachable": bool(coordinator and coordinator.connected),
        "last_seen": site.get("last_seen"),
        "plans": site.get("plans", []),
        "schedules": site.get("schedules", []),
        "robot": site.get("robot"),
    }
    if coordinator is None:
        runs = await _stored_records(hass, "history_runs", serial)
        charges = await _stored_records(hass, "history_charges", serial)
        plans = await _stored_records(hass, "plans", serial)
        result |= {
            "runs": runs.get("runs", []),
            "open_run": runs.get("open"),
            "charges": charges.get("charges", [])[-RECENT_CHARGES:],
            "last_completed": plans.get("last_completed", {}),
        }
    else:
        history = coordinator.history
        fresh = await _read_robot(coordinator)
        robot = robot_payload(coordinator)
        result |= fresh | {
            "robot": robot,
            "runs": history.runs,
            "open_run": asdict(history.open_run) if history.open_run else None,
            "charges": history.charges[-RECENT_CHARGES:],
            "last_completed": dict(coordinator.runs.plans.last_completed),
            "progress": _progress(coordinator),
        }
        await async_save_site(hass, serial, robot=robot, last_seen=time.time(), **fresh)
    connection.send_result(msg["id"], result)


def _progress(coordinator: YarboCoordinator) -> dict[str, Any] | None:
    feedback = coordinator.runs.plan_feedback
    if feedback is None:
        return None
    return {
        "plan_id": feedback.plan_id,
        "plan": coordinator.runs.plan_name,
        "percent": feedback.progress,
        "remaining_s": feedback.remaining_s,
        "current_area_id": feedback.current_area_id,
        "finished_area_ids": list(feedback.finished_area_ids),
    }


@websocket_command(
    {
        vol.Required("type"): "yarbo_local/track",
        **TARGET,
        vol.Required("started_at"): vol.Coerce(float),
    }
)
@async_response
async def ws_track(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    entry = known_entry(hass, msg)
    if entry is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "No Yarbo Local robot for that target")
        return
    coordinator = loaded_coordinator(entry)
    if coordinator is not None:
        connection.send_result(msg["id"], await coordinator.tracks.async_get(msg["started_at"]))
        return
    serial = entry_serial(entry)
    index = await Store[dict[str, Any]](hass, 1, index_key(serial)).async_load() or {}
    key = run_key(msg["started_at"])
    track = None
    if key in index.get("keys", []):
        track = await Store[dict[str, Any]](hass, 1, track_key(serial, key)).async_load()
    connection.send_result(msg["id"], track)


# -- what needs the robot


def _robot_or_error(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> YarboCoordinator | None:
    entry = known_entry(hass, msg)
    coordinator = loaded_coordinator(entry) if entry is not None else None
    if coordinator is None:
        connection.send_error(msg["id"], ERR_NOT_FOUND, "The robot cannot be reached right now")
    return coordinator


@require_admin
@websocket_command(
    {
        vol.Required("type"): "yarbo_local/command",
        **TARGET,
        vol.Required("action"): vol.In([a.value for a in Action]),
        vol.Optional("plan_id"): int,
    }
)
@async_response
async def ws_command(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    coordinator = _robot_or_error(hass, connection, msg)
    if coordinator is None:
        return
    action = Action(msg["action"])
    if action is Action.START and msg.get("plan_id") is None:
        connection.send_error(msg["id"], "invalid", "Choose a plan to start")
        return
    try:
        await async_act(coordinator, action, plan_id=msg.get("plan_id"))
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "refused", str(err))
        return
    connection.send_result(msg["id"])


@websocket_command(
    {vol.Required("type"): "yarbo_local/preview", **TARGET, vol.Required("plan_id"): int}
)
@async_response
async def ws_preview(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """The route the robot would drive for a plan. It computes this without moving."""
    coordinator = _robot_or_error(hass, connection, msg)
    if coordinator is None:
        return
    try:
        route = await coordinator.robot.preview_route(msg["plan_id"])
    except YarboError as err:
        connection.send_error(msg["id"], "robot_error", str(err))
        return
    if route is None:
        connection.send_result(msg["id"], None)
        return
    connection.send_result(
        msg["id"],
        {
            "plan_id": route.plan_id,
            "total_s": route.total_s,
            "paths": [
                {
                    "area_id": area.area_id,
                    "kind": "edge" if area.path_type == 1 else "fill",
                    "points": [[round(p[0], 2), round(p[1], 2)] for p in area.path],
                }
                for area in route.areas
            ],
        },
    )


async def _area_record(coordinator: YarboCoordinator, area_id: int) -> dict[str, Any] | None:
    params = await coordinator.robot.mower_area_params(area_id)
    if params is None:
        return None
    payload = (await coordinator.robot.session.request("read_all_clean_area", timeout=15.0)).payload
    items = payload.get("data") if isinstance(payload, dict) else payload
    area = next((a for a in items or [] if isinstance(a, dict) and a.get("id") == area_id), {})
    first = params.get("first_clean_params") or {}
    return {
        "algorithm_type": area.get("algorithm_type"),
        "edge_direction_mode": params.get("edge_direction_mode"),
        "edge_circles": params.get("edge_circles"),
        "route_angle": first.get("route_angle"),
        "blade_height": first.get("blade_height"),
        "plan_speed": first.get("plan_speed"),
        "turn_type": first.get("turn_type"),
    }


@websocket_command(
    {vol.Required("type"): "yarbo_local/area_settings", **TARGET, vol.Required("area_id"): int}
)
@async_response
async def ws_area_settings(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    coordinator = _robot_or_error(hass, connection, msg)
    if coordinator is None:
        return
    try:
        record = await _area_record(coordinator, msg["area_id"])
    except YarboError as err:
        connection.send_error(msg["id"], "robot_error", str(err))
        return
    connection.send_result(msg["id"], record)


@require_admin
@websocket_command(
    {
        vol.Required("type"): "yarbo_local/area_settings/save",
        **TARGET,
        vol.Required("area_id"): int,
        vol.Required("changes"): SETTINGS_SCHEMA,
    }
)
@async_response
async def ws_area_settings_save(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    """Write, read back and compare. The old values go to the panel for Put it back."""
    coordinator = _robot_or_error(hass, connection, msg)
    if coordinator is None:
        return
    if coordinator.data.plan_running:
        connection.send_error(
            msg["id"], "busy", "The robot is working a plan; settings stay locked"
        )
        return
    area_id: int = msg["area_id"]
    changes: dict[str, Any] = msg["changes"]
    try:
        before = await _area_record(coordinator, area_id)
        if before is None:
            connection.send_error(msg["id"], ERR_NOT_FOUND, f"The robot has no area {area_id}")
            return
        await _write_settings(coordinator, area_id, changes)
        after = await _area_record(coordinator, area_id)
    except YarboError as err:
        connection.send_error(msg["id"], "robot_error", str(err))
        return
    if after is None or any(after.get(key) != value for key, value in changes.items()):
        connection.send_error(msg["id"], "not_stored", "The robot did not keep the new settings")
        return
    connection.send_result(msg["id"], {"before": before, "after": after})


async def _write_settings(
    coordinator: YarboCoordinator, area_id: int, changes: dict[str, Any]
) -> None:
    robot = coordinator.robot
    params: dict[str, Any] = {
        key: changes[key] for key in ("edge_direction_mode", "edge_circles") if key in changes
    }
    if "route_angle" in changes:
        params["first_clean_params"] = {"route_angle": changes["route_angle"]}
    if params:
        await robot.update_mower_area_params(area_id, **params)
    if "algorithm_type" in changes:
        await robot.update_area(area_id, algorithm_type=changes["algorithm_type"])


@callback
def async_note_seen(hass: HomeAssistant, entry: ConfigEntry, at: float | None) -> None:
    """The link to the robot dropped: keep when it was last heard, for the offline page."""
    if at is None:
        return
    entry.async_create_background_task(
        hass,
        _async_store_seen(hass, entry_serial(entry), at),
        name=f"{DOMAIN}_seen_{entry.entry_id}",
    )


async def _async_store_seen(hass: HomeAssistant, serial: str, at: float) -> None:
    store = _site_store(hass, serial)
    site = await store.async_load() or {}
    if float(site.get("last_seen") or 0) < at:
        await store.async_save({**site, "last_seen": at})


@callback
def async_keep_site(hass: HomeAssistant, entry: ConfigEntry, payload: dict[str, Any]) -> None:
    """The map changed: keep a copy for the times the robot cannot be reached."""
    entry.async_create_background_task(
        hass,
        async_save_site(hass, entry_serial(entry), map=payload, last_seen=time.time()),
        name=f"{DOMAIN}_site_{entry.entry_id}",
    )
