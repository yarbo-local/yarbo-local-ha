import { a as e, c as t, d as n, f as r, i, l as a, n as o, o as s, p as c, r as l, s as u, t as d, u as f } from "./yarbo-local-view-BR9cOn-r.js";
//#region src/format.ts
function p(e) {
	if (e < 1024) return `${e} B`;
	let t = [
		"KB",
		"MB",
		"GB"
	], n = e / 1024, r = 0;
	for (; n >= 1024 && r < t.length - 1;) n /= 1024, r++;
	return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${t[r]}`;
}
function ee(e, t, n) {
	let r = (e) => (/* @__PURE__ */ new Date(e * 1e3)).toLocaleDateString(n, {
		day: "numeric",
		month: "short",
		year: "numeric"
	});
	if (e == null && t == null) return "";
	let i = r(e ?? t), a = r(t ?? e);
	return i === a ? i : `${i} to ${a}`;
}
function te(e, t) {
	return e === "runs" ? `The last ${t} runs` : t === 0 ? "For good" : t % 365 == 0 ? t === 365 ? "1 year" : `${t / 365} years` : `${t} days`;
}
function m(e, t) {
	return `${e} ${e === 1 ? t.one : t.unit}`;
}
var h = {
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
	tracks: {
		title: "Run tracks",
		about: "Where the robot drove in the last 50 runs, for replay on the History page. Holds positions in your yard.",
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
}, g = class extends a {
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
		let t = this.hass?.locale?.language, r = /* @__PURE__ */ new Map();
		for (let t of e.datasets) t.retention && !r.has(t.dataset) && r.set(t.dataset, t);
		let i = Object.entries(e.robots);
		return n`
      <section class="card">
        <header>
          <div>
            <h2>Data kept by Yarbo Local</h2>
            <p class="muted">In Home Assistant's own storage folder on this machine. Nothing is sent anywhere.</p>
          </div>
          <div class="total"><b>${p(e.total_bytes)}</b><span class="muted">in total</span></div>
        </header>

        <h3>How long to keep</h3>
        <div class="keep">
          ${[...r.values()].map((e) => n`<label>
              <span>${h[e.dataset]?.title ?? e.dataset}</span>
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
                      ${te(e.retention.unit, t)}
                    </option>`)}
              </select>
            </label>`)}
        </div>

        ${i.map(([r, i]) => n`
            <h3>${i}</h3>
            <div class="rows">${e.datasets.filter((e) => e.serial === r).map((e) => this._row(e, t))}</div>
          `)}
        <h3>All robots</h3>
        <div class="rows">${e.datasets.filter((e) => e.serial === null).map((e) => this._row(e, t))}</div>

        ${e.recorder_keep_days == null ? f : n`<p class="muted foot">
              Home Assistant also keeps its own history of the Yarbo entities, for
              ${e.recorder_keep_days} days. That is set in Home Assistant's recorder, not here.
            </p>`}
      </section>
    `;
	}
	_row(e, t) {
		let r = h[e.dataset] ?? {
			title: e.dataset,
			about: "",
			unit: "records",
			one: "record"
		}, i = `${e.dataset}|${e.serial ?? ""}`, a = ee(e.oldest, e.newest, t), o = this._confirm === i;
		return n`
      <div class="row">
        <div class="what">
          <b>${r.title}</b>
          <span class="muted">${r.about}</span>
        </div>
        <div class="count">
          <b>${m(e.records, r)}</b>
          <span class="muted">${[e.detail, a].filter(Boolean).join(" · ")}</span>
        </div>
        <div class="size">${p(e.bytes)}</div>
        <div class="act">
          ${o ? n`<span class="ask">Clear ${m(e.records, r)}? This cannot be undone.</span>
                <button class="danger" ?disabled=${this._busy} @click=${() => this._run({
			type: "yarbo_local/data/clear",
			dataset: e.dataset,
			confirm: !0,
			...e.serial ? { serial: e.serial } : {}
		})}>Clear</button>
                <button ?disabled=${this._busy} @click=${() => this._confirm = void 0}>Cancel</button>` : n`<button ?disabled=${this._busy || e.records === 0} @click=${() => this._confirm = i}>
                Clear…
              </button>`}
        </div>
      </div>
    `;
	}
	static styles = c`
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
customElements.get("yarbo-local-data-health") || customElements.define("yarbo-local-data-health", g);
//#endregion
//#region src/chart.ts
var _ = 520, ne = 120, v = 40, re = class extends a {
	static properties = {
		label: {},
		unit: {},
		series: { attribute: !1 },
		color: {},
		digits: { type: Number },
		_hover: { state: !0 }
	};
	constructor() {
		super(), this.label = "", this.unit = "", this.series = [], this.color = "var(--primary-color, #1e88e5)", this.digits = 0;
	}
	_value(e) {
		return `${e.toFixed(this.digits)}${this.unit ? ` ${this.unit}` : ""}`;
	}
	_scale() {
		let e = this.series.map((e) => e[0]), t = this.series.map((e) => e[1]), [n, r] = [Math.min(...e), Math.max(...e)], [i, a] = [Math.min(...t), Math.max(...t)];
		return i === a && (--i, a += 1), {
			x: (e) => v + (e - n) / Math.max(1, r - n) * 476,
			y: (e) => 6 + (1 - (e - i) / (a - i)) * 94,
			x0: n,
			x1: r,
			y0: i,
			y1: a
		};
	}
	_move(e) {
		let t = e.currentTarget.getBoundingClientRect(), { x0: n, x1: r } = this._scale(), i = n + ((e.clientX - t.left) / t.width * _ - v) / 476 * (r - n), a = this.series[0];
		for (let e of this.series) a && Math.abs(e[0] - i) < Math.abs(a[0] - i) && (a = e);
		this._hover = a;
	}
	_when(e) {
		let t = this.series.length > 1 ? this.series[this.series.length - 1][0] - this.series[0][0] : 0, n = /* @__PURE__ */ new Date(e * 1e3);
		return t < 86400 ? n.toLocaleTimeString(void 0, {
			hour: "numeric",
			minute: "2-digit"
		}) : n.toLocaleDateString(void 0, {
			month: "short",
			day: "numeric"
		});
	}
	render() {
		if (this.series.length < 2) return n`<div class="head"><span>${this.label}</span><b>${this.series[0] ? this._value(this.series[0][1]) : "–"}</b></div>
        <div class="empty">Not enough readings yet</div>`;
		let { x: e, y: t, x0: i, x1: a, y0: o, y1: s } = this._scale(), c = this.series.map((n) => `${e(n[0]).toFixed(1)},${t(n[1]).toFixed(1)}`).join(" "), l = this._hover ?? this.series[this.series.length - 1], u = [
			s,
			(o + s) / 2,
			o
		];
		return n`<div class="head">
        <span>${this.label}</span>
        <b>${this._value(l[1])}${this._hover ? n`<small> ${this._when(l[0])}</small>` : f}</b>
      </div>
      <svg viewBox="0 0 ${_} ${ne}" role="img" aria-label=${this.label}
        @pointermove=${this._move} @pointerleave=${() => this._hover = void 0}>
        ${u.map((e) => r`<line class="grid" x1=${v} x2=${_} y1=${t(e)} y2=${t(e)}></line>
            <text class="tick" x=${34} y=${t(e) + 3} text-anchor="end">${e.toFixed(this.digits)}</text>`)}
        <polyline points=${c} fill="none" stroke=${this.color} stroke-width="1.5" vector-effect="non-scaling-stroke"></polyline>
        ${this._hover ? r`<line class="cross" x1=${e(l[0])} x2=${e(l[0])} y1="4" y2=${102}></line>
              <circle cx=${e(l[0])} cy=${t(l[1])} r="3" fill=${this.color}></circle>` : f}
        <text class="tick" x=${v} y=${116}>${this._when(i)}</text>
        <text class="tick" x=${518} y=${116} text-anchor="end">${this._when(a)}</text>
      </svg>`;
	}
	static styles = c`
    :host { display: block; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; color: var(--secondary-text-color); }
    .head b { color: var(--primary-text-color); font-weight: 500; font-variant-numeric: tabular-nums; }
    .head small { color: var(--secondary-text-color); font-weight: 400; }
    svg { display: block; width: 100%; height: auto; touch-action: pan-y; }
    .grid { stroke: var(--divider-color); stroke-width: 1; }
    .cross { stroke: var(--secondary-text-color); stroke-width: 1; stroke-dasharray: 3 3; }
    .tick { font-size: 10px; fill: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
    .empty { color: var(--secondary-text-color); font-size: 12px; padding: 18px 0; }
  `;
};
customElements.get("yard-chart") || customElements.define("yard-chart", re);
//#endregion
//#region src/panel-styles.ts
var y = c`
  :host { display: block; color: var(--primary-text-color); }
  * { box-sizing: border-box; }
  .stack { display: flex; flex-direction: column; gap: 16px; }
  .grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; align-items: start; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
  .card {
    background: var(--card-background-color, #fff);
    border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px);
    min-width: 0;
    overflow: hidden;
  }
  .pad { padding: 14px 16px; }
  h2 { margin: 0; font-size: 15px; font-weight: 500; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  h2 a, a.link { font-size: 12px; font-weight: 500; color: var(--primary-color); cursor: pointer; text-decoration: none; }
  .muted { color: var(--secondary-text-color); }
  .small { font-size: 12px; }
  .tile { background: var(--secondary-background-color); border-radius: 10px; padding: 8px 10px; min-width: 0; }
  .tile small { display: block; font-size: 11px; color: var(--secondary-text-color); }
  .tile b { display: block; font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile span { font-size: 11px; color: var(--secondary-text-color); }
  .row { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--divider-color); width: 100%; background: none; border-left: 0; border-right: 0; border-bottom: 0; font: inherit; color: inherit; text-align: left; }
  button.row { cursor: pointer; }
  button.row:hover { background: var(--secondary-background-color); }
  .when { font-size: 12px; line-height: 1.25; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .when b { display: block; color: var(--primary-text-color); font-weight: 500; font-size: 13px; }
  .what { min-width: 0; }
  .what b { display: block; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .what span { font-size: 12px; color: var(--secondary-text-color); }
  .chip { font-size: 11px; border-radius: 999px; padding: 2px 8px; border: 1px solid var(--divider-color); color: var(--secondary-text-color); white-space: nowrap; }
  .chip.ok { color: var(--success-color, #43a047); border-color: currentColor; }
  .chip.warn { color: var(--warning-color, #e39500); border-color: currentColor; }
  .chip.bad { color: var(--error-color, #db4437); border-color: currentColor; }
  .btn { font: inherit; font-size: 13px; font-weight: 500; color: var(--primary-text-color); background: var(--card-background-color, #fff); border: 1px solid var(--divider-color); border-radius: 999px; padding: 7px 14px; cursor: pointer; white-space: nowrap; }
  .btn:hover:not([disabled]) { background: var(--secondary-background-color); }
  .btn.primary { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .btn.danger { color: var(--error-color, #db4437); border-color: currentColor; }
  .btn[disabled] { opacity: 0.5; cursor: default; }
  .btn:focus-visible, button.row:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  select, input[type="number"] { font: inherit; color: inherit; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color); border-radius: 8px; padding: 6px 8px; min-width: 0; }
  .kv { display: grid; grid-template-columns: 1fr auto; gap: 7px 16px; font-size: 13px; }
  .kv > :nth-child(odd) { color: var(--secondary-text-color); }
  .kv > :nth-child(even) { text-align: right; font-variant-numeric: tabular-nums; }
  .error { color: var(--error-color, #db4437); font-size: 13px; }
  .empty { padding: 24px 16px; color: var(--secondary-text-color); font-size: 14px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--secondary-text-color); }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -2px; border: 1.5px solid; }
  .seg { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden; }
  .seg button { font: inherit; font-size: 12px; background: none; color: inherit; border: 0; padding: 5px 10px; cursor: pointer; }
  .seg button[aria-pressed="true"] { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { text-align: left; font-weight: 500; font-size: 12px; color: var(--secondary-text-color); padding: 8px 12px; white-space: nowrap; }
  td { padding: 9px 12px; border-top: 1px solid var(--divider-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--secondary-background-color); }
  .scroll { overflow-x: auto; }
  @media (max-width: 900px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 520px) {
    .row { grid-template-columns: 54px minmax(0, 1fr); }
    .row .chip { display: none; }
    .hide-narrow { display: none; }
  }
`, b = 604800;
function x(e) {
	return e ? e.charAt(0).toUpperCase() + e.slice(1) : "Unnamed";
}
function S(e, t, n) {
	if (!e) return [];
	let r = t?.plans ?? [];
	return e.zones.filter((e) => e.family === "areas" && e.id !== null).map((e) => {
		let i = e.id, a = r.filter((e) => e.area_ids.includes(i)), o = a.map((e) => t?.last_completed[String(e.id)]).filter((e) => typeof e == "number"), s = o.length ? Math.max(...o) : null, c = t?.progress?.current_area_id === i, l = c ? "work" : s === null ? "never" : n - s <= b ? "done" : "stale", u = c ? "Working now" : s === null ? "No finished run on record" : `Finished ${N(s, n)}`;
		return {
			zone: e,
			id: i,
			name: x(e.name),
			plans: a,
			lastDone: s,
			state: l,
			line: u
		};
	});
}
function C(e, t) {
	let n = e.filter((e) => e.area_ids.includes(t));
	return n.find((e) => e.area_ids.length === 1) ?? n[0];
}
var w = {
	mower: "Mowing",
	mower_pro: "Mowing",
	snow_blower: "Clearing snow from",
	leaf_blower: "Blowing leaves from",
	trimmer: "Trimming"
}, T = (e) => w[e ?? ""] ?? "Working on";
function ie(e, t, n, r) {
	let i = t?.title ?? "The robot";
	if (!t?.reachable || e && !e.connected) {
		let e = t?.last_seen ? `Last heard ${N(t.last_seen, n)} at ${j(t.last_seen, r)}. ` : "";
		return {
			kind: "off",
			title: `Can't reach ${i}`,
			detail: `${e}Home Assistant keeps trying${t?.host ? ` at ${t.host}` : ""}. Everything below is what it last knew.`,
			percent: null,
			actions: []
		};
	}
	if (!e) return {
		kind: "idle",
		title: "Reading the robot…",
		detail: "",
		percent: null,
		actions: []
	};
	let a = t.progress?.plan ?? t.open_run?.plan ?? null, s = a ? x(a) : "the plan", c = o(e);
	if (c) return {
		kind: "bad",
		title: `${i} needs you: ${c.description.toLowerCase()}`,
		detail: `${c.hint}${c.since ? ` Since ${j(c.since, r)}.` : ""}`,
		percent: t.progress?.percent ?? null,
		actions: e.plan_running || t.open_run ? [
			"resume",
			"stop",
			"dock"
		] : ["dock"]
	};
	if (e.activity === "paused" || e.pause_reason && e.plan_running) return {
		kind: "held",
		title: `${e.pause_reason && d[e.pause_reason] || "Paused"}: ${s}`,
		detail: E(e),
		percent: t.progress?.percent ?? null,
		actions: [
			"resume",
			"stop",
			"dock"
		]
	};
	if (e.activity === "waiting") return {
		kind: "held",
		title: `Waiting: the way to ${s} may be blocked`,
		detail: "The robot reports no fault. It is holding still with the plan running.",
		percent: t.progress?.percent ?? null,
		actions: ["stop", "dock"]
	};
	if (e.plan_running) {
		let n = t.progress?.percent ?? null, r = t.progress?.remaining_s;
		return {
			kind: "work",
			title: `${T(e.head)} ${s}${n === null ? "" : `, ${Math.round(n)}%`}`,
			detail: [r ? `about ${A(r)} left` : "", E(e)].filter(Boolean).join(" · "),
			percent: n,
			actions: [
				"pause",
				"stop",
				"dock"
			]
		};
	}
	if (e.activity === "returning") return {
		kind: "work",
		title: "Heading home",
		detail: E(e),
		percent: null,
		actions: ["stop"]
	};
	let l = t.runs[t.runs.length - 1];
	return {
		kind: "idle",
		title: "Nothing running",
		detail: [E(e), l ? `Last run ${N(l.ended_at ?? l.started_at, n)}: ${k(l)}.` : ""].filter(Boolean).join(" "),
		percent: null,
		actions: ["start"]
	};
}
function E(e) {
	return e.battery === null ? "" : `${e.charging ? "Charging" : "Battery"} ${e.battery}%.`;
}
var D = {
	completed: ["Finished", "ok"],
	returned_to_dock: ["Came home early", "warn"],
	stopped: ["Stopped", "warn"],
	superseded: ["Replaced", ""]
};
function O(e) {
	return e.faults?.length && e.outcome !== "completed" ? ["Fault", "bad"] : D[e.outcome ?? ""] ?? [e.ended_at ? e.outcome ?? "Ended" : "Running", e.ended_at ? "" : "ok"];
}
function k(e) {
	return e.plan ? x(e.plan) : e.plan_id === null ? "A plan" : `Plan ${e.plan_id}`;
}
function A(e) {
	if (e == null) return "–";
	let t = Math.round(e / 60);
	if (t < 60) return `${t} min`;
	let n = t % 60;
	return n ? `${Math.floor(t / 60)} h ${n} min` : `${t / 60} h`;
}
function j(e, t) {
	return (/* @__PURE__ */ new Date(e * 1e3)).toLocaleTimeString(t, {
		hour: "numeric",
		minute: "2-digit"
	});
}
function M(e, t) {
	return (/* @__PURE__ */ new Date(e * 1e3)).toLocaleDateString(t, {
		month: "short",
		day: "numeric"
	});
}
function N(e, t) {
	let n = (e) => {
		let t = /* @__PURE__ */ new Date(e * 1e3);
		return t.setHours(0, 0, 0, 0), t.getTime();
	}, r = Math.round((n(t) - n(e)) / 864e5);
	return r <= 0 ? "today" : r === 1 ? "yesterday" : r < 7 ? `${r} days ago` : (/* @__PURE__ */ new Date(e * 1e3)).toLocaleDateString(void 0, {
		month: "short",
		day: "numeric"
	});
}
function P(e) {
	let t = (t) => e.reduce((e, n) => e + (t(n) ?? 0), 0), n = t((e) => e.working_s), r = t((e) => e.area_m2), i = e.filter((e) => e.energy_wh && e.area_m2), a = i.reduce((e, t) => e + (t.area_m2 ?? 0), 0);
	return {
		runs: e.length,
		finished: e.filter((e) => e.outcome === "completed").length,
		workingS: n,
		distanceM: t((e) => e.distance_m),
		areaM2: r,
		obstacles: t((e) => e.obstacles),
		faults: t((e) => e.faults?.length ?? 0),
		paceM2H: n > 0 && r > 0 ? r / n * 3600 : null,
		whPerM2: a > 0 ? i.reduce((e, t) => e + (t.energy_wh ?? 0), 0) / a : null
	};
}
function F(e, t) {
	let n = [];
	for (let r of e) {
		let e = t(r);
		typeof e == "number" && Number.isFinite(e) && n.push([r.started_at, e]);
	}
	return n;
}
function I(e) {
	return e.area_m2 && e.working_s ? e.area_m2 / e.working_s * 3600 : null;
}
function L(e) {
	return e === 4 ? "fix-rtk" : e === 5 ? "fix-float" : e ? "fix-gps" : "fix-none";
}
function R(e) {
	return e === null ? "sig-none" : e >= -65 ? "sig-good" : e >= -78 ? "sig-fair" : "sig-poor";
}
var z = 3;
function B(e, t, n = Infinity) {
	let r = [], i = null, a = null;
	for (let o of e) {
		if (o[0] > n) break;
		let e = t === "fix" ? L(o[3]) : t === "signal" ? R(o[4]) : "cut", s = a !== null && Math.hypot(o[1] - a[1], o[2] - a[2]) > z;
		(!i || i.cls !== e || s) && (i = {
			cls: e,
			points: a && !s ? [[a[1], a[2]]] : []
		}, r.push(i)), i.points.push([o[1], o[2]]), a = o;
	}
	return r.filter((e) => e.points.length >= 2);
}
function V(e) {
	if (!e.length) return {
		rtk: 0,
		float: 0,
		other: 0
	};
	let t = e.filter((e) => e[3] === 4).length, n = e.filter((e) => e[3] === 5).length, r = (t) => Math.round(t / e.length * 100);
	return {
		rtk: r(t),
		float: r(n),
		other: r(e.length - t - n)
	};
}
function H(e, t) {
	let n = null;
	for (let r of e) {
		if (r[0] > t) break;
		n = r;
	}
	return n;
}
var U = {
	halow: "HaLow",
	wifi: "Wi-Fi",
	lte: "4G"
};
function W(e) {
	return e ? U[e] ?? e : "–";
}
var G = [
	[0, "Rows"],
	[1, "Spiral"],
	[4, "Rows, fewer turns"]
], K = [[0, "Counter-clockwise"], [2, "Clockwise"]], q = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat"
], J = class extends a {
	static properties = {
		ctx: { attribute: !1 },
		_track: { state: !0 }
	};
	_trackFor;
	willUpdate(e) {
		if (e.has("ctx")) {
			let e = this.ctx?.yard?.open_run;
			e && e.started_at !== this._trackFor ? (this._trackFor = e.started_at, this.ctx?.hass.callWS({
				type: "yarbo_local/track",
				entity_id: this.ctx.entity,
				started_at: e.started_at
			}).then((e) => this._track = e).catch(() => this._track = null)) : e || (this._trackFor = void 0, this._track = void 0);
		}
	}
	render() {
		let e = this.ctx;
		if (!e) return f;
		let t = Date.now() / 1e3, r = S(e.map, e.yard, t), i = e.card("overview", e.narrow ? 340 : 480);
		return i.zoneStates = Object.fromEntries(r.map((e) => [e.id, e.state])), i.overlay = this._track?.points.length ? { swaths: B(this._track.points, "plain") } : void 0, n`<div class="stack">
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
          <div @zone-tap=${(e) => this._openArea(e)}>${i}</div>
        </section>
        <div class="stack">
          <section class="card">
            <div class="pad"><h2>Areas <a @click=${() => e.go("areas")}>All areas</a></h2></div>
            ${r.length ? r.map((t) => n`<button class="row" @click=${() => e.go(`areas/${t.id}`)}>
                    <div class="when"><b>${t.zone.area_m2 === null ? "–" : `${Math.round(t.zone.area_m2)}`}</b>m²</div>
                    <div class="what"><b>${t.name}</b><span>${t.line}</span></div>
                    <span class="chip ${t.state === "done" ? "ok" : t.state === "stale" ? "warn" : ""}">${t.state === "work" ? "Now" : t.plans.length ? `${t.plans.length} plan${t.plans.length > 1 ? "s" : ""}` : "No plan"}</span>
                  </button>`) : n`<div class="empty">The map has not been read from the robot yet.</div>`}
          </section>
          ${this._schedules()}
        </div>
      </div>
      <section class="card">
        <div class="pad"><h2>Recently <a @click=${() => e.go("history")}>History</a></h2></div>
        ${this._recent()}
      </section>
      ${this._robotCard()}
    </div>`;
	}
	_openArea(e) {
		let t = e.detail;
		t.family === "areas" && t.id !== null && this.ctx?.go(`areas/${t.id}`);
	}
	_schedules() {
		let e = (this.ctx?.yard?.schedules ?? []).filter((e) => e.enabled);
		return e.length ? n`<section class="card">
      <div class="pad"><h2>On the robot's own schedule</h2></div>
      ${e.map((e) => n`<div class="row">
          <div class="when"><b>${e.week_day === null ? "" : q[e.week_day % 7] ?? ""}</b>${e.start_time}</div>
          <div class="what"><b>${e.name || "Schedule"}</b><span>${e.start_time} to ${e.end_time}</span></div>
        </div>`)}
    </section>` : f;
	}
	_recent() {
		let e = this.ctx, t = [...e.yard?.runs ?? []].reverse().slice(0, 5);
		if (!t.length) return n`<div class="empty">No runs recorded yet. Each run shows up here when it ends.</div>`;
		let r = e.hass.locale?.language;
		return t.map((t) => {
			let [i, a] = O(t), o = [
				A(t.working_s),
				t.area_m2 ? `${Math.round(t.area_m2)} m²` : "",
				t.obstacles ? `${t.obstacles} obstacle${t.obstacles === 1 ? "" : "s"}` : ""
			].filter(Boolean);
			return n`<button class="row" @click=${() => e.go(`history/${Math.floor(t.started_at)}`)}>
        <div class="when"><b>${M(t.started_at, r)}</b>${j(t.started_at, r)}</div>
        <div class="what"><b>${k(t)}${t.progress !== null && t.outcome !== "completed" ? `, ${Math.round(t.progress)}%` : ""}</b><span>${o.join(" · ")}</span></div>
        <span class="chip ${a}">${i}</span>
      </button>`;
		});
	}
	_robotCard() {
		let e = this.ctx, t = e.yard?.robot, r = e.live;
		if (!t && !r) return f;
		let i = e.yard?.reachable && r?.connected !== !1;
		return n`<section class="card pad robot">
      <h2>${e.yard?.title ?? "Robot"} <a @click=${() => e.go("robot")}>Everything on this robot</a></h2>
      <div class="tiles">
        <div class="tile"><small>State</small><b>${i && r ? l(r) : "Out of reach"}</b></div>
        <div class="tile"><small>Battery</small><b>${r?.battery == null ? "–" : `${r.battery}%`}</b></div>
        <div class="tile"><small>Module</small><b>${(i ? r?.head : t?.head)?.replaceAll("_", " ") ?? "–"}</b></div>
        <div class="tile"><small>Link</small><b>${i ? W(t?.network_path) : "–"}</b></div>
        <div class="tile"><small>Firmware</small><b>${t?.firmware ?? "–"}</b></div>
      </div>
    </section>`;
	}
	static styles = [y, c`
      .head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: center; }
      .robot { display: flex; flex-direction: column; gap: 12px; }
    `];
};
customElements.get("yard-page-overview") || customElements.define("yard-page-overview", J);
//#endregion
//#region src/page-areas.ts
var ae = class extends a {
	static properties = {
		ctx: { attribute: !1 },
		selected: { attribute: !1 },
		_settings: { state: !0 },
		_route: { state: !0 },
		_before: { state: !0 },
		_beforeRoute: { state: !0 },
		_busy: { state: !0 },
		_error: { state: !0 }
	};
	_loadedFor;
	constructor() {
		super(), this._busy = !1;
	}
	get _areas() {
		return S(this.ctx?.map, this.ctx?.yard, Date.now() / 1e3);
	}
	get _area() {
		let e = this._areas;
		return e.find((e) => e.id === this.selected) ?? e[0];
	}
	willUpdate(e) {
		let t = this._area;
		t && t.id !== this._loadedFor && this.ctx?.yard && (this._loadedFor = t.id, this._before = void 0, this._beforeRoute = void 0, this._settings = void 0, this._route = void 0, this._error = void 0, this.ctx.yard.reachable && this._load(t));
	}
	async _load(e) {
		let t = this.ctx;
		this._busy = !0;
		try {
			this._settings = await t.hass.callWS({
				type: "yarbo_local/area_settings",
				entity_id: t.entity,
				area_id: e.id
			}), this._route = await this._fetchRoute(e);
		} catch (e) {
			this._error = e.message ?? String(e);
		} finally {
			this._busy = !1;
		}
	}
	async _fetchRoute(e) {
		let t = this.ctx, n = C(t.yard?.plans ?? [], e.id);
		return n ? t.hass.callWS({
			type: "yarbo_local/preview",
			entity_id: t.entity,
			plan_id: n.id
		}) : null;
	}
	async _change(e, t) {
		let n = this.ctx, r = this._area;
		if (r && this._settings?.[e] !== t) {
			this._busy = !0, this._error = void 0;
			try {
				let i = await n.hass.callWS({
					type: "yarbo_local/area_settings/save",
					entity_id: n.entity,
					area_id: r.id,
					changes: { [e]: t }
				});
				this._before || (this._before = i.before, this._beforeRoute = this._route), this._settings = i.after, this._route = await this._fetchRoute(r);
			} catch (e) {
				this._error = e.message ?? String(e);
			} finally {
				this._busy = !1;
			}
		}
	}
	_keep() {
		this._before = void 0, this._beforeRoute = void 0;
	}
	async _putBack() {
		let e = this.ctx, t = this._area, n = this._before;
		if (t && n) {
			this._busy = !0, this._error = void 0;
			try {
				let r = {};
				for (let e of [
					"algorithm_type",
					"edge_direction_mode",
					"edge_circles",
					"route_angle"
				]) {
					let t = n[e];
					t != null && (r[e] = t);
				}
				let i = await e.hass.callWS({
					type: "yarbo_local/area_settings/save",
					entity_id: e.entity,
					area_id: t.id,
					changes: r
				});
				this._settings = i.after, this._route = await this._fetchRoute(t), this._before = void 0, this._beforeRoute = void 0;
			} catch (e) {
				this._error = e.message ?? String(e);
			} finally {
				this._busy = !1;
			}
		}
	}
	render() {
		let e = this.ctx;
		if (!e) return f;
		let t = this._areas;
		if (!t.length) return n`<section class="card empty">The areas appear here once the robot's map has been read.</section>`;
		let r = this._area, i = e.card("areas", e.narrow ? 320 : 460);
		return i.highlight = r.id, i.overlay = this._overlay(r), n`<div class="grid">
      <section class="card">${i}
        <div class="pad small muted">
          ${this._route ? n`The robot's own route${this._route.total_s ? n`, about ${A(this._route.total_s)}` : f}.${this._before ? " The dashed line is the route before your change." : ""}` : e.yard?.reachable ? C(e.yard.plans, r.id) ? "Asking the robot for its route…" : "No plan holds this area, so the robot has no route to show." : "The robot draws the route itself, so it appears when the robot can be reached."}
        </div>
      </section>
      <div class="stack">
        <section class="card">
          <div class="pad"><label>Area <select @change=${(t) => e.go(`areas/${t.target.value}`)}>
            ${t.map((e) => n`<option value=${e.id} ?selected=${e.id === r.id}>${e.name}</option>`)}
          </select></label></div>
          <div class="pad kv facts">
            <span>Size</span><span>${r.zone.area_m2 === null ? "–" : `${Math.round(r.zone.area_m2)} m²`}</span>
            <span>Last finished</span><span>${r.lastDone ? N(r.lastDone, Date.now() / 1e3) : "Not on record"}</span>
            <span>Plans</span><span>${r.plans.map((e) => e.name).join(", ") || "None"}</span>
          </div>
        </section>
        ${this._renderSettings()}
      </div>
    </div>`;
	}
	_overlay(e) {
		let t = (t, n) => (t?.paths ?? []).filter((t) => t.area_id === e.id && t.kind === n).map((e) => e.points);
		return { lines: [
			...t(this._beforeRoute, "fill").map((e) => ({
				cls: "route-before",
				points: e
			})),
			...t(this._route, "fill").map((e) => ({
				cls: "route-fill",
				points: e
			})),
			...t(this._route, "edge").map((e) => ({
				cls: "route-edge",
				points: e
			}))
		] };
	}
	_renderSettings() {
		let e = this.ctx, t = this._settings, r = !!e.live?.plan_running, i = !e.admin || r || this._busy;
		return e.yard?.reachable ? t ? n`<section class="card pad settings">
      <h2>Route settings ${this._busy ? n`<span class="muted small">Working…</span>` : f}</h2>
      ${r ? n`<div class="muted small">Locked while the robot works a plan.</div>` : f}
      ${e.admin ? f : n`<div class="muted small">Only an administrator can change these.</div>`}
      <div class="field"><span>Pattern</span>
        <div class="seg">${G.map(([e, r]) => n`<button aria-pressed=${t.algorithm_type === e ? "true" : "false"} ?disabled=${i} @click=${() => this._change("algorithm_type", e)}>${r}</button>`)}</div>
      </div>
      <div class="field"><span>Direction</span>
        <div class="seg">${K.map(([e, r]) => n`<button aria-pressed=${(t.edge_direction_mode === 2 ? 2 : 0) === e ? "true" : "false"} ?disabled=${i} @click=${() => this._change("edge_direction_mode", e)}>${r}</button>`)}</div>
      </div>
      <div class="field"><label for="angle">Row angle</label>
        <span><input id="angle" type="number" min="0" max="359" .value=${String(t.route_angle ?? 0)} ?disabled=${i}
          @change=${(e) => this._change("route_angle", Number(e.target.value))} /> °</span>
      </div>
      <div class="field"><label for="laps">Edge laps</label>
        <input id="laps" type="number" min="0" max="5" .value=${String(t.edge_circles ?? 0)} ?disabled=${i}
          @change=${(e) => this._change("edge_circles", Number(e.target.value))} />
      </div>
      <div class="kv small">
        <span>Blade height setting</span><span>${t.blade_height ?? "–"}</span>
        <span>Speed setting</span><span>${t.plan_speed ?? "–"}</span>
      </div>
      ${this._before ? n`<div class="decide">
            <span class="small">Saved on the robot. Keep this route?</span>
            <button class="btn primary" ?disabled=${this._busy} @click=${() => this._keep()}>Keep</button>
            <button class="btn" ?disabled=${this._busy} @click=${() => this._putBack()}>Put it back</button>
          </div>` : f}
      ${this._error ? n`<div class="error" role="alert">${this._error}</div>` : f}
    </section>` : n`<section class="card pad muted small">${this._error ? n`<span class="error">${this._error}</span>` : this._busy ? "Reading the settings…" : "The robot has no settings for this area."}</section>` : n`<section class="card pad muted small">Settings live on the robot and can be read when it is in reach.</section>`;
	}
	static styles = [y, c`
      .facts { border-top: 1px solid var(--divider-color); }
      label { font-size: 14px; }
      .settings { display: flex; flex-direction: column; gap: 12px; }
      .field { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
      .field input { width: 76px; }
      .seg button[disabled] { cursor: default; opacity: 0.7; }
      .decide { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid var(--divider-color); padding-top: 12px; }
      .decide span { flex: 1 1 100%; }
    `];
};
customElements.get("yard-page-areas") || customElements.define("yard-page-areas", ae);
//#endregion
//#region src/page-history.ts
var Y = [30, 120], oe = class extends a {
	static properties = {
		ctx: { attribute: !1 },
		runKey: { attribute: !1 },
		_track: { state: !0 },
		_barriers: { state: !0 },
		_colour: { state: !0 },
		_at: { state: !0 },
		_playing: { state: !0 },
		_speed: { state: !0 }
	};
	_timer;
	_loaded;
	constructor() {
		super(), this._barriers = [], this._colour = "plain", this._playing = !1, this._speed = Y[0];
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._stop();
	}
	get _runs() {
		return this.ctx?.yard?.runs ?? [];
	}
	get _run() {
		if (!this.runKey) return;
		let e = this.ctx?.yard?.open_run;
		return (e ? [...this._runs, e] : this._runs).find((e) => Math.floor(e.started_at) === this.runKey);
	}
	willUpdate(e) {
		let t = this._run;
		t && this._loaded !== this.runKey && (this._loaded = this.runKey, this._stop(), this._at = void 0, this._track = void 0, this._barriers = [], this._load(t)), t || (this._loaded = void 0, this._stop());
	}
	async _load(e) {
		let t = this.ctx;
		try {
			this._track = await t.hass.callWS({
				type: "yarbo_local/track",
				entity_id: t.entity,
				started_at: e.started_at
			});
		} catch {
			this._track = null;
		}
		if (e.id && t.yard?.reachable) try {
			let n = await t.hass.callWS({
				type: "yarbo_local/obstacles",
				entity_id: t.entity,
				run_id: e.id
			});
			this._barriers = i(n.run).barriers;
		} catch {
			this._barriers = [];
		}
	}
	_togglePlay() {
		if (this._playing) {
			this._stop();
			return;
		}
		let e = this._track?.points ?? [], t = e[e.length - 1]?.[0] ?? 0;
		(this._at === void 0 || this._at >= t) && (this._at = 0), this._playing = !0, this._timer = setInterval(() => {
			let e = (this._at ?? 0) + this._speed / 10;
			e >= t ? (this._at = t, this._stop()) : this._at = e;
		}, 100);
	}
	_stop() {
		clearInterval(this._timer), this._timer = void 0, this._playing = !1;
	}
	render() {
		return this.ctx ? this.runKey ? this._renderRun() : this._renderAll() : f;
	}
	_renderAll() {
		let e = this.ctx, t = this._runs;
		if (!t.length) return n`<section class="card empty">No runs recorded yet. Each run is added here when it ends, with where the robot drove.</section>`;
		let r = e.hass.locale?.language, i = P(t);
		return n`<div class="stack">
      <section class="card">
        <div class="pad"><h2>Every run</h2></div>
        <div class="scroll"><table>
          <thead><tr><th>Date</th><th>Plan</th><th>Time</th><th>Area</th><th>Done</th><th class="hide-narrow">Distance</th><th class="hide-narrow">Battery</th><th class="hide-narrow">Obstacles</th><th>Ended</th></tr></thead>
          <tbody>
            ${[...t].reverse().map((t) => {
			let [i, a] = O(t);
			return n`<tr tabindex="0" @click=${() => e.go(`history/${Math.floor(t.started_at)}`)}
                @keydown=${(n) => n.key === "Enter" && e.go(`history/${Math.floor(t.started_at)}`)}>
                <td>${M(t.started_at, r)} ${j(t.started_at, r)}</td>
                <td>${k(t)}</td>
                <td>${A(t.working_s)}</td>
                <td>${t.area_m2 ? `${Math.round(t.area_m2)} m²` : "–"}</td>
                <td>${t.progress === null ? "–" : `${Math.round(t.progress)}%`}</td>
                <td class="hide-narrow">${t.distance_m ? `${(t.distance_m / 1e3).toFixed(1)} km` : "–"}</td>
                <td class="hide-narrow">${t.battery_used_robot == null ? "–" : `${t.battery_used_robot}%`}</td>
                <td class="hide-narrow">${t.obstacles ?? "–"}</td>
                <td><span class="chip ${a}">${i}</span></td>
              </tr>`;
		})}
          </tbody>
        </table></div>
      </section>
      <div class="cols">
        <section class="card pad stack">
          <h2>Totals</h2>
          <div class="tiles">
            <div class="tile"><small>Runs</small><b>${i.runs}</b><span>${i.finished} finished</span></div>
            <div class="tile"><small>Time working</small><b>${A(i.workingS)}</b></div>
            <div class="tile"><small>Area worked</small><b>${Math.round(i.areaM2)} m²</b></div>
            <div class="tile"><small>Distance</small><b>${(i.distanceM / 1e3).toFixed(1)} km</b></div>
            <div class="tile"><small>Pace</small><b>${i.paceM2H === null ? "–" : `${Math.round(i.paceM2H)} m²/h`}</b></div>
            <div class="tile"><small>Energy</small><b>${i.whPerM2 === null ? "–" : `${i.whPerM2.toFixed(2)} Wh/m²`}</b></div>
            <div class="tile"><small>Obstacles</small><b>${i.obstacles}</b></div>
            <div class="tile"><small>Faults</small><b>${i.faults}</b></div>
          </div>
        </section>
        <section class="card pad stack">
          <h2>Trends</h2>
          <yard-chart label="Pace" unit="m²/h" .series=${F(t, I)}></yard-chart>
          <yard-chart label="Energy per m²" unit="Wh" digits="2" .series=${F(t, (e) => e.wh_per_m2)}></yard-chart>
          <yard-chart label="Obstacles per run" .series=${F(t, (e) => e.obstacles)}></yard-chart>
        </section>
      </div>
    </div>`;
	}
	_renderRun() {
		let e = this.ctx, t = this._run;
		if (!t) return n`<section class="card empty">That run is not in the record. <a class="link" @click=${() => e.go("history")}>All runs</a></section>`;
		let r = e.hass.locale?.language, i = this._track?.points ?? [], a = i[i.length - 1]?.[0] ?? 0, o = this._at ?? a, s = this._at === void 0 ? null : H(i, o), c = e.card("run", e.narrow ? 340 : 520);
		c.hideLive = !0;
		let l = B(i, this._colour, o);
		c.overlay = {
			swaths: this._colour === "plain" ? l : [],
			lines: this._colour === "plain" ? [] : l,
			marker: s ? {
				x: s[1],
				y: s[2]
			} : null,
			barriers: this._barriers
		};
		let u = V(i), [d, p] = O(t);
		return n`<div class="stack">
      <a class="link back" @click=${() => e.go("history")}>‹ All runs</a>
      <div class="grid">
        <section class="card">
          ${c}
          ${i.length ? n`<div class="pad player">
                <button class="btn primary" @click=${() => this._togglePlay()}>${this._playing ? "Pause" : "Play"}</button>
                <input type="range" aria-label="Moment in the run" min="0" max=${a} step="1" .value=${String(o)}
                  @input=${(e) => {
			this._stop(), this._at = Number(e.target.value);
		}} />
                <div class="seg">${Y.map((e) => n`<button aria-pressed=${this._speed === e ? "true" : "false"} @click=${() => this._speed = e}>${e}×</button>`)}</div>
                <div class="seg">${[
			"plain",
			"fix",
			"signal"
		].map((e) => n`<button aria-pressed=${this._colour === e ? "true" : "false"} @click=${() => this._colour = e}>${{
			plain: "Cut",
			fix: "RTK",
			signal: "Signal"
		}[e]}</button>`)}</div>
              </div>
              ${s ? n`<div class="pad small muted moment">${j(t.started_at + s[0], r)} · fix ${s[3] ?? "–"} · HaLow ${s[4] ?? "–"} dBm · battery ${s[5] ?? "–"}%</div>` : f}
              ${this._colour === "plain" ? f : n`<div class="pad legend small">${this._colour === "fix" ? n`<span><i style="background:var(--success-color,#43a047);border-color:var(--success-color,#43a047)"></i>RTK fixed</span><span><i style="background:var(--warning-color,#ffa600);border-color:var(--warning-color,#ffa600)"></i>RTK float</span><span><i style="background:var(--error-color,#db4437);border-color:var(--error-color,#db4437)"></i>GPS only</span>` : n`<span><i style="background:var(--success-color,#43a047);border-color:var(--success-color,#43a047)"></i>Above −65 dBm</span><span><i style="background:var(--warning-color,#ffa600);border-color:var(--warning-color,#ffa600)"></i>−65 to −78</span><span><i style="background:var(--error-color,#db4437);border-color:var(--error-color,#db4437)"></i>Below −78</span>`}</div>`}` : n`<div class="pad small muted">${this._track === void 0 ? "Loading the track…" : "No track for this run: it ran before tracks were recorded."}</div>`}
        </section>
        <section class="card pad stack">
          <h2>${k(t)} <span class="chip ${p}">${d}</span></h2>
          <div class="muted small">${M(t.started_at, r)}, ${j(t.started_at, r)}${t.ended_at ? ` to ${j(t.ended_at, r)}` : ""}</div>
          <div class="tiles">
            <div class="tile"><small>Working time</small><b>${A(t.working_s)}</b></div>
            <div class="tile"><small>Done</small><b>${t.progress === null ? "–" : `${Math.round(t.progress)}%`}</b></div>
            <div class="tile"><small>Area</small><b>${t.area_m2 ? `${Math.round(t.area_m2)} m²` : "–"}</b><span>${t.planned_area_m2 ? `of ${Math.round(t.planned_area_m2)} m²` : ""}</span></div>
            <div class="tile"><small>Distance</small><b>${t.distance_m ? `${Math.round(t.distance_m)} m` : "–"}</b></div>
            <div class="tile"><small>Battery used</small><b>${t.battery_used_robot == null ? "–" : `${t.battery_used_robot}%`}</b><span>${t.battery_start ?? "–"} → ${t.battery_end ?? "–"}% at start and end</span></div>
            <div class="tile"><small>Energy</small><b>${t.energy_wh ? `${t.energy_wh} Wh` : "–"}</b><span>${t.wh_per_m2 ? `${t.wh_per_m2.toFixed(2)} Wh/m²` : ""}</span></div>
            <div class="tile"><small>Obstacles</small><b>${t.obstacles ?? "–"}</b></div>
            <div class="tile"><small>Faults</small><b>${t.faults?.length ? t.faults.join(", ") : "None"}</b></div>
            ${i.length ? n`<div class="tile"><small>RTK fixed</small><b>${u.rtk}%</b><span>float ${u.float}%, other ${u.other}%</span></div>` : f}
          </div>
        </section>
      </div>
    </div>`;
	}
	static styles = [y, c`
      .back { font-size: 14px; align-self: flex-start; }
      .player { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; border-top: 1px solid var(--divider-color); }
      .player input[type="range"] { flex: 1 1 160px; min-width: 120px; accent-color: var(--primary-color); }
      .moment, .legend.pad { padding-top: 0; }
    `];
};
customElements.get("yard-page-history") || customElements.define("yard-page-history", oe);
//#endregion
//#region src/page-robot.ts
var X = [
	{
		suffix: "_battery",
		label: "Battery",
		unit: "%"
	},
	{
		suffix: "_battery_voltage",
		label: "Voltage",
		unit: "V",
		digits: 1,
		color: "var(--info-color, #3a7fc0)"
	},
	{
		suffix: "_battery_current",
		label: "Current",
		unit: "A",
		digits: 1,
		color: "var(--info-color, #3a7fc0)"
	},
	{
		suffix: "_halow_signal",
		label: "HaLow signal",
		unit: "dBm",
		color: "var(--warning-color, #e39500)"
	},
	{
		suffix: "_satellites",
		label: "Satellites",
		unit: "",
		color: "var(--success-color, #43a047)"
	},
	{
		suffix: "_ambient_temperature",
		label: "Ambient temperature",
		unit: "°",
		digits: 1,
		color: "var(--error-color, #db4437)"
	}
], se = [[24, "24 h"], [168, "7 days"]], ce = class extends a {
	static properties = {
		ctx: { attribute: !1 },
		_hours: { state: !0 },
		_series: { state: !0 },
		_loading: { state: !0 }
	};
	_loadedFor;
	constructor() {
		super(), this._hours = 24, this._series = {}, this._loading = !1;
	}
	_entity(e) {
		let t = this.ctx;
		if (t) return Object.values(t.hass.entities ?? {}).find((t) => t.platform === "yarbo_local" && t.entity_id.startsWith("sensor.") && t.entity_id.endsWith(e))?.entity_id;
	}
	_reading(e) {
		let t = this._entity(e), n = t ? this.ctx?.hass.states[t] : void 0;
		if (!n || n.state === "unavailable" || n.state === "unknown") return;
		let r = n.attributes.unit_of_measurement;
		return typeof r == "string" ? `${n.state} ${r}` : n.state;
	}
	_unit(e, t) {
		let n = e ? this.ctx?.hass.states[e]?.attributes.unit_of_measurement : void 0;
		return typeof n == "string" ? n : t;
	}
	willUpdate(e) {
		let t = `${this.ctx?.entity}:${this._hours}`;
		this.ctx && t !== this._loadedFor && (this._loadedFor = t, this._load());
	}
	async _load() {
		let e = this.ctx, t = X.map((e) => this._entity(e.suffix)).filter((e) => !!e);
		if (t.length) {
			this._loading = !0;
			try {
				let n = await e.hass.callWS({
					type: "history/history_during_period",
					start_time: (/* @__PURE__ */ new Date(Date.now() - this._hours * 36e5)).toISOString(),
					end_time: (/* @__PURE__ */ new Date()).toISOString(),
					entity_ids: t,
					minimal_response: !0,
					no_attributes: !0
				}), r = {};
				for (let [e, t] of Object.entries(n)) r[e] = t.map((e) => [e.lu, Number(e.s)]).filter((e) => Number.isFinite(e[1]));
				this._series = r;
			} catch {
				this._series = {};
			} finally {
				this._loading = !1;
			}
		}
	}
	render() {
		let e = this.ctx;
		if (!e) return f;
		let t = e.yard?.robot, r = e.live, i = e.hass.locale?.language, a = X.map((e) => ({
			...e,
			entity: this._entity(e.suffix)
		})).filter((e) => e.entity), o = e.yard?.schedules ?? [], s = [...e.yard?.charges ?? []].reverse().slice(0, 8);
		return n`<div class="stack">
      <section class="card pad stack">
        <h2>Right now</h2>
        ${t || r ? n`<div class="tiles">
              <div class="tile"><small>Battery</small><b>${r?.battery == null ? "–" : `${r.battery}%`}</b><span>${t?.battery_health == null ? "" : `health ${t.battery_health}%`}</span></div>
              <div class="tile"><small>Voltage</small><b>${t?.voltage == null ? "–" : `${t.voltage.toFixed(1)} V`}</b></div>
              <div class="tile"><small>Current</small><b>${t?.current == null ? "–" : `${t.current.toFixed(1)} A`}</b></div>
              <div class="tile"><small>RTK</small><b>${r?.fix_quality === 4 ? "Fixed" : r?.fix_quality === 5 ? "Float" : r?.fix_quality ? "GPS only" : "–"}</b><span>${r?.satellites ? `${r.satellites} satellites` : ""}</span></div>
              <div class="tile"><small>Link</small><b>${W(t?.network_path)}</b><span>${t?.halow_rssi == null ? "" : `HaLow ${t.halow_rssi} dBm`}</span></div>
              <div class="tile"><small>Module</small><b>${(t?.head ?? r?.head ?? "–").replaceAll("_", " ")}</b></div>
              <div class="tile"><small>Temperature</small><b>${this._reading("_ambient_temperature") ?? (t?.temperature == null ? "–" : `${t.temperature} °C`)}</b></div>
              <div class="tile"><small>Stop button</small><b>${t?.stop_button_engaged == null ? "–" : t.stop_button_engaged ? "Pressed" : "Released"}</b></div>
            </div>` : n`<div class="muted">Nothing read from the robot yet.</div>`}
      </section>
      <section class="card pad stack">
        <h2>Over time
          <span class="seg">${se.map(([e, t]) => n`<button aria-pressed=${this._hours === e ? "true" : "false"} @click=${() => this._hours = e}>${t}</button>`)}</span>
        </h2>
        ${a.length ? n`<div class="cols">${a.map((e) => n`<yard-chart .label=${e.label} .unit=${this._unit(e.entity, e.unit)} .digits=${e.digits ?? 0} .color=${e.color ?? "var(--primary-color, #1e88e5)"}
                .series=${this._series[e.entity] ?? []}></yard-chart>`)}</div>` : f}
        ${a.length < X.length ? n`<div class="muted small">Some readings have no chart because their sensors are off by default. Switch them on from this robot's device page to start collecting them.</div>` : f}
      </section>
      <div class="cols">
        <section class="card">
          <div class="pad"><h2>Plans on this robot</h2></div>
          ${(e.yard?.plans ?? []).map((e) => n`<div class="row"><div class="when"><b>${e.area_ids.length}</b>area${e.area_ids.length === 1 ? "" : "s"}</div><div class="what"><b>${e.name}</b></div></div>`)}
          ${e.yard?.plans.length ? f : n`<div class="empty">None known yet.</div>`}
        </section>
        <section class="card">
          <div class="pad"><h2>Schedules on this robot</h2></div>
          ${o.map((e) => n`<div class="row"><div class="when"><b>${e.start_time}</b>${e.end_time}</div><div class="what"><b>${e.name || "Schedule"}</b><span>${e.enabled ? "On: starts mows by itself" : "Off"}</span></div></div>`)}
          ${o.length ? f : n`<div class="empty">None.</div>`}
        </section>
        <section class="card">
          <div class="pad"><h2>Recent charges</h2></div>
          ${s.map((e) => n`<div class="row"><div class="when"><b>${M(e.started_at, i)}</b>${j(e.started_at, i)}</div>
              <div class="what"><b>${e.battery_start ?? "–"} → ${e.battery_end ?? "–"}%</b><span>${A(e.on_charger_s)}${e.rate_pct_per_h ? ` · ${e.rate_pct_per_h}%/h` : ""}</span></div></div>`)}
          ${s.length ? f : n`<div class="empty">None recorded yet.</div>`}
        </section>
      </div>
      <section class="card pad kv small">
        <span>Firmware</span><span>${t?.firmware ?? "–"}</span>
        <span>Body firmware</span><span>${t?.body_firmware ?? "–"}</span>
        <span>Head firmware</span><span>${t?.head_firmware ?? "–"}</span>
        <span>Serial</span><span>${e.yard?.serial ?? "–"}</span>
        <span>Address</span><span>${e.yard?.host ?? "–"}</span>
      </section>
    </div>`;
	}
	static styles = [y, c`
      h2 .seg { font-weight: 400; }
    `];
};
customElements.get("yard-page-robot") || customElements.define("yard-page-robot", ce);
//#endregion
//#region src/panel.ts
var Z = [
	{
		id: "overview",
		label: "Overview",
		admin: !1
	},
	{
		id: "areas",
		label: "Areas",
		admin: !1
	},
	{
		id: "history",
		label: "History",
		admin: !1
	},
	{
		id: "map",
		label: "Map",
		admin: !1
	},
	{
		id: "robot",
		label: "Robot",
		admin: !1
	},
	{
		id: "settings",
		label: "Settings",
		admin: !0
	}
], le = 6e4, ue = {
	off: t,
	bad: e,
	held: s,
	work: u,
	idle: u
}, Q = {
	start: "Run a plan",
	pause: "Pause",
	resume: "Resume",
	stop: "Stop",
	dock: "Send home"
}, $ = class extends a {
	static properties = {
		hass: { attribute: !1 },
		narrow: { type: Boolean },
		route: { attribute: !1 },
		panel: { attribute: !1 },
		_robot: { state: !0 },
		_yard: { state: !0 },
		_map: { state: !0 },
		_live: { state: !0 },
		_error: { state: !0 },
		_busy: { state: !0 },
		_confirm: { state: !0 },
		_plan: { state: !0 }
	};
	_cards = /* @__PURE__ */ new Map();
	_unsubscribe;
	_timer;
	_running;
	_available;
	constructor() {
		super(), this.narrow = !1, this._busy = !1;
	}
	connectedCallback() {
		super.connectedCallback(), this._timer = setInterval(() => void this._refresh(), le), this._robot && this._subscribe();
	}
	disconnectedCallback() {
		super.disconnectedCallback(), clearInterval(this._timer), this._stream(void 0);
	}
	get _admin() {
		return !!this.hass?.user?.is_admin;
	}
	get _robots() {
		return Object.values(this.hass?.entities ?? {}).filter((e) => e.platform === "yarbo_local" && e.entity_id.startsWith("lawn_mower.")).map((e) => e.entity_id).sort();
	}
	get _tab() {
		let e = (this.route?.path ?? "").split("/").filter(Boolean)[0] ?? "overview", t = Z.find((t) => t.id === e && (!t.admin || this._admin));
		return t ? t.id : "overview";
	}
	get _rest() {
		return (this.route?.path ?? "").split("/").filter(Boolean).slice(1);
	}
	_go(e) {
		let t = this.route?.prefix ?? "/yard";
		history.pushState(null, "", `${t}/${e}`), window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: !1 } }));
	}
	willUpdate() {
		let e = this._robots;
		if (!e.length) return;
		(!this._robot || !e.includes(this._robot)) && (this._robot = e[0], this._load());
		let t = this.hass?.states[this._robot]?.state, n = t !== void 0 && t !== "unavailable";
		this._available === !1 && n && this._load(), this._available = n;
	}
	async _load() {
		await Promise.all([
			this._refresh(),
			this._loadMap(),
			this._subscribe()
		]);
	}
	async _refresh() {
		let e = this._robot;
		if (e && this.hass) try {
			this._yard = await this.hass.callWS({
				type: "yarbo_local/yard",
				entity_id: e
			});
		} catch (e) {
			this._error = e.message ?? String(e);
		}
	}
	async _loadMap() {
		if (this._robot && this.hass) try {
			this._map = await this.hass.callWS({
				type: "yarbo_local/map",
				entity_id: this._robot
			});
		} catch {
			this._map = void 0;
		}
	}
	async _stream(e) {
		let t = this._unsubscribe;
		this._unsubscribe = e;
		try {
			await t?.();
		} catch {}
	}
	async _subscribe() {
		if (this._robot && this.hass) try {
			let e = await this.hass.connection.subscribeMessage((e) => this._onEvent(e), {
				type: "yarbo_local/subscribe_live",
				entity_id: this._robot
			});
			await this._stream(e);
		} catch (e) {
			this._error = e.message ?? String(e);
		}
	}
	_onEvent(e) {
		e.type === "live" ? (this._live = e, this._running !== void 0 && this._running !== e.plan_running && this._refresh(), this._running = e.plan_running) : e.type === "map_changed" && this._loadMap();
	}
	_askCommand(e, t) {
		let n = this._yard?.plans.find((e) => e.id === t);
		if (e === "start") {
			if (!n) {
				this._error = "Choose a plan first.";
				return;
			}
			this._confirm = {
				action: e,
				planId: t,
				text: `Start "${n.name}"? The robot will leave the dock with its blades on.`
			};
		} else e === "stop" ? this._confirm = {
			action: e,
			text: "Stop the plan? The robot stays where it is."
		} : this._send(e);
	}
	async _send(e, t) {
		this._confirm = void 0, this._busy = !0, this._error = void 0;
		try {
			await this.hass?.callWS({
				type: "yarbo_local/command",
				entity_id: this._robot,
				action: e,
				...t === void 0 ? {} : { plan_id: t }
			}), await this._refresh();
		} catch (e) {
			this._error = e.message ?? String(e);
		} finally {
			this._busy = !1;
		}
	}
	_card = (e, t) => {
		let n = this._robot, r = `${n}:${e}`, i = this._cards.get(r);
		return i || (i = document.createElement("yarbo-local-card-view"), i.setConfig({
			type: "custom:yarbo-local-card",
			entity: n,
			height: t,
			show_status: !1,
			title: ""
		}), this._cards.set(r, i)), i.hass = this.hass, i;
	};
	get _ctx() {
		return {
			hass: this.hass,
			entity: this._robot,
			yard: this._yard,
			map: this._map,
			live: this._live,
			admin: this._admin,
			narrow: this.narrow,
			card: this._card,
			go: (e) => this._go(e),
			refresh: () => this._refresh()
		};
	}
	render() {
		let e = this._tab;
		return n`
      <div class="toolbar">
        <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div class="title">Yard</div>
        ${this._robots.length > 1 ? n`<select aria-label="Robot" @change=${(e) => this._pick(e.target.value)}>
              ${this._robots.map((e) => n`<option value=${e} ?selected=${e === this._robot}>${this.hass?.states[e]?.attributes.friendly_name ?? e}</option>`)}
            </select>` : f}
      </div>
      <nav class="tabs" aria-label="Yard sections">
        ${Z.filter((e) => !e.admin || this._admin).map((t) => n`<button class=${t.id === e ? "on" : ""} aria-current=${t.id === e ? "page" : "false"}
              @click=${() => this._go(t.id)}>${t.label}</button>`)}
      </nav>
      <main>${this._robot ? this._page(e) : n`<p class="muted">No robot is set up yet. Add one under Settings, Devices and services.</p>`}</main>
      ${this._renderConfirm()}
    `;
	}
	_pick(e) {
		this._robot = e, this._yard = void 0, this._live = void 0, this._map = void 0, this._running = void 0, this._load();
	}
	_page(e) {
		let t = this._ctx, r = e === "settings" ? f : this._renderNow();
		switch (e) {
			case "areas": return n`${r}<yard-page-areas .ctx=${t} .selected=${Number(this._rest[0]) || void 0}></yard-page-areas>`;
			case "history": return n`${r}<yard-page-history .ctx=${t} .runKey=${Number(this._rest[0]) || void 0}></yard-page-history>`;
			case "map": return n`${r}<section class="card mapcard">${this._card("map", Math.max(420, window.innerHeight - 280))}</section>`;
			case "robot": return n`${r}<yard-page-robot .ctx=${t}></yard-page-robot>`;
			case "settings": return n`<yarbo-local-data-health .hass=${this.hass}></yarbo-local-data-health>`;
			default: return n`${r}<yard-page-overview .ctx=${t}></yard-page-overview>`;
		}
	}
	_renderNow() {
		let e = ie(this._live, this._yard, Date.now() / 1e3, this.hass?.locale?.language), t = e.actions.includes("start"), r = this._yard?.plans ?? [], i = this._plan ?? r[0]?.id;
		return n`<section class="card now ${e.kind}" aria-live="polite">
      <span class="dot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d=${ue[e.kind]}></path></svg></span>
      <div class="say">
        <b>${e.title}</b>
        ${e.detail ? n`<span>${e.detail}</span>` : f}
        ${e.percent === null ? f : n`<div class="bar"><i style="width:${e.percent}%"></i></div>`}
        ${this._error ? n`<div class="error" role="alert">${this._error}</div>` : f}
      </div>
      ${this._admin && e.actions.length ? n`<div class="acts">
            ${t && r.length ? n`<select aria-label="Plan" @change=${(e) => this._plan = Number(e.target.value)}>
                  ${r.map((e) => n`<option value=${e.id} ?selected=${e.id === i}>${e.name}</option>`)}
                </select>` : f}
            ${e.actions.map((e) => n`<button class="btn ${e === "resume" || e === "start" ? "primary" : ""}"
                ?disabled=${this._busy || e === "start" && !r.length}
                @click=${() => this._askCommand(e, e === "start" ? i : void 0)}>${Q[e]}</button>`)}
          </div>` : f}
    </section>`;
	}
	_renderConfirm() {
		let e = this._confirm;
		return e ? n`<div class="scrim" role="dialog" aria-modal="true" aria-label="Confirm">
      <div class="dialog">
        <p>${e.text}</p>
        <div class="acts">
          <button class="btn" @click=${() => this._confirm = void 0}>Cancel</button>
          <button class="btn primary" @click=${() => this._send(e.action, e.planId)}>${Q[e.action] === "Run a plan" ? "Start" : Q[e.action]}</button>
        </div>
      </div>
    </div>` : f;
	}
	static styles = [y, c`
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
    `];
};
customElements.get("yarbo-local-panel-view") || customElements.define("yarbo-local-panel-view", $);
//#endregion
export { $ as YarboLocalPanelView };
