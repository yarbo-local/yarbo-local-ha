import { LitElement, css, html, nothing } from "lit";
import { mdiAlertCircle, mdiPauseCircleOutline, mdiRobotMowerOutline, mdiWifiOff } from "@mdi/js";
import "./yarbo-local-card";
import "./data-health";
import "./chart";
import "./page-overview";
import "./page-areas";
import "./page-history";
import "./page-robot";
import { pageStyles } from "./panel-styles";
import type { HomeAssistant, LiveEvent, MapData, StreamEvent } from "./types";
import { nowLine, type CommandName, type NowLine, type YardData } from "./yard";
import type { MapElement, YardContext } from "./context";

interface Route {
  prefix: string;
  path: string;
}

const TABS = [
  { id: "overview", label: "Overview", admin: false },
  { id: "areas", label: "Areas", admin: false },
  { id: "history", label: "History", admin: false },
  { id: "map", label: "Map", admin: false },
  { id: "robot", label: "Robot", admin: false },
  { id: "settings", label: "Settings", admin: true },
] as const;

const REFRESH_MS = 60_000;

const NOW_ICON: Record<NowLine["kind"], string> = {
  off: mdiWifiOff,
  bad: mdiAlertCircle,
  held: mdiPauseCircleOutline,
  work: mdiRobotMowerOutline,
  idle: mdiRobotMowerOutline,
};

const ACTION_LABEL: Record<CommandName, string> = {
  start: "Run a plan",
  pause: "Pause",
  resume: "Resume",
  stop: "Stop",
  dock: "Send home",
};

/**
 * The integration's page in the sidebar. Home Assistant gives it `hass`, `narrow`,
 * `route` and `panel`; the page is the first part of the path after /yard. It holds
 * what the pages share: the robot's stream, its record, and sending it commands.
 */
