"""Repairs: the few things only a person can fix, said once, in words, and withdrawn when fixed.

Three of them. The robot has been unreachable for a while. The robot could not start a plan
and left only a code, which stays until a start works. The robot runs firmware on which no
command has been verified yet. None can be fixed from here, so none has a fix flow; each says
what to do and goes away by itself when it is no longer true.
"""

from __future__ import annotations

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir

from yarbo_local import PlanError

from .const import DOMAIN

UNREACHABLE = "unreachable"
PLAN_CANNOT_START = "plan_cannot_start"
UNVERIFIED_FIRMWARE = "unverified_firmware"
KINDS = (UNREACHABLE, PLAN_CANNOT_START, UNVERIFIED_FIRMWARE)

# Heartbeats arrive even from a sleeping robot, so silence this long is a robot without
# power or without network, not a robot at rest.
UNREACHABLE_AFTER = 15 * 60.0


def issue_id(kind: str, serial: str) -> str:
    return f"{kind}_{serial}"


@callback
def async_clear(hass: HomeAssistant, serial: str, *kinds: str) -> None:
    for kind in kinds or KINDS:
        ir.async_delete_issue(hass, DOMAIN, issue_id(kind, serial))


@callback
def async_unreachable(hass: HomeAssistant, serial: str, name: str, host: str) -> None:
    ir.async_create_issue(
        hass,
        DOMAIN,
        issue_id(UNREACHABLE, serial),
        is_fixable=False,
        is_persistent=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key=UNREACHABLE,
        translation_placeholders={"name": name, "host": host},
    )


@callback
def async_plan_cannot_start(hass: HomeAssistant, serial: str, name: str, error: PlanError) -> None:
    ir.async_create_issue(
        hass,
        DOMAIN,
        issue_id(PLAN_CANNOT_START, serial),
        is_fixable=False,
        is_persistent=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key=PLAN_CANNOT_START,
        translation_placeholders={
            "name": name,
            "reason": error.description,
            "hint": error.hint,
            "code": str(error.code),
        },
    )


@callback
def async_check_firmware(
    hass: HomeAssistant, serial: str, name: str, firmware: str | None, verified: frozenset[str]
) -> None:
    if not firmware or not verified or firmware in verified:
        async_clear(hass, serial, UNVERIFIED_FIRMWARE)
        return
    ir.async_create_issue(
        hass,
        DOMAIN,
        issue_id(UNVERIFIED_FIRMWARE, serial),
        is_fixable=False,
        is_persistent=False,
        severity=ir.IssueSeverity.WARNING,
        learn_more_url="https://github.com/yarbo-local/yarbo-local#contributing-protocol-knowledge",
        translation_key=UNVERIFIED_FIRMWARE,
        translation_placeholders={
            "name": name,
            "firmware": firmware,
            "verified": ", ".join(sorted(verified)),
        },
    )
