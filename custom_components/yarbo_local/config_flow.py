"""Config flow: user entry, DHCP discovery, reconfigure, options."""

from __future__ import annotations

from dataclasses import dataclass
import ipaddress
import logging
from typing import Any

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.const import CONF_HOST, CONF_MAC, CONF_PORT
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import format_mac
from homeassistant.helpers.service_info.dhcp import DhcpServiceInfo
import voluptuous as vol

from yarbo_local import Registry, YarboError

from . import client
from .const import (
    CONF_DNS_NAME,
    CONF_KEEP_AWAKE,
    CONF_SERIAL,
    CONF_SUBNET,
    DEFAULT_PORT,
    DOMAIN,
    PROBE_TIMEOUT,
)

_LOGGER = logging.getLogger(__name__)

USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_HOST): str,
        vol.Required(CONF_PORT, default=DEFAULT_PORT): vol.All(int, vol.Range(min=1, max=65535)),
        vol.Optional(CONF_SERIAL, default=""): str,
    }
)
RECONFIGURE_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_HOST): str,
        vol.Required(CONF_PORT, default=DEFAULT_PORT): vol.All(int, vol.Range(min=1, max=65535)),
    }
)


class CannotConnectError(HomeAssistantError):
    """No robot answered."""


@dataclass(frozen=True, slots=True)
class ProbeResult:
    serial: str
    firmware: str | None


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


async def async_probe(hass: HomeAssistant, host: str, port: int) -> ProbeResult:
    """Connect once, learn the serial, disconnect."""
    registry = await hass.async_add_executor_job(Registry.default)
    robot = client.create_robot(host, port, None, registry)
    try:
        await robot.start(PROBE_TIMEOUT)
        state = await robot.snapshot()
    except YarboError as err:
        raise CannotConnectError(str(err)) from err
    finally:
        await robot.close()
    if not robot.serial:
        raise CannotConnectError("no serial learned")
    return ProbeResult(serial=robot.serial, firmware=state.firmware)


class YarboConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up one robot. The unique id is its serial number."""

    VERSION = 1
    MINOR_VERSION = 1

    def __init__(self) -> None:
        self._discovered: dict[str, Any] = {}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> YarboOptionsFlow:
        return YarboOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            host = str(user_input[CONF_HOST]).strip()
            port = int(user_input[CONF_PORT])
            wanted = str(user_input.get(CONF_SERIAL) or "").strip() or None
            try:
                probe = await async_probe(self.hass, host, port)
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            else:
                if wanted and wanted != probe.serial:
                    errors["base"] = "wrong_serial"
                else:
                    await self.async_set_unique_id(probe.serial)
                    self._abort_if_unique_id_configured(updates={CONF_HOST: host, CONF_PORT: port})
                    return self.async_create_entry(
                        title=f"Yarbo {probe.serial}",
                        data={
                            CONF_HOST: host,
                            CONF_PORT: port,
                            CONF_SERIAL: probe.serial,
                            CONF_DNS_NAME: None if _is_ip(host) else host,
                        },
                    )
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(USER_SCHEMA, user_input),
            errors=errors,
        )

    async def async_step_dhcp(self, discovery_info: DhcpServiceInfo) -> ConfigFlowResult:
        """A lease for something called yarbo. Probe it; the serial decides."""
        try:
            probe = await async_probe(self.hass, discovery_info.ip, DEFAULT_PORT)
        except CannotConnectError:
            return self.async_abort(reason="cannot_connect")
        await self.async_set_unique_id(probe.serial)
        self._abort_if_unique_id_configured(updates={CONF_HOST: discovery_info.ip})
        self._discovered = {
            CONF_HOST: discovery_info.ip,
            CONF_PORT: DEFAULT_PORT,
            CONF_SERIAL: probe.serial,
            CONF_MAC: format_mac(discovery_info.macaddress),
            CONF_DNS_NAME: discovery_info.hostname or None,
        }
        self.context["title_placeholders"] = {"serial": probe.serial}
        return await self.async_step_discovery_confirm()

    async def async_step_discovery_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(
                title=f"Yarbo {self._discovered[CONF_SERIAL]}", data=self._discovered
            )
        self._set_confirm_only()
        return self.async_show_form(
            step_id="discovery_confirm",
            description_placeholders={
                "serial": self._discovered[CONF_SERIAL],
                "host": self._discovered[CONF_HOST],
            },
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            host = str(user_input[CONF_HOST]).strip()
            port = int(user_input[CONF_PORT])
            try:
                probe = await async_probe(self.hass, host, port)
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(probe.serial)
                self._abort_if_unique_id_mismatch()
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates={
                        CONF_HOST: host,
                        CONF_PORT: port,
                        CONF_DNS_NAME: None if _is_ip(host) else host,
                    },
                )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(
                RECONFIGURE_SCHEMA, user_input or dict(entry.data)
            ),
            errors=errors,
        )


class YarboOptionsFlow(OptionsFlowWithReload):
    """Behavioural settings. Reloads the entry on save."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            subnet = str(user_input.get(CONF_SUBNET) or "").strip()
            if subnet:
                try:
                    ipaddress.ip_network(subnet, strict=False)
                except ValueError:
                    errors[CONF_SUBNET] = "invalid_subnet"
            if not errors:
                return self.async_create_entry(
                    data={
                        CONF_SUBNET: subnet,
                        CONF_KEEP_AWAKE: bool(user_input.get(CONF_KEEP_AWAKE, False)),
                    }
                )
        options = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Optional(CONF_SUBNET, default=options.get(CONF_SUBNET, "")): str,
                vol.Optional(CONF_KEEP_AWAKE, default=options.get(CONF_KEEP_AWAKE, False)): bool,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
