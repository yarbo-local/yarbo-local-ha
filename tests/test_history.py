"""Run and charge summaries: energy, distance, rates, retention and clearing."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from custom_components.yarbo_local.history import DAY_S, Retention, RobotHistory
from yarbo_local import LifecycleEvent, PlanFeedback
from yarbo_local.lifecycle import EventKind

T0 = 1_760_000_000.0


@dataclass
class F:
    """A robot state frame with only what a summary reads."""

    last_frame_at: float | None
    battery: int | None = 80
    battery_current: float | None = -7.0
    battery_voltage: float | None = 39.0
    charging: bool = False
    position: tuple[float, float, float] | None = (0.0, 0.0, 0.0)
    error_code: int = 0
    head_name: str = "mower_pro"


def started(at: float, run_id: str = "2-100") -> LifecycleEvent:
    return LifecycleEvent(kind=EventKind.STARTED, at=at, run_id=run_id, plan_id=2)


def finished(at: float, run_id: str = "2-100", reason: str = "completed") -> LifecycleEvent:
    return LifecycleEvent(
        kind=EventKind.FINISHED,
        at=at,
        run_id=run_id,
        plan_id=2,
        reason=reason,
        progress=100.0,
        duration_s=100,
    )


def feedback(area: float = 50.0) -> PlanFeedback:
    fb = PlanFeedback.from_wire(
        {
            "planId": 2,
            "startTime": 100,
            "totalCleanArea": 100.0,
            "finishCleanArea": area,
            "duration": 90,
            "battery_consumption": 3,
        }
    )
    assert fb is not None
    return fb


def test_a_run_sums_energy_distance_and_the_robots_figures() -> None:
    history = RobotHistory(obstacles_in=lambda run_id: 4 if run_id == "2-100" else None)
    history.on_state(F(T0, battery=80))
    history.on_lifecycle(started(T0), "west lawn plan")
    for i in range(1, 101):  # 100 s at 7 A and 39 V, 0.5 m a second
        history.on_state(F(T0 + i, battery=80 - i // 50, position=(i * 0.5, 0.0, 0.0)))
    history.note_feedback(feedback(area=50.0))
    history.on_lifecycle(finished(T0 + 101), None)

    assert history.open_run is None
    [run] = history.runs
    assert run["plan"] == "west lawn plan"
    assert run["outcome"] == "completed"
    assert run["energy_wh"] == pytest.approx(7 * 39 * 100 / 3600, abs=0.1)
    assert run["area_m2"] == 50.0
    assert run["planned_area_m2"] == 100.0
    assert run["wh_per_m2"] == pytest.approx(run["energy_wh"] / 50.0, abs=0.001)
    assert run["distance_m"] == pytest.approx(50.0, abs=0.1)
    assert run["speed_ms"] == pytest.approx(0.5, abs=0.01)
    assert run["battery_start"] == 80
    assert run["battery_end"] == 78
    assert run["battery_used_robot"] == 3
    assert run["obstacles"] == 4
    assert run["head"] == "mower_pro"


def test_gaps_and_jumps_are_not_counted() -> None:
    history = RobotHistory()
    history.on_lifecycle(started(T0), None)
    history.on_state(F(T0))
    history.on_state(F(T0 + 60, position=(1.0, 0.0, 0.0)))  # asleep or offline: not summed
    history.on_state(F(T0 + 61, position=(50.0, 0.0, 0.0)))  # a position fix, not driving
    history.on_state(F(T0 + 62, position=(51.0, 0.0, 0.0)))
    history.on_state(F(T0 + 62, position=(99.0, 0.0, 0.0)))  # the same frame again
    run = history.open_run
    assert run is not None
    assert run.distance_m == pytest.approx(1.0)
    assert run.energy_j == pytest.approx(2 * 7 * 39)


def test_faults_during_a_run_are_kept() -> None:
    history = RobotHistory()
    history.on_lifecycle(started(T0), None)
    history.on_state(F(T0, error_code=902))
    history.on_state(F(T0 + 1, error_code=902))
    history.on_lifecycle(finished(T0 + 2, reason="stopped"), None)
    assert history.runs[0]["faults"] == [902]
    assert history.runs[0]["outcome"] == "stopped"


def test_a_new_run_closes_one_left_open_and_a_restart_keeps_the_same_run() -> None:
    history = RobotHistory()
    history.on_lifecycle(started(T0, "2-100"), None)
    history.on_lifecycle(started(T0 + 5, "2-100"), None)  # seen again after a restart
    assert history.runs == []
    history.on_lifecycle(started(T0 + 10, "1-200"), None)
    assert history.runs[0]["outcome"] == "superseded"
    assert history.open_run is not None
    assert history.open_run.id == "1-200"


def test_an_open_run_survives_a_restart() -> None:
    history = RobotHistory()
    history.on_lifecycle(started(T0), "east")
    history.on_state(F(T0))
    history.on_state(F(T0 + 1))
    again = RobotHistory(runs_data=history.runs_dict())
    assert again.open_run is not None
    assert again.open_run.plan == "east"
    assert again.open_run.energy_j == pytest.approx(7 * 39)
    assert RobotHistory(runs_data={"runs": [], "open": {"unknown": 1}}).open_run is None


def test_a_charge_records_its_rate_and_energy() -> None:
    history = RobotHistory()
    history.on_state(F(T0, battery=50, charging=False))
    for i in range(0, 3601, 1):  # an hour at 14 A, 50 to 60 percent
        history.on_state(F(T0 + 1 + i, battery=50 + i // 360, charging=True, battery_current=14.0))
    history.on_state(F(T0 + 3700, battery=60, charging=False))
    [charge] = history.charges
    assert charge["battery_start"] == 50
    assert charge["battery_end"] == 60
    assert charge["rate_pct_per_h"] == pytest.approx(10.0, abs=0.1)
    assert charge["energy_in_wh"] == pytest.approx(14 * 39, abs=1)
    assert charge["on_charger_s"] == 3699
    assert history.open_charge is None


def test_a_short_charge_has_no_rate() -> None:
    history = RobotHistory()
    history.on_state(F(T0, battery=50, charging=True))
    history.on_state(F(T0 + 1, battery=51, charging=True))
    history.on_state(F(T0 + 2, battery=51, charging=False))
    assert history.charges[0]["rate_pct_per_h"] is None


def test_retention_prunes_old_records_and_zero_keeps_everything() -> None:
    old = {"started_at": T0 - 40 * DAY_S, "ended_at": T0 - 40 * DAY_S}
    new = {"started_at": T0 - DAY_S, "ended_at": T0 - DAY_S}
    history = RobotHistory(runs_data={"runs": [old, new]}, charges_data={"charges": [old, new]})
    assert not history.prune(T0)
    history.retention = Retention(runs_days=30, charges_days=0)
    assert history.prune(T0)
    assert history.runs == [new]
    assert len(history.charges) == 2


def test_clearing() -> None:
    history = RobotHistory(runs_data={"runs": [{}, {}]}, charges_data={"charges": [{}]})
    assert history.clear_runs() == 2
    assert history.clear_charges() == 1
    assert history.runs == []
    assert history.charges == []


def test_retention_reads_only_what_it_knows() -> None:
    assert Retention.from_dict(None) == Retention()
    assert Retention.from_dict({"runs_days": 90, "junk": 1, "obstacle_runs": "x"}) == Retention(
        runs_days=90
    )
