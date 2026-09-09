"""Shared fixtures: a simulated robot behind the library's fake transport."""

from __future__ import annotations

from collections.abc import Callable, Generator
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.const import CONF_SERIAL, DOMAIN
from yarbo_local import FakeTransport, Registry, Simulator, YarboRobot

FIXTURE = Path(__file__).parent / "fixtures" / "get_device_msg-asleep.jsonl"

type RobotFactory = Callable[[str, int, str | None, Registry | None], YarboRobot]


@pytest.fixture(autouse=True)
def _custom_integrations(enable_custom_integrations: None) -> None:
    """Load custom_components from this checkout."""


@pytest.fixture(autouse=True)
def _fast_backoff() -> Generator[None]:
    with patch("yarbo_local.session.BACKOFF_MIN", 0.05):
        yield


@pytest.fixture
def sim() -> Simulator:
    return Simulator.from_fixture(FIXTURE)


@pytest.fixture
def transports() -> list[FakeTransport]:
    return []


@pytest.fixture
def robot_factory(sim: Simulator, transports: list[FakeTransport]) -> RobotFactory:
    def factory(host: str, port: int, serial: str | None, registry: Registry | None) -> YarboRobot:
        transport = FakeTransport()
        sim.attach(transport)
        transports.append(transport)
        return YarboRobot(transport, serial=serial, registry=registry)

    return factory


@pytest.fixture
def mock_create_robot(robot_factory: RobotFactory) -> Generator[MagicMock]:
    with patch(
        "custom_components.yarbo_local.client.create_robot", side_effect=robot_factory
    ) as mock:
        yield mock


@pytest.fixture
def mock_resolve() -> Generator[AsyncMock]:
    async def passthrough(**kwargs: object) -> object:
        return kwargs["last_host"]

    with patch("custom_components.yarbo_local.resolve", side_effect=passthrough) as mock:
        yield mock


@pytest.fixture
def mock_setup_entry() -> Generator[AsyncMock]:
    with patch("custom_components.yarbo_local.async_setup_entry", return_value=True) as mock:
        yield mock


@pytest.fixture
def config_entry(sim: Simulator) -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title="Yarbo test",
        unique_id=sim.serial,
        data={CONF_HOST: "192.168.50.184", CONF_PORT: 1883, CONF_SERIAL: sim.serial},
    )


@pytest.fixture
async def loaded_entry(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_create_robot: MagicMock,
    mock_resolve: AsyncMock,
) -> MockConfigEntry:
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()
    return config_entry
