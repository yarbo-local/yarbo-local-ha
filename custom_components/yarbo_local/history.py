"""Run and charge summaries, kept for as long as the owner's retention settings say.

Home Assistant keeps full entity history for ten days by default and only hourly
statistics after that, so trends over months need a record of our own: one small
summary per run and per charge, per robot. No summary holds a position, only
distances, so the record says nothing about where the yard is.

Energy is the battery's own voltage times its current, summed once a second while the
robot is awake. Current is negative while the robot drives and positive while it
charges: about -7 A mowing and +14 A charging, near 39 V, on a Lawn Mower Pro with
firmware 3.14.11. A gap of more than a few seconds is not summed, because the robot
slept or the link dropped, and guessing across it would invent energy.

Nothing here talks to the robot.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass, field
import math
from typing import Any, Protocol

from homeassistant.core import callback
from homeassistant.helpers.storage import Store

from yarbo_local import LifecycleEvent, PlanFeedback
from yarbo_local.lifecycle import EventKind

SAVE_DELAY = 10.0
MAX_GAP_S = 3.0  # frames arrive once a second while the robot is awake
MAX_STEP_M = 3.0  # a bigger jump between two frames is a position fix, not driving
MIN_RATE_SPAN_S = 600.0  # a charging rate over less than ten minutes says little
DAY_S = 86_400.0

type Record = dict[str, Any]


class Frame(Protocol):
    """The parts of the robot's state a summary reads."""

    @property
    def last_frame_at(self) -> float | None: ...
    @property
    def battery(self) -> int | None: ...
    @property
    def battery_current(self) -> float | None: ...
    @property
    def battery_voltage(self) -> float | None: ...
    @property
    def charging(self) -> bool: ...
    @property
    def position(self) -> tuple[float, float, float] | None: ...
    @property
    def error_code(self) -> int: ...
    @property
    def head_name(self) -> str: ...


@dataclass
class Retention:
    """How long each kind of record is kept. Zero days keeps it for good."""

    runs_days: int = 0
    charges_days: int = 0
    obstacle_runs: int = 30

    @classmethod
    def from_dict(cls, data: Any) -> Retention:
        if not isinstance(data, dict):
            return cls()
        known = {
            k: int(v)
            for k, v in data.items()
            if k in cls.__dataclass_fields__ and isinstance(v, int)
        }
        return cls(**known)


@dataclass
class OpenRun:
    id: str | None
    plan_id: int | None
    plan: str | None
    started_at: float
    battery_start: int | None
    head: str | None
    energy_j: float = 0.0
    distance_m: float = 0.0
    working_s: int | None = None
    progress: float | None = None
    area_m2: float | None = None
    planned_area_m2: float | None = None
    battery_used_robot: int | None = None
    faults: list[int] = field(default_factory=list)


@dataclass
class OpenCharge:
    started_at: float
    battery_start: int | None
    first_at: float | None = None
    first_battery: int | None = None
    last_change_at: float | None = None
    last_battery: int | None = None
    energy_j: float = 0.0
    measured_s: float = 0.0


def _open_run(data: Any) -> OpenRun | None:
    try:
        return OpenRun(**data) if isinstance(data, dict) else None
    except TypeError:
        return None  # written by an older build; the run's summary is lost, nothing else


def _open_charge(data: Any) -> OpenCharge | None:
    try:
        return OpenCharge(**data) if isinstance(data, dict) else None
    except TypeError:
        return None


def _records(data: Any, key: str) -> list[Record]:
    items = data.get(key) if isinstance(data, dict) else None
    return [r for r in items if isinstance(r, dict)] if isinstance(items, list) else []


