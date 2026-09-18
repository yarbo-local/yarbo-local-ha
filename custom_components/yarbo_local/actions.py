"""Run a moving action for an entity, and turn what goes wrong into words a person can use."""

from __future__ import annotations

from homeassistant.exceptions import HomeAssistantError, ServiceValidationError

from yarbo_local import (
    Action,
    CommandRefusedError,
    ControllerError,
    PreflightError,
    YarboError,
)

from .const import DOMAIN
from .coordinator import YarboCoordinator


async def async_act(coordinator: YarboCoordinator, action: Action) -> None:
    """Pre-flight, then send. Every failure is a translated message, never a traceback."""
    try:
        await coordinator.robot.act(action)
    except PreflightError as err:
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
