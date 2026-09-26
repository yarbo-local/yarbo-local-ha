import { i as e, n as t, r as n, t as r } from "./yarbo-local-view-DIzI5o44.js";
//#region src/format.ts
function i(e) {
	if (e < 1024) return `${e} B`;
	let t = [
		"KB",
		"MB",
		"GB"
	], n = e / 1024, r = 0;
	for (; n >= 1024 && r < t.length - 1;) n /= 1024, r++;
	return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${t[r]}`;
}
function a(e, t, n) {
	let r = (e) => (/* @__PURE__ */ new Date(e * 1e3)).toLocaleDateString(n, {
		day: "numeric",
		month: "short",
		year: "numeric"
	});
	if (e == null && t == null) return "";
	let i = r(e ?? t), a = r(t ?? e);
	return i === a ? i : `${i} to ${a}`;
}
function o(e, t) {
	return e === "runs" ? `The last ${t} runs` : t === 0 ? "For good" : t % 365 == 0 ? t === 365 ? "1 year" : `${t / 365} years` : `${t} days`;
}
function s(e, t) {
	return `${e} ${e === 1 ? t.one : t.unit}`;
}
var c = {
	runs: {
		title: "Run summaries",
		about: "One record per run: plan, times, area, energy, distance, obstacles and faults. No positions.",
		unit: "runs",
		one: "run"
	},
	charges: {
		title: "Charge summaries",
		about: "One record per charge: battery before and after, charging speed and energy.",
		unit: "charges",
		one: "charge"
	},
	obstacles: {
		title: "Obstacle log",
		about: "Where the robot met obstacles in recent runs, as drawn on the map. Holds positions in your yard.",
		unit: "runs",
		one: "run"
	},
	plans: {
		title: "Plan memory",
		about: "When each plan last finished. Clearing it resets Last completed plan.",
		unit: "plans",
		one: "plan"
	},
	backgrounds: {
		title: "Aerial photo placement",
		about: "Where your aerial photo sits under the map, per robot. The photo itself is not stored here.",
		unit: "placements",
		one: "placement"
	}
}, l = class extends r {
	static properties = {
		hass: { attribute: !1 },
		_health: { state: !0 },
		_error: { state: !0 },
		_busy: { state: !0 },
		_confirm: { state: !0 }
	};
	constructor() {
		super(), this._busy = !1;
	}
	connectedCallback() {
		super.connectedCallback(), this._load();
	}
	async _load() {
		if (this.hass) try {
			this._health = await this.hass.callWS({ type: "yarbo_local/data/health" }), this._error = void 0;
		} catch (e) {
			this._error = e.message ?? String(e);
		}
	}
	async _run(e) {
		if (this.hass) {
			this._busy = !0;
			try {
				await this.hass.callWS(e), this._confirm = void 0, await this._load();
			} catch (e) {
				this._error = e.message ?? String(e);
			} finally {
				this._busy = !1;
			}
		}
	}
	render() {
		if (this._error) return n`<div class="error">${this._error}</div>`;
		let e = this._health;
		if (!e) return n`<div class="muted">Reading…</div>`;
		let r = this.hass?.locale?.language, a = /* @__PURE__ */ new Map();
		for (let t of e.datasets) t.retention && !a.has(t.dataset) && a.set(t.dataset, t);
		let s = Object.entries(e.robots);
		return n`
      <section class="card">
        <header>
          <div>
            <h2>Data kept by Yarbo Local</h2>
            <p class="muted">In Home Assistant's own storage folder on this machine. Nothing is sent anywhere.</p>
          </div>
          <div class="total"><b>${i(e.total_bytes)}</b><span class="muted">in total</span></div>
        </header>

        <h3>How long to keep</h3>
        <div class="keep">
          ${[...a.values()].map((e) => n`<label>
              <span>${c[e.dataset]?.title ?? e.dataset}</span>
              <select
                .value=${String(e.retention.value)}
                ?disabled=${this._busy}
                @change=${(t) => this._run({
			type: "yarbo_local/data/retention",
			dataset: e.dataset,
			value: Number(t.target.value)
		})}
              >
                ${e.retention.choices.map((t) => n`<option value=${String(t)} ?selected=${t === e.retention.value}>
                      ${o(e.retention.unit, t)}
                    </option>`)}
              </select>
            </label>`)}
        </div>

        ${s.map(([t, i]) => n`
            <h3>${i}</h3>
            <div class="rows">${e.datasets.filter((e) => e.serial === t).map((e) => this._row(e, r))}</div>
          `)}
        <h3>All robots</h3>
        <div class="rows">${e.datasets.filter((e) => e.serial === null).map((e) => this._row(e, r))}</div>

        ${e.recorder_keep_days == null ? t : n`<p class="muted foot">
              Home Assistant also keeps its own history of the Yarbo entities, for
              ${e.recorder_keep_days} days. That is set in Home Assistant's recorder, not here.
            </p>`}
      </section>
    `;
	}
	_row(e, t) {
		let r = c[e.dataset] ?? {
			title: e.dataset,
			about: "",
			unit: "records",
			one: "record"
		}, o = `${e.dataset}|${e.serial ?? ""}`, l = a(e.oldest, e.newest, t), u = this._confirm === o;
		return n`
      <div class="row">
        <div class="what">
          <b>${r.title}</b>
          <span class="muted">${r.about}</span>
        </div>
        <div class="count">
          <b>${s(e.records, r)}</b>
          <span class="muted">${[e.detail, l].filter(Boolean).join(" · ")}</span>
        </div>
        <div class="size">${i(e.bytes)}</div>
        <div class="act">
          ${u ? n`<span class="ask">Clear ${s(e.records, r)}? This cannot be undone.</span>
                <button class="danger" ?disabled=${this._busy} @click=${() => this._run({
			type: "yarbo_local/data/clear",
			dataset: e.dataset,
			confirm: !0,
			...e.serial ? { serial: e.serial } : {}
		})}>Clear</button>
                <button ?disabled=${this._busy} @click=${() => this._confirm = void 0}>Cancel</button>` : n`<button ?disabled=${this._busy || e.records === 0} @click=${() => this._confirm = o}>
                Clear…
              </button>`}
        </div>
      </div>
    `;
	}
	static styles = e`
    :host { display: block; }
    .card {
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 12px;
      padding: 16px 20px 20px;
      color: var(--primary-text-color);
    }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
    h2 { margin: 0 0 4px; font-size: 20px; font-weight: 400; }
    h3 { margin: 24px 0 8px; font-size: 14px; font-weight: 500; letter-spacing: 0.02em; }
    p { margin: 0; }
    .muted { color: var(--secondary-text-color); font-size: 13px; }
    .total { display: flex; flex-direction: column; align-items: flex-end; }
    .total b { font-size: 22px; font-weight: 400; font-variant-numeric: tabular-nums; }
    .keep { display: flex; flex-wrap: wrap; gap: 12px 24px; }
    .keep label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    select, button {
      font: inherit;
      font-size: 13px;
      color: var(--primary-text-color);
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #ccc);
      border-radius: 8px;
      padding: 6px 10px;
    }
    button { cursor: pointer; border-radius: 999px; padding: 6px 14px; }
    button:disabled { opacity: 0.5; cursor: default; }
    button.danger { background: var(--error-color, #db4437); border-color: var(--error-color, #db4437); color: #fff; }
    select:focus-visible, button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .rows { display: flex; flex-direction: column; }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 2.2fr) minmax(0, 1.4fr) 80px minmax(0, 1.4fr);
      gap: 12px;
      align-items: center;
      padding: 10px 0;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }
    .what, .count { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .what b, .count b { font-weight: 500; }
    .size { font-variant-numeric: tabular-nums; text-align: right; color: var(--secondary-text-color); }
    .act { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; align-items: center; }
    .ask { font-size: 12px; color: var(--error-color, #db4437); }
    .foot { margin-top: 20px; }
    .error { color: var(--error-color, #db4437); padding: 16px; }
    @media (max-width: 700px) {
      .row { grid-template-columns: 1fr auto; }
      .what { grid-column: 1 / -1; }
      .size { text-align: left; }
      .act { grid-column: 1 / -1; justify-content: flex-start; }
    }
  `;
};
customElements.get("yarbo-local-data-health") || customElements.define("yarbo-local-data-health", l);
//#endregion
//#region src/panel.ts
var u = [{
	id: "overview",
	label: "Overview",
	admin: !1
}, {
	id: "settings",
	label: "Settings",
	admin: !0
}], d = class extends r {
	static properties = {
		hass: { attribute: !1 },
		narrow: { type: Boolean },
		route: { attribute: !1 },
		panel: { attribute: !1 }
	};
	_cards = /* @__PURE__ */ new Map();
	constructor() {
		super(), this.narrow = !1;
	}
	get _admin() {
		return !!this.hass?.user?.is_admin;
	}
	get _tab() {
		let e = (this.route?.path ?? "").split("/").filter(Boolean)[0] ?? "overview", t = u.find((t) => t.id === e && (!t.admin || this._admin));
		return t ? t.id : "overview";
	}
	_go(e) {
		let t = this.route?.prefix ?? "/yard";
		history.pushState(null, "", `${t}/${e}`), window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: !1 } }));
	}
	_robotCards() {
		let e = this.hass;
		return e ? Object.values(e.entities ?? {}).filter((e) => e.platform === "yarbo_local" && e.entity_id.startsWith("lawn_mower.")).map((e) => e.entity_id).sort().map((t) => {
			let n = this._cards.get(t);
			if (!n) {
				n = document.createElement("yarbo-local-card-view");
				let r = e.states[t]?.attributes.friendly_name;
				n.setConfig({
					type: "custom:yarbo-local-card",
					entity: t,
					title: typeof r == "string" ? r : "Yarbo",
					height: 560
				}), this._cards.set(t, n);
			}
			return n.hass = e, n;
		}) : [];
	}
	render() {
		let e = this._tab;
		return n`
      <div class="toolbar">
        <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div class="title">Yard</div>
      </div>
      <nav class="tabs" aria-label="Yard sections">
        ${u.filter((e) => !e.admin || this._admin).map((t) => n`<button class=${t.id === e ? "on" : ""} aria-current=${t.id === e ? "page" : "false"}
              @click=${() => this._go(t.id)}>${t.label}</button>`)}
      </nav>
      <main>
        ${e === "settings" ? n`<yarbo-local-data-health .hass=${this.hass}></yarbo-local-data-health>` : this._overview()}
      </main>
    `;
	}
	_overview() {
		let e = this._robotCards();
		return e.length ? n`<div class="maps">${e}</div>` : n`<p class="muted">No robot is set up yet. Add one under Settings, Devices and services.</p>`;
	}
	static styles = e`
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
};
customElements.get("yarbo-local-panel-view") || customElements.define("yarbo-local-panel-view", d);
//#endregion
export { d as YarboLocalPanelView };
