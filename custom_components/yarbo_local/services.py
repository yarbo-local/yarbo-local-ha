"""Actions. Registered once in async_setup so automations validate while offline."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from yarbo_local import Action, YarboError
from yarbo_local.models import local_to_wgs84

from .actions import async_act
from .const import DOMAIN

ATTR_CONFIG_ENTRY_ID = "config_entry_id"
SERVICE_GET_MAP = "get_map"
SERVICE_GET_OBSTACLES = "get_obstacles"
ATTR_RUN_ID = "run_id"
SERVICE_START_PLAN = "start_plan"
ATTR_PLAN = "plan"

GET_MAP_SCHEMA = vol.Schema({vol.Required(ATTR_CONFIG_ENTRY_ID): cv.string})
START_PLAN_SCHEMA = vol.Schema(
    {vol.Required(ATTR_CONFIG_ENTRY_ID): cv.string, vol.Required(ATTR_PLAN): cv.string}
)
GET_OBSTACLES_SCHEMA = vol.Schema(
    {vol.Required(ATTR_CONFIG_ENTRY_ID): cv.string, vol.Optional(ATTR_RUN_ID): cv.string}
)


def _loaded_entry(hass: HomeAssistant, entry_id: str) -> ConfigEntry:
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="entry_not_found",
            translation_placeholders={"entry_id": entry_id},
        )
    if entry.state is not ConfigEntryState.LOADED:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="entry_not_loaded",
            translation_placeholders={"title": entry.title},
        )
    return entry


def async_setup_services(hass: HomeAssistant) -> None:
    async def get_map(call: ServiceCall) -> ServiceResponse:
        entry = _loaded_entry(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        coordinator = entry.runtime_data.coordinator
        try:
            site = await coordinator.async_refresh_map()
        except YarboError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="map_unavailable",
                translation_placeholders={"error": str(err)},
            ) from err
        return {"summary": site.summary(), "geojson": site.to_geojson()}

    async def get_obstacles(call: ServiceCall) -> ServiceResponse:
        entry = _loaded_entry(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        coordinator = entry.runtime_data.coordinator
        run_id = call.data.get(ATTR_RUN_ID)
        run = coordinator.obstacles.get(run_id) if run_id else coordinator.obstacles.latest
        if run_id and run is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="run_not_found",
                translation_placeholders={"run_id": run_id},
            )
        runs = [r.summary() for r in reversed(coordinator.obstacles.runs)]
        site = coordinator.site_map
        ref = site.reference if site is not None else None
        return {
            "runs": runs,
            "run": run.to_dict() if run else None,
            "geojson": _obstacles_geojson(run.to_dict(), ref) if run and ref else None,
        }

    async def start_plan(call: ServiceCall) -> None:
        """Start a plan by name. For automations, where a picker's state is the wrong tool."""
        entry = _loaded_entry(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        coordinator = entry.runtime_data.coordinator
        wanted = call.data[ATTR_PLAN].strip()
        options = coordinator.runs.plan_options()
        by_folded = {name.casefold(): plan_id for name, plan_id in options.items()}
        plan_id = by_folded.get(wanted.casefold())
        if plan_id is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="plan_not_found",
                translation_placeholders={"plan": wanted, "plans": ", ".join(options) or "-"},
            )
        await async_act(coordinator, Action.START, plan_id=plan_id)

    hass.services.async_register(DOMAIN, SERVICE_START_PLAN, start_plan, schema=START_PLAN_SCHEMA)
    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_OBSTACLES,
        get_obstacles,
        schema=GET_OBSTACLES_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_MAP,
        get_map,
        schema=GET_MAP_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )


def _obstacles_geojson(run: dict[str, Any], ref: tuple[float, float]) -> dict[str, Any]:
    def lonlat(x: float, y: float) -> list[float]:
        lat, lon = local_to_wgs84(ref, x, y)
        return [round(lon, 8), round(lat, 8)]

    features: list[dict[str, Any]] = []
    for b in run["barriers"]:
        coords = [lonlat(x, y) for x, y in b["points"]]
        geometry = (
            {"type": "LineString", "coordinates": coords}
            if len(coords) > 1
            else {"type": "Point", "coordinates": coords[0]}
        )
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {"source": "barrier", "first_seen": b["first_seen"]},
            }
        )
    return {"type": "FeatureCollection", "features": features}
