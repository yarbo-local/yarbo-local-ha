/**
 * The body of a Yarbo pop-up. Home Assistant creates this element in place of its own
 * body for any entity whose state carries `custom_ui_more_info: yarbo-local-more-info`.
 *
 * Home Assistant still draws its own rows above ours: the entity's value, a history
 * graph and a change log. While this element is on screen it hides them, by adding one
 * style to the dialog's info view, and it takes the style away when it goes, so other
 * entities' pop-ups are untouched. That reaches into Home Assistant's own elements: a
 * release that renames them brings the rows back, and nothing else breaks.
 */
import type { HomeAssistant } from "./types";

export const MORE_INFO_TAG = "yarbo-local-more-info";

/** Home Assistant's element that holds the value row, history, log and our body. */
const INFO_VIEW = "ha-more-info-info";
const HIDE_DEFAULTS = "state-card-content, ha-more-info-history, ha-more-info-logbook { display: none !important; }";

interface StateObj {
  entity_id: string;
  attributes: Record<string, unknown>;
}

export class YarboLocalMoreInfo extends HTMLElement {
  hass?: HomeAssistant;
  stateObj?: StateObj;
  private _hider?: HTMLStyleElement;

  connectedCallback(): void {
    this._hideDefaults();
    this._render();
  }

  disconnectedCallback(): void {
    this._hider?.remove();
    this._hider = undefined;
  }

  /** Finds the info view by walking out through the shadow roots we sit in. */
  private _hideDefaults(): void {
    let root: Node = this.getRootNode();
    for (let depth = 0; depth < 6 && root instanceof ShadowRoot; depth++) {
      if (root.host.localName === INFO_VIEW) {
        const style = document.createElement("style");
        style.textContent = HIDE_DEFAULTS;
        root.appendChild(style);
        this._hider = style;
        return;
      }
      root = root.host.getRootNode();
    }
  }

  private _render(): void {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { display: block; }
        .body {
          padding: 24px 8px 32px;
          font-family: var(--ha-font-family-body, Roboto, sans-serif);
          font-size: 28px;
          font-weight: 500;
          color: var(--primary-text-color);
          text-align: center;
        }
      </style>
      <div class="body">hello world</div>`;
  }
}

if (!customElements.get(MORE_INFO_TAG)) {
  customElements.define(MORE_INFO_TAG, YarboLocalMoreInfo);
}
