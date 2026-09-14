"""Actions. Registered once in async_setup so automations validate while offline."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from yarbo_local import YarboError

from .const import DOMAIN

ATTR_CONFIG_ENTRY_ID = "config_entry_id"
SERVICE_GET_MAP = "get_map"

GET_MAP_SCHEMA = vol.Schema({vol.Required(ATTR_CONFIG_ENTRY_ID): cv.string})


def async_setup_services(hass: HomeAssistant) -> None:
    async def get_map(call: ServiceCall) -> ServiceResponse:
        entry_id = call.data[ATTR_CONFIG_ENTRY_ID]
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

    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_MAP,
        get_map,
        schema=GET_MAP_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
