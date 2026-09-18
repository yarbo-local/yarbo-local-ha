# Yarbo Local for Home Assistant

A Home Assistant integration for Yarbo robots that talks to the MQTT broker running on the robot itself. No Yarbo account, no vendor servers, no telemetry. If the internet is down, this still works.

Status: **pre-alpha, read-only.** It connects, shows the robot's state, and can wake it. It does not start plans or move the robot yet: every command it can send has been verified on real hardware first, and the commands that move the robot have not been through that yet. The plan and the protocol work live in the library repository, [yarbo-local](https://github.com/yarbo-local/yarbo-local).

## What you get

| Platform | Entities |
|---|---|
| Sensor | Battery, Activity (sleeping, idle, working, returning, charging, error, ...), Head, Ambient temperature, Firmware; diagnostics: Error code, Battery health, RTK status, Network path (HaLow, Wi-Fi, LTE); disabled by default: Satellites, Heading, Position X/Y, HaLow signal, Battery current, Battery voltage, Body firmware |
| Binary sensor | Awake, Charging, Problem, RTK fix, Person detection, Follow mode; diagnostics: Online, Child lock |
| Device tracker | Location from the robot's own GNSS fix, with fix quality, satellites and HDOP as attributes |
| Button | Wake, Refresh (state and map) |
| Image | Map: areas, pathways, no-go zones, dock and the robot's position and heading, drawn from the robot's own map |

The map redraws when the robot moves half a metre or turns, and when the map on the robot changes. Edits made in the Yarbo app pass through the robot's broker, so Home Assistant sees the save acknowledgement and re-reads the map a couple of seconds later, without polling.

### Obstacle log

Obstacles the robot reports during a plan run are logged and kept across restarts, for the last 30 runs. The **Obstacle** event entity fires once per new obstacle, so they appear in the logbook and history and can trigger automations. **Obstacles this run** counts them. The card draws them, and `yarbo_local.get_obstacles` returns any run's log as map metres and GeoJSON.

Only the robot's own obstacle reports are used. The front ultrasonic distances are not: their close readings come from uncut grass beside the strip being mowed, not from objects.

### Actions

- **`yarbo_local.get_map`** returns the map stored on the robot: a summary of names and sizes, and GeoJSON in WGS84 for use on a map card or in a template. The robot stores zones as metres from a reference point, with x pointing west and y north; the integration converts them.

State comes from the robot's 1 Hz telemetry while it is awake and from its heartbeat while it sleeps. Entities only write to Home Assistant when their own value changes, so the recorder is not flooded.

## Dashboard

The map belongs on a dashboard, through the companion card [yarbo-local-card](https://github.com/yarbo-local/yarbo-local-card): the robot's own map with zones, dock, live position, trail and an optional aerial photo. Install it from HACS as a Dashboard repository. `dashboards/yarbo-local.yaml` in this repository is a ready-made dashboard with the card and the robot's main entities; replace `SERIAL` with your robot's serial.

The Map image entity is a fallback for places a custom card cannot go, such as picture cards and notifications.

## Requirements

- Home Assistant 2026.7 or newer.
- A Yarbo on firmware 3.9 or newer (verified on 3.14.11). Older firmware speaks plain JSON instead of zlib and has not been tested.
- Home Assistant must be able to reach the robot's IP on TCP port 1883. If the robot lives on its own VLAN, allow that one port from the Home Assistant host. The base station relays the same data and can be used as the address instead of the rover.

## Install

Through HACS: add `https://github.com/yarbo-local/yarbo-local-ha` as a custom repository of type Integration, install, restart. Or copy `custom_components/yarbo_local` into your `custom_components` folder and restart.

Until the `yarbo-local` library is published on PyPI, install it into your Home Assistant environment by hand:

```bash
pip install "yarbo-local @ git+https://github.com/yarbo-local/yarbo-local@main"
```

## Set up

Settings, Devices & services, Add integration, Yarbo Local. Enter the robot's IP address or DNS name. The integration listens to that address for a few seconds, learns which robot is there from its heartbeat, connects to it, and creates the device.

### Names

A robot is called `Yarbo_` followed by its serial number until you name it. Give it a name when you add it, or later under the integration's **Configure** button; the device and every entity's display name follow. The serial number never changes, and neither do entity ids, so automations keep working after a rename.

### More than one robot

Add the integration once per robot. Each robot is its own entry and device, identified by its serial number, so their entities, maps and obstacle logs stay apart. A rover and its base station answer at two addresses with the same serial, and count as one robot.

If one address carries several robots, which a shared base station may do, setup lists them and asks which one; run it again for the others. When an address changes, the integration only accepts a new one where that robot's own serial is heard, so one robot's entities never end up following another robot.

None of us owns two robots, so this is tested against the simulator only. If you do, `yarbo-local sitecheck` tells us in a minute what we cannot find out ourselves, without sharing a serial, an address or a position: see [multi-robot.md](https://github.com/yarbo-local/yarbo-local/blob/main/docs/multi-robot.md).

If your router leases `yarbo` as a hostname on the same network as Home Assistant, the robot is discovered automatically.

Options (on the integration's entry):

- **Subnet to scan.** A CIDR such as `192.168.50.0/24`. When the robot stops answering at its last address, the subnet is scanned for a broker carrying this robot's serial. This is how the integration follows DHCP changes across VLANs, where Home Assistant's own DHCP discovery cannot see the lease.
- **Keep the robot awake.** Re-sends the wake command every two and a half minutes so telemetry streams continuously. Off by default; the robot sleeps about five minutes after a wake otherwise.

## What it will never do

Send commands that are not in the library's verified allowlist. The list of commands that will never be registered, such as remote shell, map erase and factory calibration, is in the library's `protocol/commands.yaml`.

## Developing

```bash
git clone https://github.com/yarbo-local/yarbo-local
git clone https://github.com/yarbo-local/yarbo-local-ha
cd yarbo-local-ha
uv sync --group dev
git config core.hooksPath .githooks
uv run pytest
```

The hook refuses a commit whose test fixtures contain your own site's position or serial. It compares them with the unredacted captures in your `yarbo-local` clone, which are never committed.

The tests run against the library's simulator, built from redacted captures of a real robot. No hardware needed. To try the integration in a real Home Assistant without a robot, run the simulator against any MQTT broker and point the integration at that broker:

```bash
cd ../yarbo-local
uv run yarbo-local sim protocol/fixtures/3.14.11/get_device_msg-asleep.jsonl --broker 127.0.0.1
```

## License

MIT. Yarbo is a trademark of its owner; this project is not affiliated with Yarbo.
