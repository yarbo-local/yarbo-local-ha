import { LitElement, css, html } from "lit";
import "./yarbo-local-card";
import "./data-health";
import type { CardConfig, HomeAssistant } from "./types";

interface Route {
  prefix: string;
  path: string;
}

interface CardView extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: CardConfig): void;
}

const TABS = [
  { id: "overview", label: "Overview", admin: false },
  { id: "settings", label: "Settings", admin: true },
] as const;

/**
 * The integration's own page in the sidebar. Home Assistant gives it `hass`,
 * `narrow`, `route` and `panel`; the tab is the first part of the path after /yard.
 */
export class YarboLocalPanelView extends LitElement {
  static override properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    route: { attribute: false },
    panel: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare narrow: boolean;
  declare route?: Route;
  declare panel?: unknown;
  private _cards = new Map<string, CardView>();

  constructor() {
    super();
    this.narrow = false;
  }

  private get _admin(): boolean {
    return Boolean(this.hass?.user?.is_admin);
  }

  private get _tab(): string {
    const wanted = (this.route?.path ?? "").split("/").filter(Boolean)[0] ?? "overview";
    const tab = TABS.find((t) => t.id === wanted && (!t.admin || this._admin));
    return tab ? tab.id : "overview";
  }

  private _go(tab: string): void {
    const base = this.route?.prefix ?? "/yard";
    history.pushState(null, "", `${base}/${tab}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  /** Each robot's map, made once and kept, so switching tabs does not rebuild it. */
  private _robotCards(): CardView[] {
    const hass = this.hass;
    if (!hass) {
      return [];
    }
    const mowers = Object.values(hass.entities ?? {})
      .filter((e) => e.platform === "yarbo_local" && e.entity_id.startsWith("lawn_mower."))
      .map((e) => e.entity_id)
      .sort();
    return mowers.map((entity) => {
      let card = this._cards.get(entity);
      if (!card) {
        card = document.createElement("yarbo-local-card-view") as CardView;
        const name = hass.states[entity]?.attributes.friendly_name;
        card.setConfig({
          type: "custom:yarbo-local-card",
          entity,
          title: typeof name === "string" ? name : "Yarbo",
          height: 560,
        });
        this._cards.set(entity, card);
      }
      card.hass = hass;
      return card;
    });
  }

  override render() {
    const tab = this._tab;
    return html`
      <div class="toolbar">
        <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div class="title">Yard</div>
      </div>
      <nav class="tabs" aria-label="Yard sections">
        ${TABS.filter((t) => !t.admin || this._admin).map(
          (t) =>
            html`<button class=${t.id === tab ? "on" : ""} aria-current=${t.id === tab ? "page" : "false"}
              @click=${() => this._go(t.id)}>${t.label}</button>`,
        )}
      </nav>
      <main>
        ${tab === "settings"
          ? html`<yarbo-local-data-health .hass=${this.hass}></yarbo-local-data-health>`
          : this._overview()}
      </main>
    `;
  }

  private _overview() {
    const cards = this._robotCards();
    if (!cards.length) {
      return html`<p class="muted">No robot is set up yet. Add one under Settings, Devices and services.</p>`;
    }
    return html`<div class="maps">${cards}</div>`;
  }

  static override styles = css`
    :host {
      display: block;
      min-height: 100%;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
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
    .title { font-size: 20px; margin-left: 8px; }
    .tabs {
      display: flex;
      gap: 4px;
      padding: 0 16px;
      border-bottom: 1px solid var(--divider-color);
      overflow-x: auto;
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
    }
    .tabs button.on { color: var(--primary-text-color); border-bottom-color: var(--primary-color); }
    .tabs button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
    main { max-width: 1280px; margin: 0 auto; padding: 16px; }
    .maps { display: flex; flex-direction: column; gap: 16px; }
    .muted { color: var(--secondary-text-color); }
  `;
}

if (!customElements.get("yarbo-local-panel-view")) {
  customElements.define("yarbo-local-panel-view", YarboLocalPanelView);
}