export class YarboLocalPanelView extends LitElement {
  static override properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    route: { attribute: false },
    panel: { attribute: false },
    _robot: { state: true },
    _yard: { state: true },
    _map: { state: true },
    _live: { state: true },
    _error: { state: true },
    _busy: { state: true },
    _confirm: { state: true },
    _plan: { state: true },
  };

  declare hass?: HomeAssistant;
  declare narrow: boolean;
  declare route?: Route;
  declare panel?: unknown;
  declare _robot?: string;
  declare _yard?: YardData;
  declare _map?: MapData;
  declare _live?: LiveEvent;
  declare _error?: string;
  declare _busy: boolean;
  declare _confirm?: { action: CommandName; planId?: number; text: string };
  declare _plan?: number;

  private _cards = new Map<string, MapElement>();
  private _unsubscribe?: () => Promise<void> | void;
  private _timer?: ReturnType<typeof setInterval>;
  private _running?: boolean;
  private _available?: boolean;

  constructor() {
    super();
    this.narrow = false;
    this._busy = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._timer = setInterval(() => void this._refresh(), REFRESH_MS);
    if (this._robot) {
      void this._subscribe();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
    void this._stream(undefined);
  }

  private get _admin(): boolean {
    return Boolean(this.hass?.user?.is_admin);
  }

  private get _robots(): string[] {
    return Object.values(this.hass?.entities ?? {})
      .filter((e) => e.platform === "yarbo_local" && e.entity_id.startsWith("lawn_mower."))
      .map((e) => e.entity_id)
      .sort();
  }

  private get _tab(): string {
    const wanted = (this.route?.path ?? "").split("/").filter(Boolean)[0] ?? "overview";
    const tab = TABS.find((t) => t.id === wanted && (!t.admin || this._admin));
    return tab ? tab.id : "overview";
  }

  private get _rest(): string[] {
    return (this.route?.path ?? "").split("/").filter(Boolean).slice(1);
  }

  private _go(path: string): void {
    const base = this.route?.prefix ?? "/yard";
    history.pushState(null, "", `${base}/${path}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  override willUpdate(): void {
    const robots = this._robots;
    if (!robots.length) {
      return;
    }
    if (!this._robot || !robots.includes(this._robot)) {
      this._robot = robots[0];
      void this._load();
    }
    const state = this.hass?.states[this._robot!]?.state;
    const available = state !== undefined && state !== "unavailable";
    if (this._available === false && available) {
      void this._load(); // the robot came back
    }
    this._available = available;
  }

  private async _load(): Promise<void> {
    await Promise.all([this._refresh(), this._loadMap(), this._subscribe()]);
  }

  private async _refresh(): Promise<void> {
    const entity = this._robot;
    if (!entity || !this.hass) {
      return;
    }
    try {
      this._yard = await this.hass.callWS<YardData>({ type: "yarbo_local/yard", entity_id: entity });
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    }
  }

  private async _loadMap(): Promise<void> {
    if (!this._robot || !this.hass) {
      return;
    }
    try {
      this._map = await this.hass.callWS<MapData>({ type: "yarbo_local/map", entity_id: this._robot });
    } catch {
      this._map = undefined; // the card says why; the pages show what they can without it
    }
  }

  private async _stream(unsubscribe: (() => Promise<void> | void) | undefined): Promise<void> {
    const old = this._unsubscribe;
    this._unsubscribe = unsubscribe;
    try {
      await old?.();
    } catch {
      // connection already gone
    }
  }

  private async _subscribe(): Promise<void> {
    if (!this._robot || !this.hass) {
      return;
    }
    try {
      const unsubscribe = await this.hass.connection.subscribeMessage<StreamEvent>((event) => this._onEvent(event), {
        type: "yarbo_local/subscribe_live",
        entity_id: this._robot,
      });
      await this._stream(unsubscribe);
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    }
  }

  private _onEvent(event: StreamEvent): void {
    if (event.type === "live") {
      this._live = event;
      if (this._running !== undefined && this._running !== event.plan_running) {
        void this._refresh(); // a run began or ended: the record has changed
      }
      this._running = event.plan_running;
    } else if (event.type === "map_changed") {
      void this._loadMap();
    }
  }

  private _askCommand(action: CommandName, planId?: number): void {
    const plan = this._yard?.plans.find((p) => p.id === planId);
    if (action === "start") {
      if (!plan) {
        this._error = "Choose a plan first.";
        return;
      }
      this._confirm = { action, planId, text: `Start "${plan.name}"? The robot will leave the dock with its blades on.` };
    } else if (action === "stop") {
      this._confirm = { action, text: "Stop the plan? The robot stays where it is." };
    } else {
      void this._send(action);
    }
  }

  private async _send(action: CommandName, planId?: number): Promise<void> {
    this._confirm = undefined;
    this._busy = true;
    this._error = undefined;
    try {
      await this.hass?.callWS({
        type: "yarbo_local/command",
        entity_id: this._robot,
        action,
        ...(planId !== undefined ? { plan_id: planId } : {}),
      });
      await this._refresh();
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  /** One map per place on the panel, kept, so going back to a page does not rebuild it. */
  private _card = (key: string, height: number): MapElement => {
    const entity = this._robot as string;
    const id = `${entity}:${key}`;
    let card = this._cards.get(id);
    if (!card) {
      card = document.createElement("yarbo-local-card-view") as MapElement;
      card.setConfig({ type: "custom:yarbo-local-card", entity, height, show_status: false, title: "" });
      this._cards.set(id, card);
    }
    card.hass = this.hass;
    return card;
  };

  private get _ctx(): YardContext {
    return {
      hass: this.hass as HomeAssistant,
      entity: this._robot as string,
      yard: this._yard,
      map: this._map,
      live: this._live,
      admin: this._admin,
      narrow: this.narrow,
      card: this._card,
      go: (path) => this._go(path),
      refresh: () => this._refresh(),
    };
  }

  override render() {
    const tab = this._tab;
    return html`
      <div class="toolbar">
        <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div class="title">Yard</div>
        ${this._robots.length > 1
          ? html`<select aria-label="Robot" @change=${(e: Event) => this._pick((e.target as HTMLSelectElement).value)}>
              ${this._robots.map(
                (r) => html`<option value=${r} ?selected=${r === this._robot}>${this.hass?.states[r]?.attributes.friendly_name ?? r}</option>`,
              )}
            </select>`
          : nothing}
      </div>
      <nav class="tabs" aria-label="Yard sections">
        ${TABS.filter((t) => !t.admin || this._admin).map(
          (t) =>
            html`<button class=${t.id === tab ? "on" : ""} aria-current=${t.id === tab ? "page" : "false"}
              @click=${() => this._go(t.id)}>${t.label}</button>`,
        )}
      </nav>
      <main>${this._robot ? this._page(tab) : html`<p class="muted">No robot is set up yet. Add one under Settings, Devices and services.</p>`}</main>
      ${this._renderConfirm()}
    `;
  }

  private _pick(entity: string): void {
    this._robot = entity;
    this._yard = undefined;
    this._live = undefined;
    this._map = undefined;
    this._running = undefined;
    void this._load();
  }

  private _page(tab: string) {
    const ctx = this._ctx;
    const now = tab === "settings" ? nothing : this._renderNow();
    switch (tab) {
      case "areas":
        return html`${now}<yard-page-areas .ctx=${ctx} .selected=${Number(this._rest[0]) || undefined}></yard-page-areas>`;
      case "history":
        return html`${now}<yard-page-history .ctx=${ctx} .runKey=${Number(this._rest[0]) || undefined}></yard-page-history>`;
      case "map":
        return html`${now}<section class="card mapcard">${this._card("map", Math.max(420, window.innerHeight - 280))}</section>`;
      case "robot":
        return html`${now}<yard-page-robot .ctx=${ctx}></yard-page-robot>`;
      case "settings":
        return html`<yarbo-local-data-health .hass=${this.hass}></yarbo-local-data-health>`;
      default:
        return html`${now}<yard-page-overview .ctx=${ctx}></yard-page-overview>`;
    }
  }

  private _renderNow() {
    const line = nowLine(this._live, this._yard, Date.now() / 1000, this.hass?.locale?.language);
    const startable = line.actions.includes("start");
    const plans = this._yard?.plans ?? [];
    const plan = this._plan ?? plans[0]?.id;
    return html`<section class="card now ${line.kind}" aria-live="polite">
      <span class="dot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d=${NOW_ICON[line.kind]}></path></svg></span>
      <div class="say">
        <b>${line.title}</b>
        ${line.detail ? html`<span>${line.detail}</span>` : nothing}
        ${line.percent !== null ? html`<div class="bar"><i style="width:${line.percent}%"></i></div>` : nothing}
        ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : nothing}
      </div>
      ${this._admin && line.actions.length
        ? html`<div class="acts">
            ${startable && plans.length
              ? html`<select aria-label="Plan" @change=${(e: Event) => (this._plan = Number((e.target as HTMLSelectElement).value))}>
                  ${plans.map((p) => html`<option value=${p.id} ?selected=${p.id === plan}>${p.name}</option>`)}
                </select>`
              : nothing}
            ${line.actions.map(
              (action) => html`<button class="btn ${action === "resume" || action === "start" ? "primary" : ""}"
                ?disabled=${this._busy || (action === "start" && !plans.length)}
                @click=${() => this._askCommand(action, action === "start" ? plan : undefined)}>${ACTION_LABEL[action]}</button>`,
            )}
          </div>`
        : nothing}
    </section>`;
  }

  private _renderConfirm() {
    const ask = this._confirm;
    if (!ask) {
      return nothing;
    }
    return html`<div class="scrim" role="dialog" aria-modal="true" aria-label="Confirm">
      <div class="dialog">
        <p>${ask.text}</p>
        <div class="acts">
          <button class="btn" @click=${() => (this._confirm = undefined)}>Cancel</button>
          <button class="btn primary" @click=${() => this._send(ask.action, ask.planId)}>${ACTION_LABEL[ask.action] === "Run a plan" ? "Start" : ACTION_LABEL[ask.action]}</button>
        </div>
      </div>
    </div>`;
  }

  static override styles = [
    pageStyles,
    css`
      :host {
        display: block;
        min-height: 100%;
        background: var(--primary-background-color);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        height: var(--header-height, 56px);
        padding: 0 12px;
        background: var(--app-header-background-color, var(--primary-background-color));
        color: var(--app-header-text-color, var(--primary-text-color));
        border-bottom: var(--app-header-border-bottom, none);
      }
      .toolbar select { margin-left: auto; }
      .title { font-size: 20px; margin-left: 8px; }
      .tabs {
        display: flex;
        gap: 2px;
        padding: 0 12px;
        border-bottom: 1px solid var(--divider-color);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .tabs button {
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        background: none;
        border: 0;
        border-bottom: 2px solid transparent;
        color: var(--secondary-text-color);
        padding: 12px 14px;
        cursor: pointer;
        white-space: nowrap;
      }
      .tabs button.on { color: var(--primary-text-color); border-bottom-color: var(--primary-color); }
      .tabs button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
      main { max-width: 1280px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
      .mapcard { overflow: hidden; }
      .now { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 16px; }
      .dot { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; --c: var(--success-color, #43a047); background: color-mix(in srgb, var(--c) 18%, transparent); }
      .dot svg { width: 22px; height: 22px; fill: var(--c); }
      .now.work .dot { --c: var(--info-color, #3a7fc0); }
      .now.held .dot { --c: var(--warning-color, #e39500); }
      .now.off .dot { --c: var(--secondary-text-color); }
      .now.bad .dot { --c: var(--error-color, #db4437); }
      .now.bad { border-color: color-mix(in srgb, var(--error-color, #db4437) 55%, var(--divider-color)); }
      .say { flex: 1 1 320px; min-width: 0; }
      .say b { display: block; font-size: 17px; font-weight: 500; }
      .say span { color: var(--secondary-text-color); font-size: 14px; }
      .bar { height: 4px; border-radius: 2px; background: var(--divider-color); margin-top: 8px; overflow: hidden; max-width: 420px; }
      .bar i { display: block; height: 100%; background: var(--info-color, #3a7fc0); }
      .acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 20; }
      .dialog { background: var(--card-background-color, #fff); border-radius: 16px; padding: 20px; width: min(420px, 100%); }
      .dialog p { margin: 0 0 16px; }
      .dialog .acts { justify-content: flex-end; }
    `,
  ];
}

if (!customElements.get("yarbo-local-panel-view")) {
  customElements.define("yarbo-local-panel-view", YarboLocalPanelView);
}
