"""Where the library object is built. Tests patch ``create_robot``."""

from __future__ import annotations

from yarbo_local import Registry, YarboRobot, discover


def create_robot(host: str, port: int, serial: str | None, registry: Registry | None) -> YarboRobot:
    """Build a client for one robot. No I/O happens here.

    ``registry`` is loaded by the caller in an executor because it reads a file.
    """
    return YarboRobot.for_host(host, port=port, serial=serial, registry=registry)


async def list_robots(host: str, port: int) -> discover.BrokerSample:
    """Every robot one address carries, heard over one heartbeat window.

    An address usually carries one robot. A base station relay may carry more, and
    then setup has to ask which one instead of taking whichever speaks first.
    """
    return await discover.sample(host, port, wait=discover.HEARTBEAT_WINDOW)
