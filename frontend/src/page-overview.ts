import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import type { YardContext } from "./context";
import { pageStyles } from "./panel-styles";
import { statusLabel } from "./status";
import {
  areaViews,
  clock,
  duration,
  linkName,
  outcomeOf,
  runTitle,
  shortDate,
  trackSegments,
  type Track,
} from "./yard";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The yard at a glance: the map shaded by what happened, what is next, what just happened. */
export class YardPageOverview extends LitElement {
  static override properties = { ctx: { attribute: false }, _track: { state: true } };

  declare ctx?: YardContext;
  declare _track?: Track | null;
  private _trackFor?: number;

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("ctx")) {
      const open = this.ctx?.yard?.open_run;
      if (open && open.started_at !== this._trackFor) {
        this._trackFor = open.started_at;
        void this.ctx?.hass
          .callWS<Track | null>({ type: "yarbo_local/track", entity_id: this.ctx.entity, started_at: open.started_at })
          .then((track) => (this._track = track))
          .catch(() => (this._track = null));
      } else if (!open) {
        this._trackFor = undefined;
        this._track = undefined;
      }
    }
  }

  override render() {
    const ctx = this.ctx;
    if (!ctx) {
      return nothing;
    }
    const now = Date.now() / 1000;
    const areas = areaViews(ctx.map, ctx.yard, now);
    const card = ctx.card("overview", ctx.narrow ? 340 : 480);
    card.zoneStates = Object.fromEntries(areas.map((a) => [a.id, a.state]));
    card.overlay = this._track?.points.length
      ? { swaths: trackSegments(this._track.points, "plain") }
      : undefined;
    return html`<div class="stack">
      <div class="grid">
        <section class="card">
          <div class="pad head">
            <h2>Your yard</h2>
            <div class="legend">
              <span><i style="background:color-mix(in srgb,var(--info-color,#3a7fc0) 30%,transparent);border-color:var(--info-color,#3a7fc0)"></i>Working now</span>
              <span><i style="background:color-mix(in srgb,var(--success-color,#43a047) 26%,transparent);border-color:var(--success-color,#43a047)"></i>This week</span>
              <span><i style="background:color-mix(in srgb,var(--warning-color,#ffa600) 20%,transparent);border-color:var(--warning-color,#ffa600)"></i>Longer ago</span>
            </div>
          </div>
          <div @zone-tap=${(e: CustomEvent) => this._openArea(e)}>${card}</div>
        </section>
        <div class="stack">
          <section class="card">
            <div class="pad"><h2>Areas <a @click=${() => ctx.go("areas")}>All areas</a></h2></div>
            ${areas.length
              ? areas.map(
                  (a) => html`<button class="row" @click=${() => ctx.go(`areas/${a.id}`)}>
                    <div class="when"><b>${a.zone.area_m2 !== null ? `${Math.round(a.zone.area_m2)}` : "–"}</b>m²</div>
                    <div class="what"><b>${a.name}</b><span>${a.line}</span></div>
                    <span class="chip ${a.state === "done" ? "ok" : a.state === "stale" ? "warn" : ""}">${a.state === "work" ? "Now" : a.plans.length ? `${a.plans.length} plan${a.plans.length > 1 ? "s" : ""}` : "No plan"}</span>
                  </button>`,
                )
              : html`<div class="empty">The map has not been read from the robot yet.</div>`}
          </section>
          ${this._schedules()}
        </div>
      </div>
      <section class="card">
        <div class="pad"><h2>Recently <a @click=${() => ctx.go("history")}>History</a></h2></div>
        ${this._recent()}
      </section>
      ${this._robotCard()}
    </div>`;
  }

  private _openArea(e: CustomEvent): void {
    const zone = e.detail as { family: string; id: number | null };
    if (zone.family === "areas" && zone.id !== null) {
      this.ctx?.go(`areas/${zone.id}`);
    }
  }

  private _schedules() {
    const enabled = (this.ctx?.yard?.schedules ?? []).filter((s) => s.enabled);
    if (!enabled.length) {
      return nothing;
    }
    return html`<section class="card">
      <div class="pad"><h2>On the robot's own schedule</h2></div>
      ${enabled.map(
        (s) => html`<div class="row">
          <div class="when"><b>${s.week_day !== null ? (DAY_NAMES[s.week_day % 7] ?? "") : ""}</b>${s.start_time}</div>
          <div class="what"><b>${s.name || "Schedule"}</b><span>${s.start_time} to ${s.end_time}</span></div>
        </div>`,
      )}
    </section>`;
  }

  private _recent() {
    const ctx = this.ctx!;
    const runs = [...(ctx.yard?.runs ?? [])].reverse().slice(0, 5);
    if (!runs.length) {
      return html`<div class="empty">No runs recorded yet. Each run shows up here when it ends.</div>`;
    }
    const locale = ctx.hass.locale?.language;
    return runs.map((run) => {
      const [label, cls] = outcomeOf(run);
      const facts = [
        duration(run.working_s),
        run.area_m2 ? `${Math.round(run.area_m2)} m²` : "",
        run.obstacles ? `${run.obstacles} obstacle${run.obstacles === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      return html`<button class="row" @click=${() => ctx.go(`history/${Math.floor(run.started_at)}`)}>
        <div class="when"><b>${shortDate(run.started_at, locale)}</b>${clock(run.started_at, locale)}</div>
        <div class="what"><b>${runTitle(run)}${run.progress !== null && run.outcome !== "completed" ? `, ${Math.round(run.progress)}%` : ""}</b><span>${facts.join(" · ")}</span></div>
        <span class="chip ${cls}">${label}</span>
      </button>`;
    });
  }

  private _robotCard() {
    const ctx = this.ctx!;
    const robot = ctx.yard?.robot;
    const live = ctx.live;
    if (!robot && !live) {
      return nothing;
    }
    const reachable = ctx.yard?.reachable && live?.connected !== false;
    return html`<section class="card pad robot">
      <h2>${ctx.yard?.title ?? "Robot"} <a @click=${() => ctx.go("robot")}>Everything on this robot</a></h2>
      <div class="tiles">
        <div class="tile"><small>State</small><b>${reachable && live ? statusLabel(live) : "Out of reach"}</b></div>
        <div class="tile"><small>Battery</small><b>${live?.battery != null ? `${live.battery}%` : "–"}</b></div>
        <div class="tile"><small>Module</small><b>${(reachable ? live?.head : robot?.head)?.replaceAll("_", " ") ?? "–"}</b></div>
        <div class="tile"><small>Link</small><b>${reachable ? linkName(robot?.network_path) : "–"}</b></div>
        <div class="tile"><small>Firmware</small><b>${robot?.firmware ?? "–"}</b></div>
      </div>
    </section>`;
  }

  static override styles = [
    pageStyles,
    css`
      .head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: center; }
      .robot { display: flex; flex-direction: column; gap: 12px; }
    `,
  ];
}

if (!customElements.get("yard-page-overview")) {
  customElements.define("yard-page-overview", YardPageOverview);
}
