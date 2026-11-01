import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import type { YardContext } from "./context";
import { pageStyles } from "./panel-styles";
import {
  DIRECTIONS,
  PATTERNS,
  areaViews,
  duration,
  planForArea,
  relativeDay,
  type AreaSettings,
  type AreaView,
  type Route,
} from "./yard";
import type { Point } from "./types";

type Editable = "algorithm_type" | "edge_direction_mode" | "edge_circles" | "route_angle";

/**
 * One area at a time: what happened there, and the route the robot itself says it would
 * drive. Changing a setting saves it to the robot and asks for the route again, so a
 * setting is never a guess. The old route stays dashed until Keep or Put it back.
 */
export class YardPageAreas extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    selected: { attribute: false },
    _settings: { state: true },
    _route: { state: true },
    _before: { state: true },
    _beforeRoute: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare ctx?: YardContext;
  declare selected?: number;
  declare _settings?: AreaSettings | null;
  declare _route?: Route | null;
  declare _before?: AreaSettings;
  declare _beforeRoute?: Route | null;
  declare _busy: boolean;
  declare _error?: string;
  private _loadedFor?: number;

  constructor() {
    super();
    this._busy = false;
  }

  private get _areas(): AreaView[] {
    return areaViews(this.ctx?.map, this.ctx?.yard, Date.now() / 1000);
  }

  private get _area(): AreaView | undefined {
    const areas = this._areas;
    return areas.find((a) => a.id === this.selected) ?? areas[0];
  }

  override willUpdate(_changed: PropertyValues<this>): void {
    const area = this._area;
    if (area && area.id !== this._loadedFor && this.ctx?.yard) {
      this._loadedFor = area.id;
      this._before = undefined;
      this._beforeRoute = undefined;
      this._settings = undefined;
      this._route = undefined;
      this._error = undefined;
      if (this.ctx.yard.reachable) {
        void this._load(area);
      }
    }
  }

  private async _load(area: AreaView): Promise<void> {
    const ctx = this.ctx!;
    this._busy = true;
    try {
      this._settings = await ctx.hass.callWS<AreaSettings | null>({
        type: "yarbo_local/area_settings",
        entity_id: ctx.entity,
        area_id: area.id,
      });
      this._route = await this._fetchRoute(area);
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private async _fetchRoute(area: AreaView): Promise<Route | null> {
    const ctx = this.ctx!;
    const plan = planForArea(ctx.yard?.plans ?? [], area.id);
    if (!plan) {
      return null;
    }
    return ctx.hass.callWS<Route | null>({ type: "yarbo_local/preview", entity_id: ctx.entity, plan_id: plan.id });
  }

  private async _change(key: Editable, value: number): Promise<void> {
    const ctx = this.ctx!;
    const area = this._area;
    if (!area || this._settings?.[key] === value) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    try {
      const saved = await ctx.hass.callWS<{ before: AreaSettings; after: AreaSettings }>({
        type: "yarbo_local/area_settings/save",
        entity_id: ctx.entity,
        area_id: area.id,
        changes: { [key]: value },
      });
      if (!this._before) {
        this._before = saved.before;
        this._beforeRoute = this._route;
      }
      this._settings = saved.after;
      this._route = await this._fetchRoute(area);
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private _keep(): void {
    this._before = undefined;
    this._beforeRoute = undefined;
  }

  private async _putBack(): Promise<void> {
    const ctx = this.ctx!;
    const area = this._area;
    const before = this._before;
    if (!area || !before) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    try {
      const changes: Partial<Record<Editable, number>> = {};
      for (const key of ["algorithm_type", "edge_direction_mode", "edge_circles", "route_angle"] as Editable[]) {
        const value = before[key];
        if (value !== null && value !== undefined) {
          changes[key] = value;
        }
      }
      const saved = await ctx.hass.callWS<{ after: AreaSettings }>({
        type: "yarbo_local/area_settings/save",
        entity_id: ctx.entity,
        area_id: area.id,
        changes,
      });
      this._settings = saved.after;
      this._route = await this._fetchRoute(area);
      this._before = undefined;
      this._beforeRoute = undefined;
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  override render() {
    const ctx = this.ctx;
    if (!ctx) {
      return nothing;
    }
    const areas = this._areas;
    if (!areas.length) {
      return html`<section class="card empty">The areas appear here once the robot's map has been read.</section>`;
    }
    const area = this._area!;
    const card = ctx.card("areas", ctx.narrow ? 320 : 460);
    card.highlight = area.id;
    card.overlay = this._overlay(area);
    return html`<div class="grid">
      <section class="card">${card}
        <div class="pad small muted">
          ${this._route
            ? html`The robot's own route${this._route.total_s ? html`, about ${duration(this._route.total_s)}` : nothing}.${this._before ? " The dashed line is the route before your change." : ""}`
            : ctx.yard?.reachable
              ? (planForArea(ctx.yard.plans, area.id) ? "Asking the robot for its route…" : "No plan holds this area, so the robot has no route to show.")
              : "The robot draws the route itself, so it appears when the robot can be reached."}
        </div>
      </section>
      <div class="stack">
        <section class="card">
          <div class="pad"><label>Area <select @change=${(e: Event) => ctx.go(`areas/${(e.target as HTMLSelectElement).value}`)}>
            ${areas.map((a) => html`<option value=${a.id} ?selected=${a.id === area.id}>${a.name}</option>`)}
          </select></label></div>
          <div class="pad kv facts">
            <span>Size</span><span>${area.zone.area_m2 !== null ? `${Math.round(area.zone.area_m2)} m²` : "–"}</span>
            <span>Last finished</span><span>${area.lastDone ? relativeDay(area.lastDone, Date.now() / 1000) : "Not on record"}</span>
            <span>Plans</span><span>${area.plans.map((p) => p.name).join(", ") || "None"}</span>
          </div>
        </section>
        ${this._renderSettings()}
      </div>
    </div>`;
  }

  private _overlay(area: AreaView) {
    const pick = (route: Route | null | undefined, kind: "fill" | "edge"): Point[][] =>
      (route?.paths ?? []).filter((p) => p.area_id === area.id && p.kind === kind).map((p) => p.points);
    return {
      lines: [
        ...pick(this._beforeRoute, "fill").map((points) => ({ cls: "route-before", points })),
        ...pick(this._route, "fill").map((points) => ({ cls: "route-fill", points })),
        ...pick(this._route, "edge").map((points) => ({ cls: "route-edge", points })),
      ],
    };
  }

  private _renderSettings() {
    const ctx = this.ctx!;
    const s = this._settings;
    const running = Boolean(ctx.live?.plan_running);
    const locked = !ctx.admin || running || this._busy;
    if (!ctx.yard?.reachable) {
      return html`<section class="card pad muted small">Settings live on the robot and can be read when it is in reach.</section>`;
    }
    if (!s) {
      return html`<section class="card pad muted small">${this._error ? html`<span class="error">${this._error}</span>` : this._busy ? "Reading the settings…" : "The robot has no settings for this area."}</section>`;
    }
    return html`<section class="card pad settings">
      <h2>Route settings ${this._busy ? html`<span class="muted small">Working…</span>` : nothing}</h2>
      ${running ? html`<div class="muted small">Locked while the robot works a plan.</div>` : nothing}
      ${!ctx.admin ? html`<div class="muted small">Only an administrator can change these.</div>` : nothing}
      <div class="field"><span>Pattern</span>
        <div class="seg">${PATTERNS.map(
          ([value, label]) => html`<button aria-pressed=${s.algorithm_type === value ? "true" : "false"} ?disabled=${locked} @click=${() => this._change("algorithm_type", value)}>${label}</button>`,
        )}</div>
      </div>
      <div class="field"><span>Direction</span>
        <div class="seg">${DIRECTIONS.map(
          ([value, label]) => html`<button aria-pressed=${(s.edge_direction_mode === 2 ? 2 : 0) === value ? "true" : "false"} ?disabled=${locked} @click=${() => this._change("edge_direction_mode", value)}>${label}</button>`,
        )}</div>
      </div>
      <div class="field"><label for="angle">Row angle</label>
        <span><input id="angle" type="number" min="0" max="359" .value=${String(s.route_angle ?? 0)} ?disabled=${locked}
          @change=${(e: Event) => this._change("route_angle", Number((e.target as HTMLInputElement).value))} /> °</span>
      </div>
      <div class="field"><label for="laps">Edge laps</label>
        <input id="laps" type="number" min="0" max="5" .value=${String(s.edge_circles ?? 0)} ?disabled=${locked}
          @change=${(e: Event) => this._change("edge_circles", Number((e.target as HTMLInputElement).value))} />
      </div>
      <div class="kv small">
        <span>Blade height setting</span><span>${s.blade_height ?? "–"}</span>
        <span>Speed setting</span><span>${s.plan_speed ?? "–"}</span>
      </div>
      ${this._before
        ? html`<div class="decide">
            <span class="small">Saved on the robot. Keep this route?</span>
            <button class="btn primary" ?disabled=${this._busy} @click=${() => this._keep()}>Keep</button>
            <button class="btn" ?disabled=${this._busy} @click=${() => this._putBack()}>Put it back</button>
          </div>`
        : nothing}
      ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : nothing}
    </section>`;
  }

  static override styles = [
    pageStyles,
    css`
      .facts { border-top: 1px solid var(--divider-color); }
      label { font-size: 14px; }
      .settings { display: flex; flex-direction: column; gap: 12px; }
      .field { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
      .field input { width: 76px; }
      .seg button[disabled] { cursor: default; opacity: 0.7; }
      .decide { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid var(--divider-color); padding-top: 12px; }
      .decide span { flex: 1 1 100%; }
    `,
  ];
}

if (!customElements.get("yard-page-areas")) {
  customElements.define("yard-page-areas", YardPageAreas);
}
