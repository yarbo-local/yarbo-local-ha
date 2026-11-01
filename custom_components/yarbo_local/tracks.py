"""Where the robot drove in each run, for the History page's replay and signal views.

One storage file per run, kept apart from the run summaries so that listing runs never
reads positions. Points are metres from the map's own reference, never latitude and
longitude, and only the owner's Home Assistant holds them.

A point is added when the robot has moved, its fix has changed or some time has passed,
so a robot waiting in one place costs almost nothing. Nothing here talks to the robot.
"""

from __future__ import annotations

import math
from typing import Any, Protocol

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

from .const import DOMAIN

MIN_STEP_M = 0.3
MAX_QUIET_S = 15.0
MAX_POINTS = 30_000  # about eight hours at one point a second
MAX_RUNS = 50
SAVE_DELAY = 60.0

type Point = list[float | int | None]  # seconds from the start, x, y, fix, HaLow dBm, battery


class TrackFrame(Protocol):
    """The parts of the robot's state a track reads."""

    @property
    def last_frame_at(self) -> float | None: ...
    @property
    def position(self) -> tuple[float, float, float] | None: ...
    @property
    def fix(self) -> Any: ...
    @property
    def halow_rssi(self) -> int | None: ...
    @property
    def battery(self) -> int | None: ...


def index_key(serial: str) -> str:
    return f"{DOMAIN}.tracks.{serial}"


def track_key(serial: str, run_key: int) -> str:
    return f"{DOMAIN}.track.{serial}.{run_key}"


def run_key(started_at: float) -> int:
    """A run is known by when it started: its id can stay unknown until the robot names it."""
    return int(started_at)


class TrackLog:
    """One robot's tracks. Fed by the coordinator, read by the panel."""

    def __init__(self, hass: HomeAssistant, serial: str) -> None:
        self.hass = hass
        self.serial = serial
        self.keys: list[int] = []
        self._index: Store[dict[str, Any]] = Store(hass, 1, index_key(serial))
        self._key: int | None = None
        self._started_at = 0.0
        self._points: list[Point] = []
        self._store: Store[dict[str, Any]] | None = None
        self._last_at: float | None = None
        self._last_pos: tuple[float, float] | None = None
        self._last_fix: int | None = None

    async def async_load(self, open_started_at: float | None) -> None:
        """Read what is on disk, and pick up a run a restart interrupted."""
        data = await self._index.async_load()
        stored = data.get("keys") if isinstance(data, dict) else None
        self.keys = [k for k in stored if isinstance(k, int)] if isinstance(stored, list) else []
        if open_started_at is None or run_key(open_started_at) not in self.keys:
            return
        self._key = run_key(open_started_at)
        self._started_at = open_started_at
        self._store = self._track_store(self._key)
        saved = await self._store.async_load()
        points = saved.get("points") if isinstance(saved, dict) else None
        self._points = points if isinstance(points, list) else []

    def _track_store(self, key: int) -> Store[dict[str, Any]]:
        return Store(self.hass, 1, track_key(self.serial, key))

    # -- input

    @callback
    def on_state(self, state: TrackFrame, run_started_at: float | None) -> None:
        wanted = run_key(run_started_at) if run_started_at is not None else None
        if wanted != self._key:
            self._finish()
            if run_started_at is not None and wanted is not None:
                self._begin(wanted, run_started_at)
        if self._key is None:
            return
        at = state.last_frame_at
        position = state.position
        if at is None or position is None or at == self._last_at:
            return
        pos = (position[0], position[1])
        fix = state.fix.quality if state.fix else None
        if not self._worth_keeping(at, pos, fix):
            return
        self._points.append(
            [
                round(at - self._started_at, 1),
                round(pos[0], 2),
                round(pos[1], 2),
                fix,
                state.halow_rssi,
                state.battery,
            ]
        )
        self._last_at, self._last_pos, self._last_fix = at, pos, fix
        self._save_later()

    def _worth_keeping(self, at: float, pos: tuple[float, float], fix: int | None) -> bool:
        if len(self._points) >= MAX_POINTS:
            return False
        if self._last_at is None or self._last_pos is None:
            return True
        return (
            math.dist(pos, self._last_pos) >= MIN_STEP_M
            or fix != self._last_fix
            or at - self._last_at >= MAX_QUIET_S
        )

    def _begin(self, key: int, started_at: float) -> None:
        self._key = key
        self._started_at = started_at
        self._points = []
        self._store = self._track_store(key)
        self._last_at = self._last_pos = self._last_fix = None
        if key not in self.keys:
            self.keys.append(key)
        self._prune()
        self._index.async_delay_save(self._index_data, 1.0)

    def _finish(self) -> None:
        if self._key is not None:
            self._save_later(0.0)
        self._key = None
        self._store = None
        self._points = []

    def _save_later(self, delay: float = SAVE_DELAY) -> None:
        if self._store is None:
            return
        data = {"started_at": self._started_at, "points": self._points}
        self._store.async_delay_save(lambda: data, delay)

    def _index_data(self) -> dict[str, Any]:
        return {"keys": self.keys}

    def _prune(self) -> None:
        while len(self.keys) > MAX_RUNS:
            self._forget(self.keys.pop(0))

    def _forget(self, key: int) -> None:
        self.hass.async_create_background_task(
            self._track_store(key).async_remove(), name=f"{DOMAIN}_track_remove"
        )

    # -- output

    async def async_get(self, started_at: float) -> dict[str, Any] | None:
        key = run_key(started_at)
        if key == self._key:
            return {"started_at": self._started_at, "points": self._points}
        if key not in self.keys:
            return None
        return await self._track_store(key).async_load()

    @callback
    def clear(self) -> int:
        """Forget every track but the one being written."""
        gone = [k for k in self.keys if k != self._key]
        for key in gone:
            self._forget(key)
        self.keys = [self._key] if self._key is not None else []
        self._index.async_delay_save(self._index_data, 1.0)
        return len(gone)

    async def async_save(self) -> None:
        await self._index.async_save(self._index_data())
        if self._store is not None:
            await self._store.async_save({"started_at": self._started_at, "points": self._points})
