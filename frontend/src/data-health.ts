import { LitElement, css, html, nothing } from "lit";
import { DATASETS, count, formatBytes, formatSpan, retentionLabel } from "./format";
import type { HomeAssistant } from "./types";

interface Dataset {
  dataset: string;
  serial: string | null;
  records: number;
  detail: string | null;
  oldest: number | null;
  newest: number | null;
  bytes: number;
  retention: { unit: string; value: number; choices: number[] } | null;
}

interface Health {
  robots: Record<string, string>;
  datasets: Dataset[];
  total_bytes: number;
  recorder_keep_days: number | null;
}

/** Settings > Data: what the integration keeps, how big it is, how long it stays, and clearing it. */
export class YarboLocalDataHealth extends LitElement {
  static override properties = {
    hass: { attribute: false },
    _health: { state: true },
    _error: { state: true },
    _busy: { state: true },
    _confirm: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _health?: Health;
  declare _error?: string;
  declare _busy: boolean;
  declare _confirm?: string;

  constructor() {
    super();
    this._busy = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    if (!this.hass) {
      return;
    }
    try {
      this._health = await this.hass.callWS<Health>({ type: "yarbo_local/data/health" });
      this._error = undefined;
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    }
  }

  private async _run(msg: Record<string, unknown>): Promise<void> {
    if (!this.hass) {
      return;
    }
    this._busy = true;
    try {
      await this.hass.callWS(msg);
      this._confirm = undefined;
      await this._load();
    } catch (err) {
      this._error = (err as { message?: string }).message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  override render() {
    if (this._error) {
      return html`<div class="error">${this._error}</div>`;
    }
    const health = this._health;
    if (!health) {
      return html`<div class="muted">Reading…</div>`;
    }
    const locale = this.hass?.locale?.language;
    const retained = new Map<string, Dataset>();
    for (const d of health.datasets) {
      if (d.retention && !retained.has(d.dataset)) {
        retained.set(d.dataset, d);
      }
    }
    const robots = Object.entries(health.robots);
    return html`
      <section class="card">
        <header>
          <div>
            <h2>Data kept by Yarbo Local</h2>
            <p class="muted">In Home Assistant's own storage folder on this machine. Nothing is sent anywhere.</p>
          </div>
          <div class="total"><b>${formatBytes(health.total_bytes)}</b><span class="muted">in total</span></div>
        </header>

        <h3>How long to keep</h3>
        <div class="keep">
          ${[...retained.values()].map(
            (d) => html`<label>
              <span>${DATASETS[d.dataset]?.title ?? d.dataset}</span>
              <select
                .value=${String(d.retention!.value)}
                ?disabled=${this._busy}
                @change=${(e: Event) =>
                  this._run({
                    type: "yarbo_local/data/retention",
                    dataset: d.dataset,
                    value: Number((e.target as HTMLSelectElement).value),
                  })}
              >
                ${d.retention!.choices.map(
                  (c) =>
                    html`<option value=${String(c)} ?selected=${c === d.retention!.value}>
                      ${retentionLabel(d.retention!.unit, c)}
                    </option>`,
                )}
              </select>
            </label>`,
          )}
        </div>

        ${robots.map(
          ([serial, name]) => html`
            <h3>${name}</h3>
            <div class="rows">${health.datasets.filter((d) => d.serial === serial).map((d) => this._row(d, locale))}</div>
          `,
        )}
        <h3>All robots</h3>
        <div class="rows">${health.datasets.filter((d) => d.serial === null).map((d) => this._row(d, locale))}</div>

        ${health.recorder_keep_days != null
          ? html`<p class="muted foot">
              Home Assistant also keeps its own history of the Yarbo entities, for
              ${health.recorder_keep_days} days. That is set in Home Assistant's recorder, not here.
            </p>`
          : nothing}
      </section>
    `;
  }

  private _row(d: Dataset, locale?: string) {
    const text = DATASETS[d.dataset] ?? { title: d.dataset, about: "", unit: "records", one: "record" };
    const key = `${d.dataset}|${d.serial ?? ""}`;
    const span = formatSpan(d.oldest, d.newest, locale);
    const asking = this._confirm === key;
    return html`
      <div class="row">
        <div class="what">
          <b>${text.title}</b>
          <span class="muted">${text.about}</span>
        </div>
        <div class="count">
          <b>${count(d.records, text)}</b>
          <span class="muted">${[d.detail, span].filter(Boolean).join(" · ")}</span>
        </div>
        <div class="size">${formatBytes(d.bytes)}</div>
        <div class="act">
          ${asking
            ? html`<span class="ask">Clear ${count(d.records, text)}? This cannot be undone.</span>
                <button class="danger" ?disabled=${this._busy} @click=${() =>
                  this._run({
                    type: "yarbo_local/data/clear",
                    dataset: d.dataset,
                    confirm: true,
                    ...(d.serial ? { serial: d.serial } : {}),
                  })}>Clear</button>
                <button ?disabled=${this._busy} @click=${() => (this._confirm = undefined)}>Cancel</button>`
            : html`<button ?disabled=${this._busy || d.records === 0} @click=${() => (this._confirm = key)}>
                Clear…
              </button>`}
        </div>
      </div>
    `;
  }

  static override styles = css`
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
}

if (!customElements.get("yarbo-local-data-health")) {
  customElements.define("yarbo-local-data-health", YarboLocalDataHealth);
}
