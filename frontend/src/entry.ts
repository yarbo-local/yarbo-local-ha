/**
 * The one file Home Assistant loads on every page, so it stays tiny: names and a loader.
 * The drawing code, with Lit and the icons, is a second file fetched the first time a
 * Yarbo element is actually put on screen.
 */
import { cardSize, checkConfig, gridOptions } from "./config";
import { defaultEntity, entitySuggestion } from "./suggest";
import type { CardConfig, HomeAssistant } from "./types";

declare const __VERSION__: string;

interface CardView extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: CardConfig): void;
}

let loading: Promise<unknown> | undefined;
const load = (): Promise<unknown> => (loading ??= import("./yarbo-local-card"));

/** `custom:yarbo-local-card`. Holds what Home Assistant gives it until the view has loaded. */
class YarboLocalCardLoader extends HTMLElement {
  private _config?: CardConfig;
  private _hass?: HomeAssistant;
  private _view?: CardView;

  setConfig(config: CardConfig): void {
    checkConfig(config);
    this._config = config;
    this._view?.setConfig(config);
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._view) {
      this._view.hass = hass;
    }
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  getCardSize(): number {
    return cardSize(this._config);
  }

  getGridOptions() {
    return gridOptions(this._config);
  }

  static async getConfigElement(): Promise<HTMLElement> {
    await load();
    return document.createElement("yarbo-local-card-editor");
  }

  static getStubConfig(hass: HomeAssistant): Partial<CardConfig> {
    return { entity: defaultEntity(hass), title: "Yarbo" };
  }

  connectedCallback(): void {
    this.style.display = "block";
    void this._show();
  }

  private async _show(): Promise<void> {
    if (this._view) {
      return;
    }
    await load();
    if (this._view) {
      return; // connected twice while loading
    }
    const view = document.createElement("yarbo-local-card-view") as CardView;
    if (this._config) {
      view.setConfig(this._config);
    }
    if (this._hass) {
      view.hass = this._hass;
    }
    this._view = view;
    this.appendChild(view);
  }
}

if (!customElements.get("yarbo-local-card")) {
  customElements.define("yarbo-local-card", YarboLocalCardLoader);
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "yarbo-local-card")) {
  window.customCards.push({
    type: "yarbo-local-card",
    name: "Yarbo Local",
    description: "The robot's own map with zones, dock, live position, trail and an optional aerial photo.",
    preview: false,
    documentationURL: "https://github.com/yarbo-local/yarbo-local-ha",
    getEntitySuggestion: entitySuggestion,
  });
}

console.info(`%c YARBO LOCAL %c ${__VERSION__} `, "color:#fff;background:#2f8f86;border-radius:3px 0 0 3px", "color:#2f8f86;background:#e8f1f0;border-radius:0 3px 3px 0");
