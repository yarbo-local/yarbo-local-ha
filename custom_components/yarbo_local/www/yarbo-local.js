import { n as e, r as t, t as n } from "./yarbo-local-view-BOqjInrS.js";
//#region src/more-info.ts
var r = "yarbo-local-more-info", i = "ha-more-info-info", a = "state-card-content, ha-more-info-history, ha-more-info-logbook { display: none !important; }", o = class extends HTMLElement {
	hass;
	stateObj;
	_hider;
	connectedCallback() {
		this._hideDefaults(), this._render();
	}
	disconnectedCallback() {
		this._hider?.remove(), this._hider = void 0;
	}
	_hideDefaults() {
		let e = this.getRootNode();
		for (let t = 0; t < 6 && e instanceof ShadowRoot; t++) {
			if (e.host.localName === i) {
				let t = document.createElement("style");
				t.textContent = a, e.appendChild(t), this._hider = t;
				return;
			}
			e = e.host.getRootNode();
		}
	}
	_render() {
		let e = this.shadowRoot ?? this.attachShadow({ mode: "open" });
		e.innerHTML = "\n      <style>\n        :host { display: block; }\n        .body {\n          padding: 24px 8px 32px;\n          font-family: var(--ha-font-family-body, Roboto, sans-serif);\n          font-size: 28px;\n          font-weight: 500;\n          color: var(--primary-text-color);\n          text-align: center;\n        }\n      </style>\n      <div class=\"body\">hello world</div>";
	}
};
customElements.get("yarbo-local-more-info") || customElements.define(r, o);
//#endregion
//#region src/suggest.ts
var s = ["lawn_mower", "device_tracker"];
function c(e, t) {
	return e.entities?.[t]?.platform === "yarbo_local";
}
function l(e, t) {
	let n = t.split(".", 1)[0] ?? "";
	return !s.includes(n) || !c(e, t) ? null : { config: {
		type: "custom:yarbo-local-card",
		entity: t
	} };
}
function u(e) {
	let t = Object.values(e.entities ?? {}).filter((e) => e.platform === "yarbo_local");
	for (let e of s) {
		let n = t.find((t) => t.entity_id.startsWith(`${e}.`));
		if (n) return n.entity_id;
	}
	return t[0]?.entity_id ?? "";
}
//#endregion
//#region src/entry.ts
var d, f = () => d ??= import("./yarbo-local-view-DF7H_QGN.js"), p, m = () => p ??= import("./yarbo-local-view-BiU2leZO.js"), h = class extends HTMLElement {
	_config;
	_hass;
	_view;
	setConfig(t) {
		e(t), this._config = t, this._view?.setConfig(t);
	}
	set hass(e) {
		this._hass = e, this._view && (this._view.hass = e);
	}
	get hass() {
		return this._hass;
	}
	getCardSize() {
		return n(this._config);
	}
	getGridOptions() {
		return t(this._config);
	}
	static async getConfigElement() {
		return await f(), document.createElement("yarbo-local-card-editor");
	}
	static getStubConfig(e) {
		return {
			entity: u(e),
			title: "Yarbo"
		};
	}
	connectedCallback() {
		this.style.display = "block", this._show();
	}
	async _show() {
		if (this._view || (await f(), this._view)) return;
		let e = document.createElement("yarbo-local-card-view");
		this._config && e.setConfig(this._config), this._hass && (e.hass = this._hass), this._view = e, this.appendChild(e);
	}
}, g = class extends HTMLElement {
	_props = {};
	_view;
	set hass(e) {
		this._set("hass", e);
	}
	get hass() {
		return this._props.hass;
	}
	set narrow(e) {
		this._set("narrow", e);
	}
	get narrow() {
		return this._props.narrow;
	}
	set route(e) {
		this._set("route", e);
	}
	get route() {
		return this._props.route;
	}
	set panel(e) {
		this._set("panel", e);
	}
	get panel() {
		return this._props.panel;
	}
	_set(e, t) {
		this._props[e] = t, this._view && (this._view[e] = t);
	}
	connectedCallback() {
		this.style.display = "block", this.style.height = "100%", this._show();
	}
	async _show() {
		if (this._view || (await m(), this._view)) return;
		let e = document.createElement("yarbo-local-panel-view");
		Object.assign(e, this._props), this._view = e, this.appendChild(e);
	}
};
customElements.get("yarbo-local-panel") || customElements.define("yarbo-local-panel", g), customElements.get("yarbo-local-card") || customElements.define("yarbo-local-card", h), window.customCards = window.customCards ?? [], window.customCards.some((e) => e.type === "yarbo-local-card") || window.customCards.push({
	type: "yarbo-local-card",
	name: "Yarbo Local",
	description: "The robot's own map with zones, dock, live position, trail and an optional aerial photo.",
	preview: !1,
	documentationURL: "https://github.com/yarbo-local/yarbo-local-ha",
	getEntitySuggestion: l
}), console.info("%c YARBO LOCAL %c 0.3.0 ", "color:#fff;background:#2f8f86;border-radius:3px 0 0 3px", "color:#2f8f86;background:#e8f1f0;border-radius:0 3px 3px 0");
//#endregion
