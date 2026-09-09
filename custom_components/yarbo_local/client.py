"""Where the library object is built. Tests patch ``create_robot``."""

from __future__ import annotations

from yarbo_local import Registry, YarboRobot


def create_robot(host: str, port: int, serial: str | None, registry: Registry | None) -> YarboRobot:
    """Build a client for one robot. No I/O happens here.

    ``registry`` is loaded by the caller in an executor because it reads a file.
    """
    return YarboRobot.for_host(host, port=port, serial=serial, registry=registry)
