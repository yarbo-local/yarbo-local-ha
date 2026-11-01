import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import type { YardContext } from "./context";
import { obstacleLayer } from "./feedback";
import { pageStyles } from "./panel-styles";
import type { Point } from "./types";
import {
  clock,
  duration,
  fixShare,
  outcomeOf,
  pace,
  pointAt,
  runTitle,
  shortDate,
  totals,
  trackSegments,
  trend,
  type RunRecord,
  type Track,
  type TrackColour,
} from "./yard";

const PLAY_SPEEDS = [30, 120];

/** Every run, the trends across them, and one run in full with its replay. */
export class YardPageHistory extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    runKey: { attribute: false },
    _track: { state: true },
    _barriers: { state: true },
    _colour: { state: true },
    _at: { state: true },
    _playing: { state: true },
    _speed: { state: true },
  };

  declare ctx?: YardContext;
  declare runKey?: number;
  declare _track?: Track | null;
  declare _barriers: Point[][];
  declare _colour: TrackColour;
  declare _at?: number;
  declare _playing: boolean;
  declare _speed: number;
  private _timer?: ReturnType<typeof setInterval>;
  private _loaded?: number;

  constructor() {
    super();
    this._barriers = [];
    this._colour = "plain";
    this._playing = false;
    this._speed = PLAY_SPEEDS[0]!;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stop();
  }

  private get _runs(): RunRecord[] {
    return this.ctx?.yard?.runs ?? [];
  }

  private get _run(): RunRecord | undefined {
    if (!this.runKey) {
      return undefined;
    }
    const open = this.ctx?.yard?.open_run;
    const all = open ? [...this._runs, open] : this._runs;
    return all.find((r) => Math.floor(r.started_at) === this.runKey);
  }

  override willUpdate(_changed: PropertyValues<this>): void {
    const run = this._run;
    if (run && this._loaded !== this.runKey) {
      this._loaded = this.runKey;
      this._stop();
      this._at = undefined;
      this._track = undefined;
      this._barriers = [];
      void this._load(run);
    }
    if (!run) {
      this._loaded = undefined;
      this._stop();
    }
  }

  private async _load(run: RunRecord): Promise<void> {
    const ctx = this.ctx!;
    try {
      this._track = await ctx.hass.callWS<Track | null>({
        type: "yarbo_local/track",
        entity_id: ctx.entity,
        started_at: run.started_at,
      });
    } catch {
      this._track = null;
    }
    if (run.id && ctx.yard?.reachable) {
      try {
        const log = await ctx.hass.callWS<{ run: unknown }>({
          type: "yarbo_local/obstacles",
          entity_id: ctx.entity,
          run_id: run.id,
        });
        this._barriers = obstacleLayer(log.run).barriers;
      } catch {
        this._barriers = [];
      }
    }
  }

  private _togglePlay(): void {
    if (this._playing) {
      this._stop();
      return;
    }
    const points = this._track?.points ?? [];
    const end = points[points.length - 1]?.[0] ?? 0;
    if (this._at === undefined || this._at >= end) {
      this._at = 0;
    }
    this._playing = true;
    this._timer = setInterval(() => {
      const next = (this._at ?? 0) + this._speed / 10;
      if (next >= end) {
        this._at = end;
        this._stop();
      } else {
        this._at = next;
      }
    }, 100);
  }

  private _stop(): void {
    clearInterval(this._timer);
    this._timer = undefined;
    this._playing = false;
  }

  override render() {
    if (!this.ctx) {
      return nothing;
    }
    return this.runKey ? this._renderRun() : this._renderAll();
  }

  private _renderAll() {
    const ctx = this.ctx!;
    const runs = this._runs;
    if (!runs.length) {
      return html`<section class="card empty">No runs recorded yet. Each run is added here when it ends, with where the robot drove.</section>`;
    }
    const locale = ctx.hass.locale?.language;
    const sum = totals(runs);
    return html`<div class="stack">
      <section class="card">
        <div class="pad"><h2>Every run</h2></div>
        <div class="scroll"><table>
          <thead><tr><th>Date</th><th>Plan</th><th>Time</th><th>Area</th><th>Done</th><th class="hide-narrow">Distance</th><th class="hide-narrow">Battery</th><th class="hide-narrow">Obstacles</th><th>Ended</th></tr></thead>
          <tbody>
            ${[...runs].reverse().map((run) => {
              const [label, cls] = outcomeOf(run);
              return html`<tr tabindex="0" @click=${() => ctx.go(`history/${Math.floor(run.started_at)}`)}
                @keydown=${(e: KeyboardEvent) => e.key === "Enter" && ctx.go(`history/${Math.floor(run.started_at)}`)}>
                <td>${shortDate(run.started_at, locale)} ${clock(run.started_at, locale)}</td>
                <td>${runTitle(run)}</td>
                <td>${duration(run.working_s)}</td>
                <td>${run.area_m2 ? `${Math.round(run.area_m2)} m²` : "–"}</td>
                <td>${run.progress !== null ? `${Math.round(run.progress)}%` : "–"}</td>
                <td class="hide-narrow">${run.distance_m ? `${(run.distance_m / 1000).toFixed(1)} km` : "–"}</td>
                <td class="hide-narrow">${run.battery_used_robot != null ? `${run.battery_used_robot}%` : "–"}</td>
                <td class="hide-narrow">${run.obstacles ?? "–"}</td>
                <td><span class="chip ${cls}">${label}</span></td>
              </tr>`;
            })}
          </tbody>
        </table></div>
      </section>
      <div class="cols">
        <section class="card pad stack">
          <h2>Totals</h2>
          <div class="tiles">
            <div class="tile"><small>Runs</small><b>${sum.runs}</b><span>${sum.finished} finished</span></div>
            <div class="tile"><small>Time working</small><b>${duration(sum.workingS)}</b></div>
            <div class="tile"><small>Area worked</small><b>${Math.round(sum.areaM2)} m²</b></div>
            <div class="tile"><small>Distance</small><b>${(sum.distanceM / 1000).toFixed(1)} km</b></div>
            <div class="tile"><small>Pace</small><b>${sum.paceM2H !== null ? `${Math.round(sum.paceM2H)} m²/h` : "–"}</b></div>
            <div class="tile"><small>Energy</small><b>${sum.whPerM2 !== null ? `${sum.whPerM2.toFixed(2)} Wh/m²` : "–"}</b></div>
            <div class="tile"><small>Obstacles</small><b>${sum.obstacles}</b></div>
            <div class="tile"><small>Faults</small><b>${sum.faults}</b></div>
          </div>
        </section>
        <section class="card pad stack">
          <h2>Trends</h2>
          <yard-chart label="Pace" unit="m²/h" .series=${trend(runs, pace)}></yard-chart>
          <yard-chart label="Energy per m²" unit="Wh" digits="2" .series=${trend(runs, (r) => r.wh_per_m2)}></yard-chart>
          <yard-chart label="Obstacles per run" .series=${trend(runs, (r) => r.obstacles)}></yard-chart>
        </section>
      </div>
    </div>`;
  }

  private _renderRun() {
    const ctx = this.ctx!;
    const run = this._run;
    if (!run) {
      return html`<section class="card empty">That run is not in the record. <a class="link" @click=${() => ctx.go("history")}>All runs</a></section>`;
    }
    const locale = ctx.hass.locale?.language;
    const points = this._track?.points ?? [];
    const end = points[points.length - 1]?.[0] ?? 0;
    const at = this._at ?? end;
    const point = this._at !== undefined ? pointAt(points, at) : null;
    const card = ctx.card("run", ctx.narrow ? 340 : 520);
    const segments = trackSegments(points, this._colour, at);
    card.overlay = {
      swaths: this._colour === "plain" ? segments : [],
      lines: this._colour === "plain" ? [] : segments,
      marker: point ? { x: point[1], y: point[2] } : null,
      barriers: this._barriers,
    };
    const share = fixShare(points);
    const [label, cls] = outcomeOf(run);
    return html`<div class="stack">
      <a class="link back" @click=${() => ctx.go("history")}>‹ All runs</a>
      <div class="grid">
        <section class="card">
          ${card}
          ${points.length
            ? html`<div class="pad player">
                <button class="btn primary" @click=${() => this._togglePlay()}>${this._playing ? "Pause" : "Play"}</button>
                <input type="range" aria-label="Moment in the run" min="0" max=${end} step="1" .value=${String(at)}
                  @input=${(e: Event) => { this._stop(); this._at = Number((e.target as HTMLInputElement).value); }} />
                <div class="seg">${PLAY_SPEEDS.map(
                  (s) => html`<button aria-pressed=${this._speed === s ? "true" : "false"} @click=${() => (this._speed = s)}>${s}×</button>`,
                )}</div>
                <div class="seg">${(["plain", "fix", "signal"] as TrackColour[]).map(
                  (c) => html`<button aria-pressed=${this._colour === c ? "true" : "false"} @click=${() => (this._colour = c)}>${{ plain: "Cut", fix: "RTK", signal: "Signal" }[c]}</button>`,
                )}</div>
              </div>
              ${point
                ? html`<div class="pad small muted moment">${clock(run.started_at + point[0], locale)} · fix ${point[3] ?? "–"} · HaLow ${point[4] ?? "–"} dBm · battery ${point[5] ?? "–"}%</div>`
                : nothing}
              ${this._colour !== "plain"
                ? html`<div class="pad legend small">${this._colour === "fix"
                    ? html`<span><i style="background:var(--success-color,#43a047);border-color:var(--success-color,#43a047)"></i>RTK fixed</span><span><i style="background:var(--warning-color,#ffa600);border-color:var(--warning-color,#ffa600)"></i>RTK float</span><span><i style="background:var(--error-color,#db4437);border-color:var(--error-color,#db4437)"></i>GPS only</span>`
                    : html`<span><i style="background:var(--success-color,#43a047);border-color:var(--success-color,#43a047)"></i>Above −65 dBm</span><span><i style="background:var(--warning-color,#ffa600);border-color:var(--warning-color,#ffa600)"></i>−65 to −78</span><span><i style="background:var(--error-color,#db4437);border-color:var(--error-color,#db4437)"></i>Below −78</span>`}</div>`
                : nothing}`
            : html`<div class="pad small muted">${this._track === undefined ? "Loading the track…" : "No track for this run: it ran before tracks were recorded."}</div>`}
        </section>
        <section class="card pad stack">
          <h2>${runTitle(run)} <span class="chip ${cls}">${label}</span></h2>
          <div class="muted small">${shortDate(run.started_at, locale)}, ${clock(run.started_at, locale)}${run.ended_at ? ` to ${clock(run.ended_at, locale)}` : ""}</div>
          <div class="tiles">
            <div class="tile"><small>Working time</small><b>${duration(run.working_s)}</b></div>
            <div class="tile"><small>Done</small><b>${run.progress !== null ? `${Math.round(run.progress)}%` : "–"}</b></div>
            <div class="tile"><small>Area</small><b>${run.area_m2 ? `${Math.round(run.area_m2)} m²` : "–"}</b><span>${run.planned_area_m2 ? `of ${Math.round(run.planned_area_m2)} m²` : ""}</span></div>
            <div class="tile"><small>Distance</small><b>${run.distance_m ? `${Math.round(run.distance_m)} m` : "–"}</b></div>
            <div class="tile"><small>Battery</small><b>${run.battery_start ?? "–"} → ${run.battery_end ?? "–"}%</b></div>
            <div class="tile"><small>Energy</small><b>${run.energy_wh ? `${run.energy_wh} Wh` : "–"}</b><span>${run.wh_per_m2 ? `${run.wh_per_m2.toFixed(2)} Wh/m²` : ""}</span></div>
            <div class="tile"><small>Obstacles</small><b>${run.obstacles ?? "–"}</b></div>
            <div class="tile"><small>Faults</small><b>${run.faults?.length ? run.faults.join(", ") : "None"}</b></div>
            ${points.length ? html`<div class="tile"><small>RTK fixed</small><b>${share.rtk}%</b><span>float ${share.float}%, other ${share.other}%</span></div>` : nothing}
          </div>
        </section>
      </div>
    </div>`;
  }

  static override styles = [
    pageStyles,
    css`
      .back { font-size: 14px; align-self: flex-start; }
      .player { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; border-top: 1px solid var(--divider-color); }
      .player input[type="range"] { flex: 1 1 160px; min-width: 120px; accent-color: var(--primary-color); }
      .moment, .legend.pad { padding-top: 0; }
    `,
  ];
}

if (!customElements.get("yard-page-history")) {
  customElements.define("yard-page-history", YardPageHistory);
}
