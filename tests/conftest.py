"""Shared fixtures: simulated robots behind in-memory brokers, addressed by host."""

from __future__ import annotations

from collections.abc import Callable, Generator
from dataclasses import dataclass, field
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.const import CONF_SERIAL, DOMAIN
from yarbo_local import FakeBroker, FakeTransport, Registry, Simulator, YarboRobot, discover
from yarbo_local.transport import Transport

FIXTURE = Path(__file__).parent / "fixtures" / "get_device_msg-asleep.jsonl"
MAP_FIXTURE = Path(__file__).parent / "fixtures" / "get_map-area-pathway.jsonl"

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
    return Simulator.from_fixture(FIXTURE, map_fixture=MAP_FIXTURE)


@dataclass
class Site:
    """The network as the tests see it: which broker answers at which address.

    Any address not listed answers as ``default``, the broker carrying ``sim``. Put a
    broker with two robots at an address to model a shared relay; add an address to
    ``dead`` to make it refuse connections.
    """

    default: FakeBroker
    brokers: dict[str, FakeBroker] = field(default_factory=dict)
    dead: set[str] = field(default_factory=set)
    transports: list[FakeTransport] = field(default_factory=list)

    def connect(self, host: str, _port: int = 1883) -> Transport:
        if host in self.dead:
            return FakeTransport(fail_next_connects=10**6)
        transport = self.brokers.get(host, self.default).client()
        self.transports.append(transport)
        return transport


@pytest.fixture
def site(sim: Simulator) -> Site:
    broker = FakeBroker()
    broker.attach(sim)
    return Site(default=broker)


@pytest.fixture
def transports(site: Site) -> list[FakeTransport]:
    return site.transports


@pytest.fixture
def robot_factory(site: Site) -> RobotFactory:
    def factory(host: str, port: int, serial: str | None, registry: Registry | None) -> YarboRobot:
        return YarboRobot(site.connect(host, port), serial=serial, registry=registry)

    return factory


@pytest.fixture
def mock_create_robot(robot_factory: RobotFactory, site: Site) -> Generator[MagicMock]:
    async def list_robots(host: str, port: int) -> discover.BrokerSample:
        return await discover.sample(host, port, wait=0.1, connect=site.connect)

    with (
        patch(
            "custom_components.yarbo_local.client.create_robot", side_effect=robot_factory
        ) as mock,
        patch("custom_components.yarbo_local.client.list_robots", side_effect=list_robots),
    ):
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
