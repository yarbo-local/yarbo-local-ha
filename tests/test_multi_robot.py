"""Several robots in one Home Assistant, and what each is called.

Nobody on the project owns two robots, so this is proven against the simulator. The
hard case is one address carrying several robots, which a shared base station relay
might be. The library's ``yarbo-local sitecheck`` exists to find out whether real
sites look like that; these tests make sure Home Assistant copes if they do.

Failure messages say what was expected, what was seen and what it would mean for
someone's dashboard, because the person reading them may be looking at a site we
cannot reproduce.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from homeassistant.config_entries import SOURCE_DHCP, SOURCE_USER
from homeassistant.const import CONF_HOST, CONF_NAME, CONF_PORT
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.service_info.dhcp import DhcpServiceInfo
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.const import CONF_SERIAL, DOMAIN
from yarbo_local import FakeBroker, Simulator

from .conftest import Site

RELAY = "192.168.1.22"
SECOND = "SN-second-robot"


@pytest.fixture
def second(sim: Simulator) -> Simulator:
    other = sim.sibling(SECOND)
    other.snapshot["BatteryMSG"] = {**other.snapshot["BatteryMSG"], "capacity": 42}
    return other


@pytest.fixture
def relay(site: Site, sim: Simulator, second: Simulator) -> FakeBroker:
    """One address carrying both robots."""
    broker = FakeBroker()
    broker.attach(sim)
    broker.attach(second)
    site.brokers[RELAY] = broker
    return broker


def _entry(serial: str, title: str) -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title=title,
        unique_id=serial,
        data={CONF_HOST: RELAY, CONF_PORT: 1883, CONF_SERIAL: serial},
    )


def _state(hass: HomeAssistant, serial: str, key: str) -> str:
    entity_id = er.async_get(hass).async_get_entity_id(
        "sensor" if key != "awake" else "binary_sensor", DOMAIN, f"{serial}_{key}"
    )
    assert entity_id is not None, f"no entity with unique id {serial}_{key}"
    state = hass.states.get(entity_id)
    assert state is not None
    return state.state


# -- setup on an address that carries several robots


async def test_a_shared_address_asks_which_robot(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    relay: FakeBroker,
    sim: Simulator,
) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: RELAY, CONF_PORT: 1883}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "pick_robot", (
        f"{RELAY} carries two robots and setup went to {result.get('step_id')!r}. Expected the "
        "picker. Meaning: setup attached to whichever robot heartbeat first."
    )
    assert result["description_placeholders"] == {"count": "2", "host": RELAY, "configured": "0"}
    offered = result["data_schema"].schema[CONF_SERIAL].config["options"]
    assert sorted(offered) == sorted([sim.serial, SECOND])

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_SERIAL: SECOND}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == f"Yarbo_{SECOND}"
    assert result["data"][CONF_SERIAL] == SECOND
    assert result["result"].unique_id == SECOND
    assert mock_create_robot.call_args.args[2] == SECOND, "the probe must be scoped to the choice"


async def test_a_typed_serial_skips_the_question(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    relay: FakeBroker,
) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: RELAY, CONF_PORT: 1883, CONF_SERIAL: SECOND}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["result"].unique_id == SECOND

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: RELAY, CONF_PORT: 1883, CONF_SERIAL: "SN-not-here"}
    )
    assert result["errors"] == {"base": "wrong_serial"}


async def test_the_picker_offers_only_robots_not_yet_set_up(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    relay: FakeBroker,
    sim: Simulator,
) -> None:
    _entry(sim.serial, "Front").add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: RELAY, CONF_PORT: 1883}
    )
    assert result["step_id"] == "pick_robot"
    assert result["data_schema"].schema[CONF_SERIAL].config["options"] == [SECOND]
    assert result["description_placeholders"]["configured"] == "1"

    _entry(SECOND, "Back").add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: RELAY, CONF_PORT: 1883}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "all_configured"


async def test_dhcp_discovery_of_a_shared_address_asks_too(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    relay: FakeBroker,
    sim: Simulator,
) -> None:
    info = DhcpServiceInfo(ip=RELAY, hostname="yarbo-dc", macaddress="8259136ba448")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    assert result["step_id"] == "pick_robot"

    # With one of the two already set up, discovery offers the other, by name.
    hass.config_entries.flow.async_abort(result["flow_id"])
    _entry(sim.serial, "Front").add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    assert result["step_id"] == "discovery_confirm"
    assert result["description_placeholders"] == {"serial": SECOND, "host": RELAY}


# -- two robots loaded side by side


async def test_two_robots_from_one_address_stay_apart(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_resolve: AsyncMock,
    relay: FakeBroker,
    sim: Simulator,
    second: Simulator,
) -> None:
    front, back = _entry(sim.serial, "Front"), _entry(SECOND, "Back")
    for entry in (front, back):
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    batteries = (_state(hass, sim.serial, "battery"), _state(hass, SECOND, "battery"))
    assert batteries == ("100", "42"), (
        f"Batteries read {batteries}; expected ('100', '42'). Meaning: two robots behind one "
        "address showed each other's state."
    )

    # Wake the back robot only. The front robot's entities must not move.
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": er.async_get(hass).async_get_entity_id("button", DOMAIN, f"{SECOND}_wake")},
        blocking=True,
    )
    for _ in range(3):
        sim.tick()
        second.tick()
    await hass.async_block_till_done()
    awake = (_state(hass, sim.serial, "awake"), _state(hass, SECOND, "awake"))
    assert awake == ("off", "on"), (
        f"After waking only the second robot, awake reads {awake}; expected ('off', 'on'). "
        f"The first robot handled: {[name for name, _ in sim.log if name == 'set_working_state']}."
    )

    devices = dr.async_get(hass)
    names = {
        serial: devices.async_get_device(identifiers={(DOMAIN, serial)}).name  # type: ignore[union-attr]
        for serial in (sim.serial, SECOND)
    }
    assert names == {sim.serial: "Front", SECOND: "Back"}
    assert front.runtime_data.coordinator.obstacles is not back.runtime_data.coordinator.obstacles

    for entry in (front, back):
        assert await hass.config_entries.async_unload(entry.entry_id)


async def test_reconfigure_refuses_an_address_that_carries_another_robot(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    site: Site,
    config_entry: MockConfigEntry,
    second: Simulator,
) -> None:
    """Pointing robot A's entry at robot B's address would give A's entities B's life."""
    other = FakeBroker()
    other.attach(second)
    site.brokers["192.168.50.200"] = other
    config_entry.add_to_hass(hass)
    result = await config_entry.start_reconfigure_flow(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.200", CONF_PORT: 1883}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "unique_id_mismatch"
    assert config_entry.data[CONF_HOST] == "192.168.50.184", "the entry must be left alone"


# -- names


async def test_a_name_given_at_setup_is_used(
    hass: HomeAssistant, mock_create_robot: MagicMock, mock_setup_entry: AsyncMock, sim: Simulator
) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.184", CONF_PORT: 1883, CONF_NAME: "  Mowbert "}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Mowbert"
    assert CONF_NAME not in result["data"], "the name lives in the entry title, nowhere else"
    assert result["result"].unique_id == sim.serial


async def test_discovery_offers_the_default_name_and_takes_another(
    hass: HomeAssistant, mock_create_robot: MagicMock, mock_setup_entry: AsyncMock, sim: Simulator
) -> None:
    info = DhcpServiceInfo(ip="192.168.50.184", hostname="yarbo", macaddress="94ba06faa3fe")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    name_field = next(k for k in result["data_schema"].schema if k == CONF_NAME)
    assert name_field.default() == f"Yarbo_{sim.serial}"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_NAME: "Snow crew"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Snow crew"


async def test_renaming_in_options_changes_the_name_and_nothing_else(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    entities = er.async_get(hass)
    before = sorted(
        e.entity_id for e in er.async_entries_for_config_entry(entities, loaded_entry.entry_id)
    )
    battery = entities.async_get_entity_id("sensor", DOMAIN, f"{sim.serial}_battery")
    assert battery is not None
    assert hass.states.get(battery).attributes["friendly_name"] == "Yarbo test Battery"  # type: ignore[union-attr]

    result = await hass.config_entries.options.async_init(loaded_entry.entry_id)
    name_field = next(k for k in result["data_schema"].schema if k == CONF_NAME)
    assert name_field.default() == "Yarbo test", "the form must show the current name"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_NAME: "Mowbert"}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY

    assert loaded_entry.title == "Mowbert"
    device = dr.async_get(hass).async_get_device(identifiers={(DOMAIN, sim.serial)})
    assert device is not None
    assert device.name == "Mowbert"
    assert device.serial_number == sim.serial
    assert loaded_entry.unique_id == sim.serial
    assert CONF_NAME not in loaded_entry.options
    after = sorted(
        e.entity_id for e in er.async_entries_for_config_entry(entities, loaded_entry.entry_id)
    )
    assert after == before, "renaming a robot must not rename entity ids; automations refer to them"
    assert hass.states.get(battery).attributes["friendly_name"] == "Mowbert Battery"  # type: ignore[union-attr]


async def test_an_emptied_name_goes_back_to_the_default(
    hass: HomeAssistant, loaded_entry: MockConfigEntry, sim: Simulator
) -> None:
    result = await hass.config_entries.options.async_init(loaded_entry.entry_id)
    await hass.config_entries.options.async_configure(result["flow_id"], {CONF_NAME: "   "})
    await hass.async_block_till_done()
    assert loaded_entry.title == f"Yarbo_{sim.serial}"
