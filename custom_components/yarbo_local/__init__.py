"""The Yarbo Local integration: the robot's own MQTT broker, nothing else."""

from __future__ import annotations

from dataclasses import dataclass
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_MAC, CONF_PORT, Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import device_registry as dr

from yarbo_local import Registry, RobotNotFoundError, YarboError, YarboRobot, resolve

from . import client
from .const import (
    CONF_DNS_NAME,
    CONF_KEEP_AWAKE,
    CONF_SERIAL,
    CONF_SUBNET,
    DEFAULT_PORT,
    DOMAIN,
    READY_TIMEOUT,
)
from .coordinator import YarboCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.BINARY_SENSOR, Platform.BUTTON, Platform.DEVICE_TRACKER, Platform.SENSOR]


@dataclass
class YarboRuntimeData:
    """What a loaded entry owns."""

    robot: YarboRobot
    coordinator: YarboCoordinator
    device_id: str


type YarboConfigEntry = ConfigEntry[YarboRuntimeData]


async def async_setup_entry(hass: HomeAssistant, entry: YarboConfigEntry) -> bool:
    """Find the robot, connect, take a first snapshot, register the device."""
    configured_host: str = entry.data[CONF_HOST]
    port: int = entry.data.get(CONF_PORT, DEFAULT_PORT)
    serial: str | None = entry.data.get(CONF_SERIAL) or entry.unique_id
    subnet = entry.options.get(CONF_SUBNET) or None

    try:
        host = await resolve(
            serial=serial,
            last_host=configured_host,
            dns_name=entry.data.get(CONF_DNS_NAME),
            subnet=subnet,
            port=port,
        )
    except RobotNotFoundError as err:
        raise ConfigEntryNotReady(f"Robot not reachable at {configured_host}:{port}") from err

    registry = await hass.async_add_executor_job(Registry.default)
    robot = client.create_robot(host, port, serial, registry)
    try:
        await robot.start(
            READY_TIMEOUT,
            spawn=lambda coro: entry.async_create_background_task(
                hass, coro, name=f"{DOMAIN}_session_{entry.entry_id}"
            ),
        )
        state = await robot.snapshot()
    except YarboError as err:
        await robot.close()
        raise ConfigEntryNotReady(
            f"Robot {serial or ''} at {host}:{port} did not answer: {err}"
        ) from err

    if host != configured_host:
        _LOGGER.info("Robot %s moved from %s to %s", robot.serial, configured_host, host)
        hass.config_entries.async_update_entry(entry, data={**entry.data, CONF_HOST: host})

    coordinator = YarboCoordinator(hass, entry, robot)
    coordinator.async_set_updated_data(state)

    mac = entry.data.get(CONF_MAC)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, robot.serial or "")},
        connections={(dr.CONNECTION_NETWORK_MAC, mac)} if mac else set(),
        manufacturer="Yarbo",
        model="Yarbo",
        name=entry.title,
        serial_number=robot.serial,
        sw_version=state.firmware,
    )
    entry.runtime_data = YarboRuntimeData(robot=robot, coordinator=coordinator, device_id=device.id)

    if entry.options.get(CONF_KEEP_AWAKE):
        coordinator.start_keep_awake()

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: YarboConfigEntry) -> bool:
    """Disconnect from the robot."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        await entry.runtime_data.robot.close()
    return unload_ok
