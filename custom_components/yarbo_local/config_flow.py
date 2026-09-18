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
from homeassistant.const import CONF_HOST, CONF_MAC, CONF_NAME, CONF_PORT
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import format_mac
from homeassistant.helpers.selector import SelectSelector, SelectSelectorConfig
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
    default_name,
)

_LOGGER = logging.getLogger(__name__)

USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_HOST): str,
        vol.Required(CONF_PORT, default=DEFAULT_PORT): vol.All(int, vol.Range(min=1, max=65535)),
        vol.Optional(CONF_SERIAL, default=""): str,
        vol.Optional(CONF_NAME, default=""): str,
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


async def async_list_robots(host: str, port: int) -> list[str]:
    """Serials heard at one address. Raises when nothing there speaks like a robot."""
    heard = await client.list_robots(host, port)
    if not heard.serials:
        raise CannotConnectError(heard.error or "no robot heard")
    return heard.serials


async def async_probe(hass: HomeAssistant, host: str, port: int, serial: str) -> ProbeResult:
    """Connect to one robot by serial, take a snapshot, disconnect."""
    registry = await hass.async_add_executor_job(Registry.default)
    robot = client.create_robot(host, port, serial, registry)
    try:
        await robot.start(PROBE_TIMEOUT)
        state = await robot.snapshot()
    except YarboError as err:
        raise CannotConnectError(str(err)) from err
    finally:
        await robot.close()
    return ProbeResult(serial=serial, firmware=state.firmware)


class YarboConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up one robot. The unique id is its serial number."""

    VERSION = 1
    MINOR_VERSION = 1

    def __init__(self) -> None:
        self._pending: dict[str, Any] = {}
        self._robots: list[str] = []
        self._discovered_serial = ""

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> YarboOptionsFlow:
        return YarboOptionsFlow()

    def _configured(self) -> set[str]:
        return {e.unique_id for e in self._async_current_entries() if e.unique_id}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        placeholders: dict[str, str] = {}
        if user_input is not None:
            host = str(user_input[CONF_HOST]).strip()
            port = int(user_input[CONF_PORT])
            wanted = str(user_input.get(CONF_SERIAL) or "").strip() or None
            self._pending = {
                CONF_HOST: host,
                CONF_PORT: port,
                CONF_NAME: str(user_input.get(CONF_NAME) or "").strip(),
                CONF_DNS_NAME: None if _is_ip(host) else host,
            }
            try:
                robots = await async_list_robots(host, port)
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            else:
                if wanted and wanted not in robots:
                    errors["base"] = "wrong_serial"
                elif wanted or len(robots) == 1:
                    return await self._async_finish(wanted or robots[0], errors)
                else:
                    # One address, several robots. Whichever spoke first is luck; ask.
                    self._robots = robots
                    return await self.async_step_pick_robot()
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(USER_SCHEMA, user_input),
            errors=errors,
            description_placeholders=placeholders,
        )

    async def async_step_pick_robot(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """An address that carries several robots: choose one. Each gets its own entry."""
        errors: dict[str, str] = {}
        if user_input is not None:
            result = await self._async_finish(str(user_input[CONF_SERIAL]), errors)
            if not errors:
                return result
        fresh = [r for r in self._robots if r not in self._configured()]
        if not fresh:
            return self.async_abort(reason="all_configured")
        return self.async_show_form(
            step_id="pick_robot",
            data_schema=vol.Schema(
                {vol.Required(CONF_SERIAL): SelectSelector(SelectSelectorConfig(options=fresh))}
            ),
            errors=errors,
            description_placeholders={
                "count": str(len(self._robots)),
                "host": str(self._pending[CONF_HOST]),
                "configured": str(len(self._robots) - len(fresh)),
            },
        )

    async def _async_finish(self, serial: str, errors: dict[str, str]) -> ConfigFlowResult:
        """Probe the chosen robot by serial and create its entry."""
        host, port = self._pending[CONF_HOST], self._pending[CONF_PORT]
        try:
            await async_probe(self.hass, host, port, serial)
        except CannotConnectError:
            errors["base"] = "cannot_connect"
            return self.async_show_form(
                step_id="user",
                data_schema=self.add_suggested_values_to_schema(USER_SCHEMA, self._pending),
                errors=errors,
            )
        await self.async_set_unique_id(serial, raise_on_progress=False)
        self._abort_if_unique_id_configured(updates={CONF_HOST: host, CONF_PORT: port})
        data = {k: v for k, v in self._pending.items() if k != CONF_NAME}
        return self.async_create_entry(
            title=self._pending.get(CONF_NAME) or default_name(serial),
            data={**data, CONF_SERIAL: serial},
        )

    async def async_step_dhcp(self, discovery_info: DhcpServiceInfo) -> ConfigFlowResult:
        """A lease for something called yarbo. Listen to it; the serials decide."""
        try:
            robots = await async_list_robots(discovery_info.ip, DEFAULT_PORT)
        except CannotConnectError:
            return self.async_abort(reason="cannot_connect")
        fresh = [r for r in robots if r not in self._configured()]
        # With nothing new here this aborts, after moving the known robot to its new address.
        await self.async_set_unique_id((fresh or robots)[0])
        self._abort_if_unique_id_configured(updates={CONF_HOST: discovery_info.ip})
        self._robots = robots
        self._pending = {
            CONF_HOST: discovery_info.ip,
            CONF_PORT: DEFAULT_PORT,
            CONF_MAC: format_mac(discovery_info.macaddress),
            CONF_DNS_NAME: discovery_info.hostname or None,
            CONF_NAME: "",
        }
        self.context["title_placeholders"] = {"serial": fresh[0]}
        if len(fresh) > 1:
            return await self.async_step_pick_robot()
        self._discovered_serial = fresh[0]
        return await self.async_step_discovery_confirm()

    async def async_step_discovery_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        serial = self._discovered_serial
        errors: dict[str, str] = {}
        if user_input is not None:
            self._pending[CONF_NAME] = str(user_input.get(CONF_NAME) or "").strip()
            result = await self._async_finish(serial, errors)
            if not errors:
                return result
            return self.async_abort(reason="cannot_connect")
        return self.async_show_form(
            step_id="discovery_confirm",
            data_schema=vol.Schema({vol.Optional(CONF_NAME, default=default_name(serial)): str}),
            description_placeholders={"serial": serial, "host": str(self._pending[CONF_HOST])},
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            host = str(user_input[CONF_HOST]).strip()
            port = int(user_input[CONF_PORT])
            serial = str(entry.unique_id)
            try:
                robots = await async_list_robots(host, port)
                if serial in robots:
                    await async_probe(self.hass, host, port, serial)
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            else:
                if serial not in robots:
                    # Another robot lives there. Never point this entry at it.
                    return self.async_abort(reason="unique_id_mismatch")
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
            name = str(user_input.get(CONF_NAME) or "").strip() or default_name(
                str(self.config_entry.unique_id)
            )
            if not errors:
                self._rename(name)
                return self.async_create_entry(
                    data={
                        CONF_SUBNET: subnet,
                        CONF_KEEP_AWAKE: bool(user_input.get(CONF_KEEP_AWAKE, False)),
                    }
                )
        options = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Optional(CONF_NAME, default=self.config_entry.title): str,
                vol.Optional(CONF_SUBNET, default=options.get(CONF_SUBNET, "")): str,
                vol.Optional(CONF_KEEP_AWAKE, default=options.get(CONF_KEEP_AWAKE, False)): bool,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)

    def _rename(self, name: str) -> None:
        """Rename the robot: the entry and its device. The serial never changes.

        Entity ids stay as they are, as always in Home Assistant, so nothing that refers
        to them breaks. A name given to the device in its own settings page still wins.
        """
        entry = self.config_entry
        if name == entry.title:
            return
        self.hass.config_entries.async_update_entry(entry, title=name)
        registry = dr.async_get(self.hass)
        device = registry.async_get_device(identifiers={(DOMAIN, str(entry.unique_id))})
        if device is not None:
            registry.async_update_device(device.id, name=name)
