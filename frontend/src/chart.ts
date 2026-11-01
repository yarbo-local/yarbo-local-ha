import { LitElement, css, html, nothing, svg } from "lit";
import type { Series } from "./yard";

const W = 520;
const H = 120;
const LEFT = 40;
const BOTTOM = 18;

/** One chart for the whole panel: min, mid and max ticks, a time axis, a hover readout. */
export class YardChart extends LitElement {
  static override properties = {
    label: {},
    unit: {},
    series: { attribute: false },
    color: {},
    digits: { type: Number },
    _hover: { state: true },
  };

  declare label: string;
  declare unit: string;
  declare series: Series;
  declare color: string;
  declare digits: number;
  declare _hover?: [number, number];

  constructor() {
    super();
    this.label = "";
    this.unit = "";
    this.series = [];
    this.color = "var(--primary-color, #1e88e5)";
    this.digits = 0;
  }

  private _value(v: number): string {
    return `${v.toFixed(this.digits)}${this.unit ? ` ${this.unit}` : ""}`;
  }

  private _scale() {
    const xs = this.series.map((p) => p[0]);
    const ys = this.series.map((p) => p[1]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    if (y0 === y1) {
      y0 -= 1;
      y1 += 1;
    }
    const x = (v: number) => LEFT + ((v - x0) / Math.max(1, x1 - x0)) * (W - LEFT - 4);
    const y = (v: number) => 6 + (1 - (v - y0) / (y1 - y0)) * (H - BOTTOM - 8);
    return { x, y, x0, x1, y0, y1 };
  }

  private _move(ev: PointerEvent): void {
    const box = (ev.currentTarget as SVGElement).getBoundingClientRect();
    const { x0, x1 } = this._scale();
    const at = x0 + ((((ev.clientX - box.left) / box.width) * W - LEFT) / (W - LEFT - 4)) * (x1 - x0);
    let best = this.series[0];
    for (const point of this.series) {
      if (best && Math.abs(point[0] - at) < Math.abs(best[0] - at)) {
        best = point;
      }
    }
    this._hover = best;
  }

  private _when(at: number): string {
    const span = this.series.length > 1 ? this.series[this.series.length - 1]![0] - this.series[0]![0] : 0;
    const date = new Date(at * 1000);
    return span < 86_400
      ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  override render() {
    if (this.series.length < 2) {
      return html`<div class="head"><span>${this.label}</span><b>${this.series[0] ? this._value(this.series[0][1]) : "–"}</b></div>
        <div class="empty">Not enough readings yet</div>`;
    }
    const { x, y, x0, x1, y0, y1 } = this._scale();
    const line = this.series.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
    const shown = this._hover ?? this.series[this.series.length - 1]!;
    const ticks = [y1, (y0 + y1) / 2, y0];
    return html`<div class="head">
        <span>${this.label}</span>
        <b>${this._value(shown[1])}${this._hover ? html`<small> ${this._when(shown[0])}</small>` : nothing}</b>
      </div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label=${this.label}
        @pointermove=${this._move} @pointerleave=${() => (this._hover = undefined)}>
        ${ticks.map(
          (t) => svg`<line class="grid" x1=${LEFT} x2=${W} y1=${y(t)} y2=${y(t)}></line>
            <text class="tick" x=${LEFT - 6} y=${y(t) + 3} text-anchor="end">${t.toFixed(this.digits)}</text>`,
        )}
        <polyline points=${line} fill="none" stroke=${this.color} stroke-width="1.5" vector-effect="non-scaling-stroke"></polyline>
        ${this._hover
          ? svg`<line class="cross" x1=${x(shown[0])} x2=${x(shown[0])} y1="4" y2=${H - BOTTOM}></line>
              <circle cx=${x(shown[0])} cy=${y(shown[1])} r="3" fill=${this.color}></circle>`
          : nothing}
        <text class="tick" x=${LEFT} y=${H - 4}>${this._when(x0)}</text>
        <text class="tick" x=${W - 2} y=${H - 4} text-anchor="end">${this._when(x1)}</text>
      </svg>`;
  }

  static override styles = css`
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
}

if (!customElements.get("yard-chart")) {
  customElements.define("yard-chart", YardChart);
}
