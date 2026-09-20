import { LitElement, html, nothing } from "lit";
import type { CardConfig, HomeAssistant } from "./types";

const SCHEMA = [
  { name: "entity", required: true, selector: { entity: { filter: { integration: "yarbo_local" } } } },
  { name: "title", selector: { text: {} } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "height", selector: { number: { min: 200, max: 1400, step: 20, mode: "box", unit_of_measurement: "px" } } },
      { name: "trail", selector: { boolean: {} } },
      { name: "follow", selector: { boolean: {} } },
      { name: "show_status", selector: { boolean: {} } },
    ],
  },
];

const LABELS: Record<string, string> = {
  entity: "Robot (any Yarbo Local entity)",
  title: "Title",
  height: "Map height",
  trail: "Show trail",
  follow: "Follow the robot",
  show_status: "Show status chips",
};

export class YarboLocalCardEditor extends LitElement {
  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: CardConfig;

  setConfig(config: CardConfig): void {
    this._config = config;
  }

  override render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    return html`<ha-form
      .hass=${this.hass}
      .data=${this._config}
      .schema=${SCHEMA}
      .computeLabel=${(s: { name: string }) => LABELS[s.name] ?? s.name}
      @value-changed=${this._changed}
    ></ha-form>`;
  }

  private _changed(ev: CustomEvent<{ value: CardConfig }>): void {
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: ev.detail.value }, bubbles: true, composed: true }),
    );
  }
}

if (!customElements.get("yarbo-local-card-editor")) {
  customElements.define("yarbo-local-card-editor", YarboLocalCardEditor);
}
