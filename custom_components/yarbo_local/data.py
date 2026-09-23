"""What the integration keeps on disk, how big it is, how long it stays, and clearing it.

Everything lives in Home Assistant's own storage folder, one file per kind of record
per robot. The Settings page of the Yard panel reads this through the websocket
commands below; all of them are for administrators only, and clearing needs an
explicit confirmation.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import os
import time
from typing import TYPE_CHECKING, Any

from homeassistant.components.websocket_api import async_register_command
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.components.websocket_api.decorators import (
    async_response,
    require_admin,
    websocket_command,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util.hass_dict import HassKey
import voluptuous as vol

from .const import DOMAIN
from .history import Retention
from .websocket_api import backgrounds

if TYPE_CHECKING:
    from .coordinator import YarboCoordinator

DATA_MANAGER: HassKey[DataManager] = HassKey(f"{DOMAIN}_data")
SETTINGS_KEY = f"{DOMAIN}.data_settings"
BACKGROUNDS_KEY = f"{DOMAIN}.backgrounds"

RUNS = "runs"
CHARGES = "charges"
OBSTACLES = "obstacles"
PLANS = "plans"
BACKGROUNDS = "backgrounds"
DATASETS = (RUNS, CHARGES, OBSTACLES, PLANS, BACKGROUNDS)

# What the Settings page offers. Zero days means kept for good.
DAY_CHOICES = (30, 90, 365, 730, 0)
RUN_CHOICES = (10, 30, 100, 300)


def store_key(kind: str, serial: str) -> str:
    return f"{DOMAIN}.{kind}.{serial}"


@dataclass
class DatasetHealth:
    dataset: str
    serial: str | None
    records: int
    detail: str | None
    oldest: float | None
    newest: float | None
    bytes: int
    retention: dict[str, Any] | None


class DataManager:
    """Retention settings for all robots, and the robots whose records it can report."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, 1, SETTINGS_KEY)
        self.retention = Retention()
        self.robots: dict[str, YarboCoordinator] = {}

    async def async_load(self) -> None:
        self.retention = Retention.from_dict(await self._store.async_load())

    @callback
    def add(self, coordinator: YarboCoordinator) -> None:
        self.robots[coordinator.serial] = coordinator
        self._apply(coordinator)

    @callback
    def remove(self, serial: str) -> None:
        self.robots.pop(serial, None)

    def _apply(self, coordinator: YarboCoordinator) -> None:
        coordinator.history.retention = self.retention
        coordinator.history.prune(time.time())
        coordinator.runs.set_obstacle_limit(self.retention.obstacle_runs)

    async def async_set_retention(self, dataset: str, value: int) -> None:
        if dataset == RUNS:
            self.retention.runs_days = value
        elif dataset == CHARGES:
            self.retention.charges_days = value
        elif dataset == OBSTACLES:
            self.retention.obstacle_runs = value
        else:
            raise ValueError(dataset)
        await self._store.async_save(asdict(self.retention))
        for coordinator in self.robots.values():
            self._apply(coordinator)

    async def async_clear(self, dataset: str, serial: str | None) -> int:
        """Forget one kind of record, for one robot or all. Returns how many went."""
        if dataset == BACKGROUNDS:
            return await backgrounds(self.hass).async_clear(serial)
        cleared = 0
        for coordinator in self.robots.values():
            if serial not in (None, coordinator.serial):
                continue
            if dataset == RUNS:
                cleared += coordinator.history.clear_runs()
            elif dataset == CHARGES:
                cleared += coordinator.history.clear_charges()
            elif dataset == OBSTACLES:
                cleared += coordinator.runs.clear_obstacles()
            elif dataset == PLANS:
                cleared += coordinator.runs.clear_plan_memory()
            else:
                raise ValueError(dataset)
        await self.async_flush()
        return cleared

    async def async_flush(self) -> None:
        for coordinator in self.robots.values():
            await coordinator.history.async_save()
            await coordinator.runs.async_save()

    async def async_health(self) -> dict[str, Any]:
        await self.async_flush()  # sizes on disk should match what is reported
        sizes = await self.hass.async_add_executor_job(self._sizes)
        datasets: list[DatasetHealth] = []
        for serial, coordinator in self.robots.items():
            history = coordinator.history
            runs = history.runs
            charges = history.charges
            obstacle_runs = coordinator.runs.obstacles.runs
            datasets += [
                DatasetHealth(
                    RUNS,
                    serial,
                    len(runs),
                    None,
                    _first(runs, "started_at"),
                    _last(runs, "ended_at"),
                    sizes.get(store_key("history_runs", serial), 0),
                    {"unit": "days", "value": self.retention.runs_days, "choices": DAY_CHOICES},
                ),
                DatasetHealth(
                    CHARGES,
                    serial,
                    len(charges),
                    None,
                    _first(charges, "started_at"),
                    _last(charges, "ended_at"),
                    sizes.get(store_key("history_charges", serial), 0),
                    {"unit": "days", "value": self.retention.charges_days, "choices": DAY_CHOICES},
                ),
                DatasetHealth(
                    OBSTACLES,
                    serial,
                    len(obstacle_runs),
                    f"{sum(len(r.barriers) for r in obstacle_runs)} obstacles",
                    obstacle_runs[0].started if obstacle_runs else None,
                    (obstacle_runs[-1].ended or obstacle_runs[-1].started)
                    if obstacle_runs
                    else None,
                    sizes.get(store_key("obstacles", serial), 0),
                    {"unit": "runs", "value": self.retention.obstacle_runs, "choices": RUN_CHOICES},
                ),
                DatasetHealth(
                    PLANS,
                    serial,
                    len(coordinator.runs.plans.last_completed),
                    None,
                    min(coordinator.runs.plans.last_completed.values(), default=None),
                    max(coordinator.runs.plans.last_completed.values(), default=None),
                    sizes.get(store_key("plans", serial), 0),
                    None,
                ),
            ]
        placements = await backgrounds(self.hass).async_count()
        datasets.append(
            DatasetHealth(
                BACKGROUNDS, None, placements, None, None, None, sizes.get(BACKGROUNDS_KEY, 0), None
            )
        )
        return {
            "robots": {serial: c.entry.title for serial, c in self.robots.items()},
            "datasets": [asdict(d) for d in datasets],
            "total_bytes": sum(d.bytes for d in datasets),
            "recorder_keep_days": self._recorder_keep_days(),
        }

    def _sizes(self) -> dict[str, int]:
        keys = [BACKGROUNDS_KEY, SETTINGS_KEY]
        for serial in self.robots:
            keys += [
                store_key(k, serial)
                for k in ("history_runs", "history_charges", "obstacles", "plans")
            ]
        out: dict[str, int] = {}
        for key in keys:
            path = self.hass.config.path(".storage", key)
            out[key] = os.path.getsize(path) if os.path.exists(path) else 0
        return out

    def _recorder_keep_days(self) -> int | None:
        if "recorder" not in self.hass.config.components:
            return None
        from homeassistant.helpers.recorder import get_instance  # noqa: PLC0415

        return int(get_instance(self.hass).keep_days)