class RobotHistory:
    """One robot's run and charge summaries. Fed by the coordinator."""

    def __init__(
        self,
        *,
        runs_store: Store[Record] | None = None,
        runs_data: Any = None,
        charges_store: Store[Record] | None = None,
        charges_data: Any = None,
        retention: Retention | None = None,
        obstacles_in: Callable[[str], int | None] = lambda _run_id: None,
    ) -> None:
        self.retention = retention or Retention()
        self.runs: list[Record] = _records(runs_data, "runs")
        self.charges: list[Record] = _records(charges_data, "charges")
        self.open_run = _open_run(runs_data.get("open") if isinstance(runs_data, dict) else None)
        self.open_charge = _open_charge(
            charges_data.get("open") if isinstance(charges_data, dict) else None
        )
        self._runs_store = runs_store
        self._charges_store = charges_store
        self._obstacles_in = obstacles_in
        self._last_at: float | None = None
        self._last_pos: tuple[float, float] | None = None
        self._battery: int | None = None
        self._head: str | None = None

    # -- inputs

    @callback
    def on_state(self, state: Frame) -> None:
        at = state.last_frame_at
        if at is None or at == self._last_at:
            return  # not a new frame from the robot
        dt = at - self._last_at if self._last_at is not None else None
        fresh = dt is not None and 0 < dt <= MAX_GAP_S
        power = _power(state)
        position = state.position
        pos = (position[0], position[1]) if position else None
        if state.battery is not None:
            self._battery = state.battery
        if state.head_name not in ("none", "unknown"):
            self._head = state.head_name

        run = self.open_run
        if run is not None:
            if fresh and power is not None and dt is not None:
                run.energy_j -= power * dt  # discharge is negative current
            if fresh and pos and self._last_pos:
                step = math.dist(pos, self._last_pos)
                if step <= MAX_STEP_M:
                    run.distance_m += step
            if state.error_code and state.error_code not in run.faults:
                run.faults.append(state.error_code)
            self._save_runs()

        self._track_charge(state, at, power, dt if fresh else None)
        self._last_at = at
        self._last_pos = pos

    def _track_charge(self, state: Frame, at: float, power: float | None, dt: float | None) -> None:
        charge = self.open_charge
        if state.charging and charge is None:
            charge = self.open_charge = OpenCharge(started_at=at, battery_start=state.battery)
        elif not state.charging and charge is not None:
            self._close_charge(charge, at)
            return
        if charge is None:
            return
        battery = state.battery
        if battery is not None:
            if charge.first_battery is None:
                charge.first_at, charge.first_battery = at, battery
            if battery != charge.last_battery:
                charge.last_change_at, charge.last_battery = at, battery
        if dt is not None:
            charge.measured_s += dt
            if power is not None and power > 0:
                charge.energy_j += power * dt
        self._save_charges()

    @callback
    def note_feedback(self, feedback: PlanFeedback | None) -> None:
        """The robot's own figures for the run under way: area, working time, progress."""
        run = self.open_run
        if run is None or feedback is None or (run.id and feedback.run_id != run.id):
            return
        run.working_s = feedback.duration_s if feedback.duration_s is not None else run.working_s
        run.progress = feedback.progress if feedback.progress is not None else run.progress
        run.area_m2 = (
            feedback.finished_area_m2 if feedback.finished_area_m2 is not None else run.area_m2
        )
        run.planned_area_m2 = feedback.total_area_m2 or run.planned_area_m2
        run.battery_used_robot = (
            feedback.battery_used if feedback.battery_used is not None else run.battery_used_robot
        )

    @callback
    def on_lifecycle(self, event: LifecycleEvent, plan_name: str | None) -> None:
        run = self.open_run
        if event.kind is EventKind.STARTED:
            if run is not None and run.id == event.run_id:
                return  # the same run, seen again after a restart
            if run is not None:
                self._close_run(run, event.at, "superseded", None, None)
            self.open_run = OpenRun(
                id=event.run_id,
                plan_id=event.plan_id,
                plan=plan_name,
                started_at=event.at,
                battery_start=self._battery,
                head=self._head,
            )
            self._save_runs()
        elif event.kind is EventKind.FINISHED and run is not None:
            if event.run_id is None or run.id in (None, event.run_id):
                self._close_run(
                    run, event.at, event.reason or "finished", event.progress, event.duration_s
                )

    # -- closing

    def _close_run(
        self, run: OpenRun, at: float, outcome: str, progress: float | None, working_s: int | None
    ) -> None:
        energy_wh = round(run.energy_j / 3600, 1) if run.energy_j > 0 else None
        working = working_s if working_s is not None else run.working_s
        area = run.area_m2
        self.runs.append(
            {
                "id": run.id,
                "plan_id": run.plan_id,
                "plan": run.plan,
                "started_at": run.started_at,
                "ended_at": at,
                "outcome": outcome,
                "working_s": working,
                "progress": progress if progress is not None else run.progress,
                "area_m2": area,
                "planned_area_m2": run.planned_area_m2,
                "battery_start": run.battery_start,
                "battery_end": self._battery,
                "battery_used_robot": run.battery_used_robot,
                "energy_wh": energy_wh,
                "wh_per_m2": round(energy_wh / area, 3) if energy_wh and area else None,
                "distance_m": round(run.distance_m, 1),
                "speed_ms": round(run.distance_m / working, 3) if working else None,
                "obstacles": self._obstacles_in(run.id) if run.id else None,
                "faults": list(run.faults),
                "head": run.head,
            }
        )
        self.open_run = None
        self.prune(at)
        self._save_runs()

    def _close_charge(self, charge: OpenCharge, at: float) -> None:
        rate = None
        if (
            charge.first_at is not None
            and charge.last_change_at is not None
            and charge.first_battery is not None
            and charge.last_battery is not None
            and charge.last_change_at - charge.first_at >= MIN_RATE_SPAN_S
        ):
            hours = (charge.last_change_at - charge.first_at) / 3600
            rate = round((charge.last_battery - charge.first_battery) / hours, 1)
        self.charges.append(
            {
                "started_at": charge.started_at,
                "ended_at": at,
                "on_charger_s": round(at - charge.started_at),
                "battery_start": charge.battery_start,
                "battery_end": charge.last_battery,
                "rate_pct_per_h": rate,
                "energy_in_wh": round(charge.energy_j / 3600, 1) if charge.energy_j > 0 else None,
                "measured_s": round(charge.measured_s),
            }
        )
        self.open_charge = None
        self.prune(at)
        self._save_charges()

    # -- keeping and forgetting

    def prune(self, now: float) -> bool:
        """Drop what is older than the retention settings allow. True if anything went."""
        changed = False
        for key, days in (
            ("runs", self.retention.runs_days),
            ("charges", self.retention.charges_days),
        ):
            if days <= 0:
                continue
            cutoff = now - days * DAY_S
            records: list[Record] = getattr(self, key)
            kept = [r for r in records if float(r.get("ended_at") or 0) >= cutoff]
            if len(kept) != len(records):
                setattr(self, key, kept)
                changed = True
        if changed:
            self._save_runs()
            self._save_charges()
        return changed

    def clear_runs(self) -> int:
        count = len(self.runs)
        self.runs = []
        self.open_run = None
        self._save_runs()
        return count

    def clear_charges(self) -> int:
        count = len(self.charges)
        self.charges = []
        self.open_charge = None
        self._save_charges()
        return count

    def runs_dict(self) -> Record:
        return {"runs": self.runs, "open": asdict(self.open_run) if self.open_run else None}

    def charges_dict(self) -> Record:
        return {
            "charges": self.charges,
            "open": asdict(self.open_charge) if self.open_charge else None,
        }

    def _save_runs(self) -> None:
        if self._runs_store is not None:
            self._runs_store.async_delay_save(self.runs_dict, SAVE_DELAY)

    def _save_charges(self) -> None:
        if self._charges_store is not None:
            self._charges_store.async_delay_save(self.charges_dict, SAVE_DELAY)

    async def async_save(self) -> None:
        if self._runs_store is not None:
            await self._runs_store.async_save(self.runs_dict())
        if self._charges_store is not None:
            await self._charges_store.async_save(self.charges_dict())


def _power(state: Frame) -> float | None:
    current, voltage = state.battery_current, state.battery_voltage
    if current is None or voltage is None:
        return None
    return current * voltage
