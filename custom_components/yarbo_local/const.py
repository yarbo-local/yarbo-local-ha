"""Constants for the Yarbo Local integration."""

from __future__ import annotations

DOMAIN = "yarbo_local"

CONF_SERIAL = "serial"
CONF_DNS_NAME = "dns_name"
CONF_SUBNET = "subnet"
CONF_KEEP_AWAKE = "keep_awake"

DEFAULT_PORT = 1883

# Seconds to wait for the first heartbeat. An asleep robot heartbeats every 5 s.
READY_TIMEOUT = 20.0
PROBE_TIMEOUT = 15.0

# The robot sleeps about 300 s after a wake regardless of reads (see the library's
# Phase 0 findings). Renewing at 150 s keeps a margin.
KEEP_AWAKE_INTERVAL = 150.0
