"""Config flow: user, discovery, duplicate, reconfigure and options paths."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.config_entries import SOURCE_DHCP, SOURCE_USER
from homeassistant.const import CONF_HOST, CONF_MAC, CONF_PORT
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers.service_info.dhcp import DhcpServiceInfo
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.yarbo_local.const import (
    CONF_DNS_NAME,
    CONF_KEEP_AWAKE,
    CONF_SERIAL,
    CONF_SUBNET,
    DOMAIN,
)
from yarbo_local import FakeBroker, ReplyTimeoutError, Simulator, YarboRobot

from .conftest import Site


async def test_user_flow(
    hass: HomeAssistant, mock_create_robot: MagicMock, mock_setup_entry: AsyncMock, sim: Simulator
) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {}

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "yarbo.localdomain", CONF_PORT: 1883, CONF_SERIAL: ""}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == f"Yarbo_{sim.serial}"
    assert result["data"] == {
        CONF_HOST: "yarbo.localdomain",
        CONF_PORT: 1883,
        CONF_SERIAL: sim.serial,
        CONF_DNS_NAME: "yarbo.localdomain",
    }
    assert result["result"].unique_id == sim.serial
    assert mock_setup_entry.call_count == 1


async def test_user_flow_errors_then_recovers(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    site: Site,
    sim: Simulator,
) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})

    site.dead.add("192.168.50.2")
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.2", CONF_PORT: 1883, CONF_SERIAL: ""}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "cannot_connect"}

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.184", CONF_PORT: 1883, CONF_SERIAL: "OTHER"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "wrong_serial"}

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.184", CONF_PORT: 1883, CONF_SERIAL: sim.serial}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_DNS_NAME] is None


async def test_the_probe_is_scoped_to_the_serial(
    hass: HomeAssistant, mock_create_robot: MagicMock, mock_setup_entry: AsyncMock, sim: Simulator
) -> None:
    """Setup never connects without a serial: on a shared address that would be luck."""
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.184", CONF_PORT: 1883}
    )
    assert [call.args[2] for call in mock_create_robot.call_args_list] == [sim.serial]


async def test_user_flow_duplicate_updates_host(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    config_entry: MockConfigEntry,
) -> None:
    config_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.99", CONF_PORT: 1883, CONF_SERIAL: ""}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"
    assert config_entry.data[CONF_HOST] == "192.168.50.99"


async def test_dhcp_flow(
    hass: HomeAssistant, mock_create_robot: MagicMock, mock_setup_entry: AsyncMock, sim: Simulator
) -> None:
    info = DhcpServiceInfo(ip="192.168.50.184", hostname="yarbo", macaddress="94ba06faa3fe")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "discovery_confirm"
    assert result["description_placeholders"] == {"serial": sim.serial, "host": "192.168.50.184"}

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == f"Yarbo_{sim.serial}"
    assert result["data"] == {
        CONF_HOST: "192.168.50.184",
        CONF_PORT: 1883,
        CONF_SERIAL: sim.serial,
        CONF_MAC: "94:ba:06:fa:a3:fe",
        CONF_DNS_NAME: "yarbo",
    }


async def test_dhcp_updates_existing_host(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    config_entry: MockConfigEntry,
) -> None:
    config_entry.add_to_hass(hass)
    info = DhcpServiceInfo(ip="192.168.50.77", hostname="yarbo", macaddress="94ba06faa3fe")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"
    assert config_entry.data[CONF_HOST] == "192.168.50.77"


async def test_dhcp_not_a_robot(
    hass: HomeAssistant, mock_create_robot: MagicMock, site: Site
) -> None:
    site.dead.add("192.168.50.5")
    info = DhcpServiceInfo(ip="192.168.50.5", hostname="yarbo-printer", macaddress="001122334455")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "cannot_connect"


async def test_dhcp_a_broker_with_no_robot(
    hass: HomeAssistant, mock_create_robot: MagicMock, site: Site
) -> None:
    """Something called yarbo runs MQTT but carries no snowbot topics: not ours."""
    site.brokers["192.168.50.6"] = FakeBroker()
    info = DhcpServiceInfo(ip="192.168.50.6", hostname="yarbo-nas", macaddress="001122334456")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "cannot_connect"


async def test_reconfigure(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    config_entry: MockConfigEntry,
) -> None:
    config_entry.add_to_hass(hass)
    result = await config_entry.start_reconfigure_flow(hass)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "reconfigure"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "yarbo.localdomain", CONF_PORT: 1884}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"
    assert config_entry.data[CONF_HOST] == "yarbo.localdomain"
    assert config_entry.data[CONF_PORT] == 1884
    assert config_entry.data[CONF_DNS_NAME] == "yarbo.localdomain"


async def test_options_flow(
    hass: HomeAssistant, mock_setup_entry: AsyncMock, config_entry: MockConfigEntry
) -> None:
    config_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config_entry.entry_id)

    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_SUBNET: "not a subnet", CONF_KEEP_AWAKE: False}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_SUBNET: "invalid_subnet"}

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_SUBNET: "192.168.50.0/24", CONF_KEEP_AWAKE: True}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config_entry.options == {CONF_SUBNET: "192.168.50.0/24", CONF_KEEP_AWAKE: True}
    assert config_entry.title == "Yarbo test", "saving options without a name keeps the name"


# -- a robot that is heard but does not answer


async def test_a_robot_heard_but_silent_keeps_the_form_open_with_the_reason(
    hass: HomeAssistant, mock_create_robot: MagicMock, mock_setup_entry: AsyncMock, sim: Simulator
) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    with patch.object(YarboRobot, "snapshot", AsyncMock(side_effect=ReplyTimeoutError("silent"))):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {CONF_HOST: "192.168.50.184", CONF_PORT: 1883}
        )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert result["errors"] == {"base": "cannot_connect"}

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "192.168.50.184", CONF_PORT: 1883}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY, "the same form works once it answers"


async def test_a_discovered_robot_that_goes_silent_ends_the_flow_plainly(
    hass: HomeAssistant, mock_create_robot: MagicMock, mock_setup_entry: AsyncMock, sim: Simulator
) -> None:
    info = DhcpServiceInfo(ip="192.168.50.184", hostname="yarbo", macaddress="94ba06faa3fe")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_DHCP}, data=info
    )
    assert result["step_id"] == "discovery_confirm"
    with patch.object(YarboRobot, "snapshot", AsyncMock(side_effect=ReplyTimeoutError("silent"))):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "cannot_connect"


async def test_reconfigure_to_an_address_where_the_robot_is_silent_changes_nothing(
    hass: HomeAssistant,
    mock_create_robot: MagicMock,
    mock_setup_entry: AsyncMock,
    config_entry: MockConfigEntry,
) -> None:
    config_entry.add_to_hass(hass)
    before = dict(config_entry.data)
    result = await config_entry.start_reconfigure_flow(hass)
    with patch.object(YarboRobot, "snapshot", AsyncMock(side_effect=ReplyTimeoutError("silent"))):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {CONF_HOST: "192.168.50.99", CONF_PORT: 1883}
        )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "cannot_connect"}
    assert dict(config_entry.data) == before
