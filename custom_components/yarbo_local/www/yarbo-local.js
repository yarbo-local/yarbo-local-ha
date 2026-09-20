import { n as e, r as t, t as n } from "./yarbo-local-view-BOqjInrS.js";
//#region src/suggest.ts
var r = ["lawn_mower", "device_tracker"];
function i(e, t) {
	return e.entities?.[t]?.platform === "yarbo_local";
}
function a(e, t) {
	let n = t.split(".", 1)[0] ?? "";
	return !r.includes(n) || !i(e, t) ? null : { config: {
		type: "custom:yarbo-local-card",
		entity: t
	} };
}
function o(e) {
	let t = Object.values(e.entities ?? {}).filter((e) => e.platform === "yarbo_local");
	for (let e of r) {
		let n = t.find((t) => t.entity_id.startsWith(`${e}.`));
		if (n) return n.entity_id;
	}
	return t[0]?.entity_id ?? "";
}
//#endregion
//#region src/entry.ts
var s, c = () => s ??= import("./yarbo-local-view-D8nEIqCE.js"), l = class extends HTMLElement {
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
		return await c(), document.createElement("yarbo-local-card-editor");
	}
	static getStubConfig(e) {
		return {
			entity: o(e),
			title: "Yarbo"
		};
	}
	connectedCallback() {
		this.style.display = "block", this._show();
	}
	async _show() {
		if (this._view || (await c(), this._view)) return;
		let e = document.createElement("yarbo-local-card-view");
		this._config && e.setConfig(this._config), this._hass && (e.hass = this._hass), this._view = e, this.appendChild(e);
	}
};
customElements.get("yarbo-local-card") || customElements.define("yarbo-local-card", l), window.customCards = window.customCards ?? [], window.customCards.some((e) => e.type === "yarbo-local-card") || window.customCards.push({
	type: "yarbo-local-card",
	name: "Yarbo Local",
	description: "The robot's own map with zones, dock, live position, trail and an optional aerial photo.",
	preview: !1,
	documentationURL: "https://github.com/yarbo-local/yarbo-local-ha",
	getEntitySuggestion: a
}), console.info("%c YARBO LOCAL %c 0.1.0 ", "color:#fff;background:#2f8f86;border-radius:3px 0 0 3px", "color:#2f8f86;background:#e8f1f0;border-radius:0 3px 3px 0");
//#endregion
