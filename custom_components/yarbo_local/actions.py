"""Run a moving action for an entity, and turn what goes wrong into words a person can use."""

from __future__ import annotations

import time

from homeassistant.exceptions import HomeAssistantError, ServiceValidationError

from yarbo_local import (
    Action,
    CommandRefusedError,
    ControllerError,
    PlanStartError,
    PreflightError,
    YarboError,
)

from .const import DOMAIN
from .coordinator import YarboCoordinator


async def async_start_selected(coordinator: YarboCoordinator) -> None:
    """Start the plan chosen in the Plan picker."""
    plan_id = coordinator.runs.selected_plan_id
    if plan_id is None:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="no_plan_selected")
    await async_act(coordinator, Action.START, plan_id=plan_id)


async def async_act(
    coordinator: YarboCoordinator, action: Action, *, plan_id: int | None = None
) -> None:
    """Pre-flight, then send. Every failure is a translated message, never a traceback."""
    try:
        if action is Action.START and plan_id is not None:
            await coordinator.robot.start_plan(plan_id)  # waits for the robot's verdict
        else:
            await coordinator.robot.act(action, plan_id=plan_id)
    except PlanStartError as err:
        # The robot says nothing when it cannot start; the library read the code it left.
        problem = err.error
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="plan_start_failed" if problem else "plan_start_unconfirmed",
            translation_placeholders={
                "reason": problem.description if problem else "",
                "hint": problem.hint if problem else "",
            },
        ) from err
    except PreflightError as err:
        coordinator.recorder.note(
            time.time(), f"{action.value} refused", keys=[r.key for r in err.refusals]
        )
        # The first reason is the one to fix first; its key selects the sentence.
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key=f"refused_{err.refusals[0].key}",
            translation_placeholders={"detail": err.refusals[0].message},
        ) from err
    except ControllerError as err:
        raise HomeAssistantError(
            translation_domain=DOMAIN, translation_key="controller_unavailable"
        ) from err
    except CommandRefusedError as err:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="not_verified",
            translation_placeholders={"action": action.value},
        ) from err
    except YarboError as err:
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="command_failed",
            translation_placeholders={"command": action.value, "error": str(err)},
        ) from err