def _first(records: list[dict[str, Any]], key: str) -> float | None:
    values = [float(r[key]) for r in records if isinstance(r.get(key), int | float)]
    return min(values) if values else None


def _last(records: list[dict[str, Any]], key: str) -> float | None:
    values = [float(r[key]) for r in records if isinstance(r.get(key), int | float)]
    return max(values) if values else None


async def async_get_manager(hass: HomeAssistant) -> DataManager:
    manager = hass.data.get(DATA_MANAGER)
    if manager is None:
        manager = hass.data[DATA_MANAGER] = DataManager(hass)
        await manager.async_load()
    return manager


# -- websocket commands, administrators only


@callback
def async_setup_data_websocket(hass: HomeAssistant) -> None:
    for command in (ws_health, ws_retention, ws_clear):
        async_register_command(hass, command)


@require_admin
@websocket_command({vol.Required("type"): "yarbo_local/data/health"})
@async_response
async def ws_health(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    manager = await async_get_manager(hass)
    connection.send_result(msg["id"], await manager.async_health())


@require_admin
@websocket_command(
    {
        vol.Required("type"): "yarbo_local/data/retention",
        vol.Required("dataset"): vol.In((RUNS, CHARGES, OBSTACLES)),
        vol.Required("value"): vol.All(int, vol.Range(min=0, max=3650)),
    }
)
@async_response
async def ws_retention(
    hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]
) -> None:
    if msg["dataset"] == OBSTACLES and msg["value"] < 1:
        connection.send_error(msg["id"], "invalid", "Keep at least one run of obstacles")
        return
    manager = await async_get_manager(hass)
    await manager.async_set_retention(msg["dataset"], msg["value"])
    connection.send_result(msg["id"], asdict(manager.retention))


@require_admin
@websocket_command(
    {
        vol.Required("type"): "yarbo_local/data/clear",
        vol.Required("dataset"): vol.In(DATASETS),
        vol.Optional("serial"): str,
        vol.Required("confirm"): True,
    }
)
@async_response
async def ws_clear(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    manager = await async_get_manager(hass)
    cleared = await manager.async_clear(msg["dataset"], msg.get("serial"))
    connection.send_result(msg["id"], {"cleared": cleared})
