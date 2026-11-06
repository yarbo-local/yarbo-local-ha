import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import type { YardContext } from "./context";
import { pageStyles } from "./panel-styles";
import { clock, duration, linkName, shortDate, type Series } from "./yard";

interface HistoryRow {
  s: string;
  lu: number;
}

interface ChartSpec {
  suffix: string;
  label: string;
  unit: string;
  digits?: number;
  color?: string;
}

const CHARTS: ChartSpec[] = [
  { suffix: "_battery", label: "Battery", unit: "%" },
  { suffix: "_battery_voltage", label: "Voltage", unit: "V", digits: 1, color: "var(--info-color, #3a7fc0)" },
  { suffix: "_battery_current", label: "Current", unit: "A", digits: 1, color: "var(--info-color, #3a7fc0)" },
  { suffix: "_halow_signal", label: "HaLow signal", unit: "dBm", color: "var(--warning-color, #e39500)" },
  { suffix: "_satellites", label: "Satellites", unit: "", color: "var(--success-color, #43a047)" },
  { suffix: "_ambient_temperature", label: "Ambient temperature", unit: "°", digits: 1, color: "var(--error-color, #db4437)" },
];

const SPANS: Array<[number, string]> = [
  [24, "24 h"],
  [168, "7 days"],
];

/** Everything about the robot itself: what it reports now, over time, and what it stores. */
export class YardPageRobot extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    _hours: { state: true },
    _series: { state: true },
    _loading: { state: true },
  };

  declare ctx?: YardContext;
  declare _hours: number;
  declare _series: Record<string, Series>;
  declare _loading: boolean;
  private _loadedFor?: string;

  constructor() {
    super();
    this._hours = 24;
    this._series = {};
    this._loading = false;
  }

  private _entity(suffix: string): string | undefined {
    const ctx = this.ctx;
    if (!ctx) {
      return undefined;
    }
    return Object.values(ctx.hass.entities ?? {}).find(
      (e) => e.platform === "yarbo_local" && e.entity_id.startsWith("sensor.") && e.entity_id.endsWith(suffix),
    )?.entity_id;
  }

  /** A sensor's state in the unit Home Assistant shows it in, such as °F. */
  private _reading(suffix: string): string | undefined {
    const entity = this._entity(suffix);
    const state = entity ? this.ctx?.hass.states[entity] : undefined;
    if (!state || state.state === "unavailable" || state.state === "unknown") {
      return undefined;
    }
    const unit = state.attributes.unit_of_measurement;
    return typeof unit === "string" ? `${state.state} ${unit}` : state.state;
  }

  private _unit(entity: string | undefined, fallback: string): string {
    const unit = entity ? this.ctx?.hass.states[entity]?.attributes.unit_of_measurement : undefined;
    return typeof unit === "string" ? unit : fallback;
  }

  override willUpdate(_changed: PropertyValues<this>): void {
    const key = `${this.ctx?.entity}:${this._hours}`;
    if (this.ctx && key !== this._loadedFor) {
      this._loadedFor = key;
      void this._load();
    }
  }

  private async _load(): Promise<void> {
    const ctx = this.ctx!;
    const wanted = CHARTS.map((c) => this._entity(c.suffix)).filter((e): e is string => Boolean(e));
    if (!wanted.length) {
      return;
    }
    this._loading = true;
    try {
      const rows = await ctx.hass.callWS<Record<string, HistoryRow[]>>({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - this._hours * 3_600_000).toISOString(),
        end_time: new Date().toISOString(),
        entity_ids: wanted,
        minimal_response: true,
        no_attributes: true,
      });
      const series: Record<string, Series> = {};
      for (const [entity, values] of Object.entries(rows)) {
        series[entity] = values
          .map((v): [number, number] => [v.lu, Number(v.s)])
          .filter((p) => Number.isFinite(p[1]));
      }
      this._series = series;
    } catch {
      this._series = {};
    } finally {
      this._loading = false;
    }
  }

  override render() {
    const ctx = this.ctx;
    if (!ctx) {
      return nothing;
    }
    const robot = ctx.yard?.robot;
    const live = ctx.live;
    const locale = ctx.hass.locale?.language;
    const charts = CHARTS.map((c) => ({ ...c, entity: this._entity(c.suffix) })).filter((c) => c.entity);
    const schedules = ctx.yard?.schedules ?? [];
    const charges = [...(ctx.yard?.charges ?? [])].reverse().slice(0, 8);
    return html`<div class="stack">
      <section class="card pad stack">
        <h2>Right now</h2>
        ${robot || live
          ? html`<div class="tiles">
              <div class="tile"><small>Battery</small><b>${live?.battery != null ? `${live.battery}%` : "–"}</b><span>${robot?.battery_health != null ? `health ${robot.battery_health}%` : ""}</span></div>
              <div class="tile"><small>Voltage</small><b>${robot?.voltage != null ? `${robot.voltage.toFixed(1)} V` : "–"}</b></div>
              <div class="tile"><small>Current</small><b>${robot?.current != null ? `${robot.current.toFixed(1)} A` : "–"}</b></div>
              <div class="tile"><small>RTK</small><b>${live?.fix_quality === 4 ? "Fixed" : live?.fix_quality === 5 ? "Float" : live?.fix_quality ? "GPS only" : "–"}</b><span>${live?.satellites ? `${live.satellites} satellites` : ""}</span></div>
              <div class="tile"><small>Link</small><b>${linkName(robot?.network_path)}</b><span>${robot?.halow_rssi != null ? `HaLow ${robot.halow_rssi} dBm` : ""}</span></div>
              <div class="tile"><small>Module</small><b>${(robot?.head ?? live?.head ?? "–").replaceAll("_", " ")}</b></div>
              <div class="tile"><small>Temperature</small><b>${this._reading("_ambient_temperature") ?? (robot?.temperature != null ? `${robot.temperature} °C` : "–")}</b></div>
              <div class="tile"><small>Stop button</small><b>${robot?.stop_button_engaged == null ? "–" : robot.stop_button_engaged ? "Pressed" : "Released"}</b></div>
            </div>`
          : html`<div class="muted">Nothing read from the robot yet.</div>`}
      </section>
      <section class="card pad stack">
        <h2>Over time
          <span class="seg">${SPANS.map(
            ([hours, label]) => html`<button aria-pressed=${this._hours === hours ? "true" : "false"} @click=${() => (this._hours = hours)}>${label}</button>`,
          )}</span>
        </h2>
        ${charts.length
          ? html`<div class="cols">${charts.map(
              (c) => html`<yard-chart .label=${c.label} .unit=${this._unit(c.entity, c.unit)} .digits=${c.digits ?? 0} .color=${c.color ?? "var(--primary-color, #1e88e5)"}
                .series=${this._series[c.entity as string] ?? []}></yard-chart>`,
            )}</div>`
          : nothing}
        ${charts.length < CHARTS.length
          ? html`<div class="muted small">Some readings have no chart because their sensors are off by default. Switch them on from this robot's device page to start collecting them.</div>`
          : nothing}
      </section>
      <div class="cols">
        <section class="card">
          <div class="pad"><h2>Plans on this robot</h2></div>
          ${(ctx.yard?.plans ?? []).map(
            (p) => html`<div class="row"><div class="when"><b>${p.area_ids.length}</b>area${p.area_ids.length === 1 ? "" : "s"}</div><div class="what"><b>${p.name}</b></div></div>`,
          )}
          ${ctx.yard?.plans.length ? nothing : html`<div class="empty">None known yet.</div>`}
        </section>
        <section class="card">
          <div class="pad"><h2>Schedules on this robot</h2></div>
          ${schedules.map(
            (s) => html`<div class="row"><div class="when"><b>${s.start_time}</b>${s.end_time}</div><div class="what"><b>${s.name || "Schedule"}</b><span>${s.enabled ? "On: starts mows by itself" : "Off"}</span></div></div>`,
          )}
          ${schedules.length ? nothing : html`<div class="empty">None.</div>`}
        </section>
        <section class="card">
          <div class="pad"><h2>Recent charges</h2></div>
          ${charges.map(
            (c) => html`<div class="row"><div class="when"><b>${shortDate(c.started_at, locale)}</b>${clock(c.started_at, locale)}</div>
              <div class="what"><b>${c.battery_start ?? "–"} → ${c.battery_end ?? "–"}%</b><span>${duration(c.on_charger_s)}${c.rate_pct_per_h ? ` · ${c.rate_pct_per_h}%/h` : ""}</span></div></div>`,
          )}
          ${charges.length ? nothing : html`<div class="empty">None recorded yet.</div>`}
        </section>
      </div>
      <section class="card pad kv small">
        <span>Firmware</span><span>${robot?.firmware ?? "–"}</span>
        <span>Body firmware</span><span>${robot?.body_firmware ?? "–"}</span>
        <span>Head firmware</span><span>${robot?.head_firmware ?? "–"}</span>
        <span>Serial</span><span>${ctx.yard?.serial ?? "–"}</span>
        <span>Address</span><span>${ctx.yard?.host ?? "–"}</span>
      </section>
    </div>`;
  }

  static override styles = [
    pageStyles,
    css`
      h2 .seg { font-weight: 400; }
    `,
  ];
}

if (!customElements.get("yard-page-robot")) {
  customElements.define("yard-page-robot", YardPageRobot);
}
