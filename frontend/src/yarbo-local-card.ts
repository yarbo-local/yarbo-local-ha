import { LitElement, html, nothing, svg, type PropertyValues, type SVGTemplateResult } from "lit";
import {
  mdiBattery,
  mdiBatteryCharging,
  mdiCrosshairsGps,
  mdiEraser,
  mdiFitToScreenOutline,
  mdiAlertCircle,
  mdiAlertOctagonOutline,
  mdiImageEditOutline,
  mdiLanDisconnect,
  mdiSatelliteVariant,
  mdiSleep,
} from "@mdi/js";

import { longestPath, obstacleLayer, planOverlay, type ObstacleDetection } from "./feedback";
import {
  applySimilarity,
  distanceToPolyline,
  dockOutline,
  extendTrail,
  fitSimilarity,
  invertSimilarity,
  niceStep,
  pointInPolygon,
  robotFootprint,
  svgMatrix,
  toDisplay,
  trailSegments,
  type TrailPoint,
} from "./geometry";
import { faultDetail, faultOf, statusLabel } from "./status";
import { cardStyles } from "./styles";
import type {
  Background,
  CardConfig,
  HomeAssistant,
  LiveEvent,
  MapData,
  Point,
  Similarity,
  StreamEvent,
  ZoneData,
} from "./types";
import { fitView, metresPerPixel, pixelToDisplay, viewBox, zoomAt, type Size, type View } from "./view";
import { DEFAULT_HEIGHT, cardSize, checkConfig, gridOptions } from "./config";
import "./editor";

const CUT_WIDTH_M = 0.55;
const TAP_SLOP_PX = 6;
const PICK_SNAP_PX = 14;

type AlignStep = "url" | "photo1" | "map1" | "photo2" | "map2" | "preview";

interface AlignState {
  step: AlignStep;
  url: string;
  width?: number;
  height?: number;
  placement?: Similarity;
  u1?: Point;
  w1?: Point;
  u2?: Point;
  w2?: Point;
  result?: Similarity;
  opacity: number;
  busy?: boolean;
  error?: string;
}

const icon = (path: string) => svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

const displayPoints = (points: Point[]): string => points.map(([x, y]) => `${-x},${-y}`).join(" ");

export class YarboLocalCard extends LitElement {
  static override styles = cardStyles;

  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
    _map: { state: true },
    _live: { state: true },
    _view: { state: true },
    _size: { state: true },
    _trail: { state: true },
    _feedback: { state: true },
    _background: { state: true },
    _selected: { state: true },
    _selectedObstacle: { state: true },
    _follow: { state: true },
    _align: { state: true },
    _error: { state: true },
    _dragging: { state: true },
  };

  declare hass?: HomeAssistant;
  declare _config?: CardConfig;
  declare _map?: MapData;
  declare _live?: LiveEvent;
  declare _view?: View;
  declare _size: Size;
  declare _trail: TrailPoint[];
  declare _feedback: Record<string, unknown>;
  declare _background?: Background | null;
  declare _selected?: ZoneData;
  declare _selectedObstacle?: ObstacleDetection;
  declare _follow: boolean;
  declare _align?: AlignState;
  declare _error?: string;
  declare _dragging: boolean;

  private _unsubscribe?: () => Promise<void> | void;
  private _target?: string;
  private _resize?: ResizeObserver;
  private _measured = false;
  private _pointers = new Map<number, { x: number; y: number }>();
  private _gesture?: { startX: number; startY: number; view: View; moved: boolean; pinch?: number };

  constructor() {
    super();
    this._size = { w: 600, h: DEFAULT_HEIGHT };
    this._trail = [];
    this._feedback = {};
    this._follow = false;
    this._dragging = false;
  }

  // -- Home Assistant card API ----------------------------------------------------

  setConfig(config: CardConfig): void {
    checkConfig(config);
    this._config = { trail: true, follow: false, show_status: true, height: DEFAULT_HEIGHT, ...config };
    this._follow = Boolean(this._config.follow);
  }

  getCardSize(): number {
    return cardSize(this._config);
  }

  getGridOptions() {
    return gridOptions(this._config);
  }

  // -- lifecycle ----------------------------------------------------------------

  override connectedCallback(): void {
    super.connectedCallback();
    if (this._target) {
      const target = this._target;
      this._target = undefined;
      void this._connect(target);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    this._resize = undefined;
    void this._teardown();
  }

  override updated(changed: PropertyValues<this>): void {
    const entity = this._config?.entity;
    if (this.hass && entity && entity !== this._target) {
      void this._connect(entity);
    }
    if (!this._resize) {
      const el = this.renderRoot.querySelector<HTMLElement>(".map");
      if (el) {
        this._resize = new ResizeObserver((entries) => {
          const box = entries[0]?.contentRect;
          if (!box || box.width === 0 || box.height === 0) {
            return;
          }
          if (box.width !== this._size.w || box.height !== this._size.h) {
            this._size = { w: box.width, h: box.height };
          }
          if (!this._measured) {
            // The first fit waits for the real size; fitting to the default size crops.
            this._measured = true;
            if (this._map) {
              this._fit();
            }
          }
        });
        this._resize.observe(el);
      }
    }
    if (changed.has("_map") && this._map && !this._view && this._measured) {
      this._fit();
    }
  }

  private async _teardown(): Promise<void> {
    const unsub = this._unsubscribe;
    this._unsubscribe = undefined;
    if (unsub) {
      try {
        await unsub();
      } catch {
        // connection already gone
      }
    }
  }

  private async _connect(entity: string): Promise<void> {
    const hass = this.hass;
    if (!hass) {
      return;
    }
    this._target = entity;
    await this._teardown();
    this._error = undefined;
    this._map = undefined;
    this._view = undefined;
    this._trail = [];
    this._feedback = {};
    try {
      const [map, background] = await Promise.all([
        hass.callWS<MapData>({ type: "yarbo_local/map", entity_id: entity }),
        hass.callWS<Background | null>({ type: "yarbo_local/background/get", entity_id: entity }),
      ]);
      if (this._target !== entity) {
        return;
      }
      this._map = map;
      this._background = background;
      this._unsubscribe = await hass.connection.subscribeMessage<StreamEvent>((event) => this._onEvent(event), {
        type: "yarbo_local/subscribe_live",
        entity_id: entity,
      });
    } catch (err) {
      this._error = `Could not load the Yarbo map: ${(err as { message?: string }).message ?? String(err)}`;
    }
  }

  private _onEvent(event: StreamEvent): void {
    if (event.type === "live") {
      this._live = event;
      if (event.x !== null && event.y !== null && this._config?.trail !== false) {
        const working = event.plan_running && event.activity === "working";
        this._trail = extendTrail(this._trail, { x: event.x, y: event.y, t: event.t, reverse: event.reverse, working });
      }
      if (this._follow && event.x !== null && event.y !== null && this._view && !this._gesture) {
        const [cx, cy] = toDisplay(event.x, event.y);
        this._view = { ...this._view, cx, cy };
      }
    } else if (event.type === "map_changed") {
      const entity = this._target;
      if (this.hass && entity) {
        void this.hass.callWS<MapData>({ type: "yarbo_local/map", entity_id: entity }).then((map) => {
          if (this._target === entity) {
            this._map = map;
          }
        });
      }
    } else if (event.type === "feedback") {
      const next = { ...this._feedback };
      if (event.data === null || event.data === undefined) {
        delete next[event.leaf];
      } else {
        next[event.leaf] = event.data;
      }
      this._feedback = next;
    }
  }

  // -- view -----------------------------------------------------------------------

  private _fit(): void {
    const b = this._map?.bounds;
    const pose = this._live && this._live.x !== null && this._live.y !== null ? toDisplay(this._live.x, this._live.y) : null;
    let bounds: [number, number, number, number] | null = b ? [-b[2], -b[3], -b[0], -b[1]] : null;
    if (pose) {
      bounds = bounds
        ? [Math.min(bounds[0], pose[0]), Math.min(bounds[1], pose[1]), Math.max(bounds[2], pose[0]), Math.max(bounds[3], pose[1])]
        : [pose[0] - 5, pose[1] - 5, pose[0] + 5, pose[1] + 5];
    }
    this._view = fitView(bounds ?? [-10, -10, 10, 10], this._size);
  }

  private _toggleFollow(): void {
    this._follow = !this._follow;
    if (this._follow && this._view && this._live?.x != null && this._live.y != null) {
      const [cx, cy] = toDisplay(this._live.x, this._live.y);
      this._view = { ...this._view, cx, cy };
    }
  }

  private _local(ev: PointerEvent | WheelEvent): { px: number; py: number } {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return { px: ev.clientX - rect.left, py: ev.clientY - rect.top };
  }

  private _onWheel(ev: WheelEvent): void {
    if (!this._view) {
      return;
    }
    ev.preventDefault();
    const { px, py } = this._local(ev);
    const anchor = pixelToDisplay(this._view, this._size, px, py);
    this._view = zoomAt(this._view, Math.exp(ev.deltaY * 0.0015), anchor);
  }

  private _onPointerDown(ev: PointerEvent): void {
    if (!this._view || (ev.target as HTMLElement).closest(".controls, .panel, .info")) {
      return;
    }
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const { px, py } = this._local(ev);
    this._pointers.set(ev.pointerId, { x: px, y: py });
    if (this._pointers.size === 1) {
      this._gesture = { startX: px, startY: py, view: this._view, moved: false };
    } else if (this._pointers.size === 2 && this._gesture) {
      const [a, b] = [...this._pointers.values()];
      this._gesture = { ...this._gesture, view: this._view, pinch: Math.hypot(a!.x - b!.x, a!.y - b!.y), moved: true };
    }
  }

  private _onPointerMove(ev: PointerEvent): void {
    const gesture = this._gesture;
    if (!gesture || !this._pointers.has(ev.pointerId)) {
      return;
    }
    const { px, py } = this._local(ev);
    this._pointers.set(ev.pointerId, { x: px, y: py });
    if (this._pointers.size >= 2 && gesture.pinch) {
      const [a, b] = [...this._pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = pixelToDisplay(gesture.view, this._size, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      this._view = zoomAt(gesture.view, gesture.pinch / Math.max(1, distance), mid);
      return;
    }
    const dx = px - gesture.startX;
    const dy = py - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) {
      return;
    }
    gesture.moved = true;
    this._dragging = true;
    this._follow = false;
    const mpp = metresPerPixel(gesture.view, this._size);
    this._view = { ...gesture.view, cx: gesture.view.cx - dx * mpp, cy: gesture.view.cy - dy * mpp };
  }

  private _onPointerUp(ev: PointerEvent): void {
    const gesture = this._gesture;
    this._pointers.delete(ev.pointerId);
    if (this._pointers.size > 0) {
      return;
    }
    this._gesture = undefined;
    this._dragging = false;
    if (gesture && !gesture.moved && this._view && ev.type === "pointerup") {
      const { px, py } = this._local(ev);
      this._tap(pixelToDisplay(this._view, this._size, px, py));
    }
  }

  private _tap(display: Point): void {
    if (this._align) {
      this._pick(display);
      return;
    }
    const local: Point = [-display[0], -display[1]];
    const mpp = this._view ? metresPerPixel(this._view, this._size) : 0.05;
    const detections = obstacleLayer(this._feedback.obstacles).detections;
    const near = detections
      .map((d) => ({ d, dist: Math.hypot(d.point[0] - local[0], d.point[1] - local[1]) }))
      .filter((x) => x.dist < Math.max(0.4, 14 * mpp))
      .sort((a, b) => a.dist - b.dist)[0];
    if (near) {
      this._selected = undefined;
      this._selectedObstacle = near.d === this._selectedObstacle ? undefined : near.d;
      return;
    }
    this._selectedObstacle = undefined;
    const zones = this._map?.zones ?? [];
    const line = zones.find((z) => !z.closed && distanceToPolyline(local, z.points) < 10 * mpp);
    const areas = zones.filter((z) => z.closed && pointInPolygon(local, z.points));
    const hit = line ?? areas.sort((a, b) => (a.area_m2 ?? 0) - (b.area_m2 ?? 0))[0];
    this._selected = hit && hit === this._selected ? undefined : hit;
  }

  // -- aerial alignment -------------------------------------------------------------

  private _startAlign(): void {
    this._selected = undefined;
    this._align = { step: "url", url: this._background?.image ?? "/local/yarbo/aerial.jpg", opacity: this._background?.opacity ?? 0.85 };
  }

  private _loadAlignImage(): void {
    const align = this._align;
    if (!align || !this._view) {
      return;
    }
    this._align = { ...align, busy: true, error: undefined };
    const img = new Image();
    img.onload = () => {
      const view = this._view!;
      const [x0, y0, w, h] = viewBox(view, this._size);
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const placement: Similarity = {
        a: scale,
        b: 0,
        e: x0 + (w - img.naturalWidth * scale) / 2,
        f: y0 + (h - img.naturalHeight * scale) / 2,
      };
      this._align = { ...this._align!, busy: false, step: "photo1", width: img.naturalWidth, height: img.naturalHeight, placement };
    };
    img.onerror = () => {
      this._align = { ...this._align!, busy: false, error: `Could not load ${align.url}. Put the file in /config/www and use /local/…` };
    };
    img.src = align.url;
  }

  private _snap(display: Point): Point {
    const mpp = this._view ? metresPerPixel(this._view, this._size) : 0.05;
    let best: Point = display;
    let bestDistance = PICK_SNAP_PX * mpp;
    const candidates: Point[] = [];
    for (const zone of this._map?.zones ?? []) {
      candidates.push(...zone.points.map(([x, y]) => toDisplay(x, y)));
    }
    for (const dock of this._map?.docks ?? []) {
      candidates.push(toDisplay(dock.point[0], dock.point[1]));
    }
    for (const c of candidates) {
      const d = Math.hypot(c[0] - display[0], c[1] - display[1]);
      if (d < bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    return best;
  }

  private _pick(display: Point): void {
    const align = this._align;
    if (!align?.placement) {
      return;
    }
    const photo = invertSimilarity(align.placement, display);
    switch (align.step) {
      case "photo1":
        this._align = { ...align, u1: photo, step: "map1" };
        break;
      case "map1":
        this._align = { ...align, w1: this._snap(display), step: "photo2" };
        break;
      case "photo2":
        this._align = { ...align, u2: photo, step: "map2" };
        break;
      case "map2": {
        const w2 = this._snap(display);
        const result = align.u1 && align.u2 && align.w1 ? fitSimilarity(align.u1, align.u2, align.w1, w2) : null;
        this._align = result
          ? { ...align, w2, result, step: "preview", error: undefined }
          : { ...align, step: "photo2", u2: undefined, error: "The two photo points are the same. Pick two landmarks far apart." };
        break;
      }
      default:
        break;
    }
  }

  private async _saveAlign(): Promise<void> {
    const align = this._align;
    if (!align?.result || !align.width || !align.height || !this.hass || !this._target) {
      return;
    }
    const background: Background = {
      image: align.url,
      transform: align.result,
      width: align.width,
      height: align.height,
      opacity: align.opacity,
    };
    this._align = { ...align, busy: true };
    try {
      this._background = await this.hass.callWS<Background>({
        type: "yarbo_local/background/save",
        entity_id: this._target,
        background,
      });
      this._align = undefined;
    } catch (err) {
      this._align = { ...align, busy: false, error: (err as { message?: string }).message ?? "Saving failed" };
    }
  }

  private async _clearBackground(): Promise<void> {
    if (!this.hass || !this._target) {
      return;
    }
    await this.hass.callWS({ type: "yarbo_local/background/clear", entity_id: this._target });
    this._background = null;
    this._align = undefined;
  }

  // -- rendering --------------------------------------------------------------------

  override render() {
    if (!this._config) {
      return nothing;
    }
    const height = this._config.height ?? DEFAULT_HEIGHT;
    const picking = Boolean(this._align && this._align.step !== "url" && this._align.step !== "preview");
    return html`<ha-card>
      ${this._renderHeader()}
      ${this._renderFault()}
      <div
        class="map ${this._dragging ? "dragging" : ""} ${picking ? "picking" : ""}"
        style="height:${height}px"
        @wheel=${this._onWheel}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
      >
        ${this._map && this._view
          ? this._renderSvg()
          : html`<div class="placeholder">${this._error ?? "Loading the map from the robot…"}</div>`}
        ${this._map && this._view ? this._renderFurniture() : nothing}
        ${this._renderControls()} ${this._renderInfo()} ${this._renderAlignPanel()}
      </div>
    </ha-card>`;
  }

  private _renderHeader() {
    const live = this._live;
    const title = this._config?.title ?? this._map?.title ?? "Yarbo";
    if (this._config?.show_status === false) {
      return html`<div class="header"><div class="title">${title}</div></div>`;
    }
    const fix = live?.fix_quality;
    const rtk =
      fix === 4
        ? { label: "RTK fixed", cls: "good" }
        : fix === 5
          ? { label: "RTK float", cls: "warn" }
          : fix
            ? { label: "GPS only", cls: "warn" }
            : { label: "No fix", cls: "bad" };
    return html`<div class="header">
      <div class="title">${title}</div>
      <div class="chips">
        ${live && !live.connected
          ? html`<span class="chip bad">${icon(mdiLanDisconnect)}Offline</span>`
          : nothing}
        ${live
          ? html`<span class="chip ${faultOf(live) ? "bad" : ""}"
              >${faultOf(live) ? icon(mdiAlertCircle) : live.awake === false ? icon(mdiSleep) : nothing}${statusLabel(live)}</span
            >`
          : nothing}
        ${this._obstacleCount() > 0
          ? html`<span class="chip warn" title=${this._obstacleTitle()}>${icon(mdiAlertOctagonOutline)}${this._obstacleCount()}</span>`
          : nothing}
        ${live?.battery != null
          ? html`<span class="chip ${live.battery < 20 ? "bad" : ""}"
              >${icon(live.charging ? mdiBatteryCharging : mdiBattery)}${live.battery}%</span
            >`
          : nothing}
        ${live
          ? html`<span class="chip ${rtk.cls}"
              >${icon(mdiSatelliteVariant)}${rtk.label}${live.satellites ? html` · ${live.satellites}` : nothing}</span
            >`
          : nothing}
      </div>
    </div>`;
  }

  private _renderFault() {
    const fault = this._live ? faultOf(this._live) : null;
    if (!fault) {
      return nothing;
    }
    const detail = faultDetail(fault, this.hass?.locale?.language);
    return html`<div class="fault" role="alert">
      ${icon(mdiAlertCircle)}
      <div class="fault-text">
        <div class="fault-title">${fault.description}${detail ? html`<span class="fault-detail">${detail}</span>` : nothing}</div>
        <div class="fault-hint">${fault.hint}</div>
      </div>
    </div>`;
  }

  private _renderSvg() {
    const view = this._view!;
    const map = this._map!;
    const [x0, y0, w, h] = viewBox(view, this._size);
    const mpp = metresPerPixel(view, this._size);
    const align = this._align;
    const mapDim = align && (align.step === "photo1" || align.step === "photo2");
    return html`<svg viewBox="${x0} ${y0} ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of ${map.title}">
      ${this._renderBackground()} ${this._renderGrid(x0, y0, w, h)}
      <g class=${mapDim ? "dim" : ""}>
        ${map.zones.filter((z) => z.closed).map((z) => this._renderZone(z))}
        ${map.zones.filter((z) => !z.closed).map((z) => this._renderZone(z))} ${this._renderDocks()}
        ${this._renderFeedback(mpp)} ${this._renderTrail()} ${this._renderRobot(mpp)} ${this._renderLabels(mpp)}
      </g>
      ${this._renderPicks(mpp)}
    </svg>`;
  }

  private _renderBackground(): SVGTemplateResult | typeof nothing {
    const align = this._align;
    if (align?.width && align.height) {
      const photoStep = align.step === "photo1" || align.step === "photo2";
      const transform = align.step === "preview" && align.result ? align.result : align.placement;
      if (!transform) {
        return nothing;
      }
      const opacity = photoStep ? 1 : align.step === "preview" ? align.opacity : 0.35;
      return svg`<image href=${align.url} width=${align.width} height=${align.height} transform=${svgMatrix(transform)}
        opacity=${opacity} preserveAspectRatio="none"></image>`;
    }
    const bg = this._background;
    if (!bg) {
      return nothing;
    }
    return svg`<image href=${bg.image} width=${bg.width} height=${bg.height} transform=${svgMatrix(bg.transform)}
      opacity=${bg.opacity} preserveAspectRatio="none"></image>`;
  }

  private _renderGrid(x0: number, y0: number, w: number, h: number) {
    if (this._background && !this._align) {
      return nothing;
    }
    const step = niceStep(Math.max(w, h));
    const lines: SVGTemplateResult[] = [];
    for (let x = Math.ceil(x0 / step) * step; x < x0 + w; x += step) {
      lines.push(svg`<line x1=${x} y1=${y0} x2=${x} y2=${y0 + h}></line>`);
    }
    for (let y = Math.ceil(y0 / step) * step; y < y0 + h; y += step) {
      lines.push(svg`<line x1=${x0} y1=${y} x2=${x0 + w} y2=${y}></line>`);
    }
    return svg`<g class="grid">${lines}</g>`;
  }

  private _renderZone(zone: ZoneData) {
    const classes = `${zone.family} ${zone.enabled ? "" : "disabled"} ${zone === this._selected ? "selected" : ""}`;
    if (zone.closed) {
      return zone.points.length >= 3
        ? svg`<polygon class="zone ${classes}" points=${displayPoints(zone.points)}></polygon>`
        : nothing;
    }
    return zone.points.length >= 2
      ? svg`<polyline class="line ${classes}" points=${displayPoints(zone.points)}></polyline>`
      : nothing;
  }

  private _renderDocks() {
    return (this._map?.docks ?? []).map((dock) => {
      const phi = dock.straight_phi ?? 0;
      const { dock: outline, guard } = dockOutline(dock.point, phi);
      return svg`<polygon class="guard" points=${displayPoints(guard)}></polygon>
        <polygon class="dock" points=${displayPoints(outline)}></polygon>`;
    });
  }

  private _renderFeedback(mpp: number) {
    const parts: SVGTemplateResult[] = [];
    const plan = planOverlay(this._feedback.plan_feedback);
    for (const path of plan.remaining) {
      parts.push(svg`<polyline class="plan-remaining" points=${displayPoints(path)}></polyline>`);
    }
    for (const path of plan.visited) {
      parts.push(svg`<polyline class="plan-visited" points=${displayPoints(path)}></polyline>`);
    }
    const route = longestPath(this._feedback.recharge_feedback);
    if (route.length >= 2) {
      parts.push(svg`<polyline class="route" points=${displayPoints(route)}></polyline>`);
    }
    const obstacles = obstacleLayer(this._feedback.obstacles);
    for (const d of obstacles.detections) {
      const [x, y] = d.point;
      const size = Math.max(0.35, 7 * mpp);
      const selected = d === this._selectedObstacle;
      parts.push(
        svg`<rect class="detection ${selected ? "selected" : ""}" x=${-x - size / 2} y=${-y - size / 2} width=${size} height=${size}
          transform="rotate(45 ${-x} ${-y})"></rect>`,
      );
    }
    for (const cluster of obstacles.barriers) {
      // A ring that keeps a minimum on-screen size, so obstacles stay findable zoomed out.
      const cx = cluster.reduce((s, p) => s + p[0], 0) / cluster.length;
      const cy = cluster.reduce((s, p) => s + p[1], 0) / cluster.length;
      const spread = Math.max(...cluster.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
      parts.push(svg`<circle class="obstacle-ring" cx=${-cx} cy=${-cy} r=${Math.max(spread + 0.25, 7 * mpp)}></circle>`);
      if (cluster.length >= 2) {
        parts.push(svg`<polyline class="obstacle" points=${displayPoints(cluster)}></polyline>`);
      } else {
        parts.push(svg`<circle class="obstacle-dot" cx=${-cx} cy=${-cy} r=${Math.max(0.08, 2.5 * mpp)}></circle>`);
      }
    }
    return parts;
  }

  private _renderTrail() {
    if (this._config?.trail === false) {
      return nothing;
    }
    return trailSegments(this._trail).map((seg) => {
      const cls = `trail ${seg.reverse ? "reverse" : ""} ${seg.working ? "" : "thin"}`;
      return seg.working
        ? svg`<polyline class=${cls} stroke-width=${CUT_WIDTH_M} points=${displayPoints(seg.points)}></polyline>`
        : svg`<polyline class=${cls} points=${displayPoints(seg.points)}></polyline>`;
    });
  }

  private _renderRobot(mpp: number) {
    const live = this._live;
    if (!live || live.x === null || live.y === null || live.phi === null) {
      return nothing;
    }
    const footprint = robotFootprint(live.x, live.y, live.phi);
    const [cx, cy] = toDisplay(live.x, live.y);
    const tooSmall = 1.3 / mpp < 22;
    return svg`${tooSmall ? svg`<circle class="robot-halo ${faultOf(live) ? "fault" : ""}" cx=${cx} cy=${cy} r=${11 * mpp}></circle>` : nothing}
      <polygon class="robot ${faultOf(live) ? "fault" : live.awake === false ? "asleep" : ""}" points=${displayPoints(footprint)}></polygon>`;
  }

  private _renderLabels(mpp: number) {
    const size = 13 * mpp;
    return (this._map?.zones ?? [])
      .filter((z) => z.closed && z.name && z.points.length >= 3)
      .map((z) => {
        const cx = z.points.reduce((s, p) => s + p[0], 0) / z.points.length;
        const cy = z.points.reduce((s, p) => s + p[1], 0) / z.points.length;
        return svg`<text class="label" x=${-cx} y=${-cy} font-size=${size} stroke-width=${size * 0.28}>${z.name}</text>`;
      });
  }

  private _renderPicks(mpp: number) {
    const align = this._align;
    if (!align?.placement) {
      return nothing;
    }
    const r = 6 * mpp;
    const photoTransform = align.step === "preview" && align.result ? align.result : align.placement;
    const photoPoints = [align.u1, align.u2].filter((p): p is Point => Boolean(p)).map((u) => applySimilarity(photoTransform, u));
    const mapPoints = [align.w1, align.w2].filter((p): p is Point => Boolean(p));
    return svg`${[...photoPoints, ...mapPoints].map(([x, y]) => svg`<circle class="pick" cx=${x} cy=${y} r=${r}></circle>`)}`;
  }

  private _renderFurniture() {
    const view = this._view!;
    const mpp = metresPerPixel(view, this._size);
    const step = niceStep(view.width);
    const barPx = step / mpp;
    return html`<div class="scale">
        ${step} m
        <div class="bar" style="width:${barPx}px"></div>
      </div>
      <div class="north" aria-hidden="true"><svg viewBox="0 0 14 16"><path d="M7 0 L14 16 L7 12 L0 16 Z"></path></svg>N</div>`;
  }

  private _renderControls() {
    const admin = Boolean(this.hass?.user?.is_admin);
    return html`<div class="controls">
      <button class="icon-button" title="Fit the map" aria-label="Fit the map" @click=${() => this._fit()}>
        ${icon(mdiFitToScreenOutline)}
      </button>
      <button
        class="icon-button ${this._follow ? "active" : ""}"
        title="Follow the robot"
        aria-label="Follow the robot"
        aria-pressed=${this._follow ? "true" : "false"}
        @click=${() => this._toggleFollow()}
      >
        ${icon(mdiCrosshairsGps)}
      </button>
      ${this._config?.trail !== false
        ? html`<button class="icon-button" title="Clear the trail" aria-label="Clear the trail" @click=${() => (this._trail = [])}>
            ${icon(mdiEraser)}
          </button>`
        : nothing}
      ${admin
        ? html`<button
            class="icon-button ${this._align ? "active" : ""}"
            title="Align an aerial photo"
            aria-label="Align an aerial photo"
            @click=${() => (this._align ? (this._align = undefined) : this._startAlign())}
          >
            ${icon(mdiImageEditOutline)}
          </button>`
        : nothing}
    </div>`;
  }

  private _obstacleCount(): number {
    const layer = obstacleLayer(this._feedback.obstacles);
    return layer.detections.length + layer.barriers.length;
  }

  private _obstacleTitle(): string {
    const layer = obstacleLayer(this._feedback.obstacles);
    const scope = layer.active ? "this run" : "the last run";
    return `${layer.detections.length} ultrasonic and ${layer.barriers.length} mapped obstacles in ${scope}${layer.planName ? ` (${layer.planName})` : ""}`;
  }

  private _renderInfo() {
    const obstacle = this._selectedObstacle;
    if (obstacle && !this._align) {
      const sensor: Record<string, string> = {
        ultrasonic_left: "Front-left ultrasonic",
        ultrasonic_middle: "Middle ultrasonic",
        ultrasonic_right: "Front-right ultrasonic",
      };
      const when = obstacle.t ? new Date(obstacle.t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return html`<div class="info">
        <div><strong>Obstacle</strong></div>
        <div class="muted">
          ${sensor[obstacle.source] ?? obstacle.source}${obstacle.distance_m != null ? html` · closest ${obstacle.distance_m} m` : nothing}${when
            ? html` · ${when}`
            : nothing}${obstacle.count > 1 ? html` · ${obstacle.count} passes` : nothing}
        </div>
        <div class="muted">Position estimated from the robot and sensor direction</div>
      </div>`;
    }
    const zone = this._selected;
    if (!zone || this._align) {
      return nothing;
    }
    const kind: Record<string, string> = {
      areas: "Work area",
      nogozones: "No-go zone",
      novisionzones: "No-vision zone",
      elec_fence: "Electronic fence",
      pathways: "Pathway",
      sidewalks: "Memory path",
      deadends: "Dead end",
    };
    const size = zone.closed && zone.area_m2 != null ? `${zone.area_m2} m²` : `${zone.length_m} m long`;
    return html`<div class="info">
      <div><strong>${zone.name || "Unnamed"}</strong></div>
      <div class="muted">${kind[zone.family] ?? zone.family} · ${size}${zone.enabled ? "" : " · disabled"}</div>
    </div>`;
  }

  private _renderAlignPanel() {
    const align = this._align;
    if (!align) {
      return nothing;
    }
    const steps: Record<AlignStep, [string, string]> = {
      url: [
        "Aerial photo",
        "A top-down photo of your property served by Home Assistant, for example /local/yarbo/aerial.jpg for /config/www/yarbo/aerial.jpg. The card never fetches map tiles.",
      ],
      photo1: ["Step 1 of 4", "Tap a landmark on the photo, such as a corner of the driveway."],
      map1: ["Step 2 of 4", "Tap the same landmark on the map. Taps snap to zone corners and the dock."],
      photo2: ["Step 3 of 4", "Tap a second landmark on the photo, far from the first."],
      map2: ["Step 4 of 4", "Tap that second landmark on the map."],
      preview: ["Check the fit", "The photo is placed. Adjust the opacity, then save for everyone who uses this dashboard."],
    };
    const [heading, hint] = steps[align.step];
    return html`<div class="panel" role="dialog" aria-label="Align an aerial photo">
      <div class="step">${heading}</div>
      <div class="hint">${hint}</div>
      ${align.step === "url"
        ? html`<div class="row">
            <input
              type="text"
              .value=${align.url}
              aria-label="Photo URL"
              @input=${(e: Event) => (this._align = { ...align, url: (e.target as HTMLInputElement).value })}
            />
            <button class="primary" ?disabled=${align.busy} @click=${() => this._loadAlignImage()}>Load photo</button>
          </div>`
        : nothing}
      ${align.step === "preview"
        ? html`<div class="row">
            <label for="opacity">Opacity</label>
            <input
              id="opacity"
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              .value=${String(align.opacity)}
              @input=${(e: Event) => (this._align = { ...align, opacity: Number((e.target as HTMLInputElement).value) })}
            />
          </div>`
        : nothing}
      ${align.error ? html`<div class="error">${align.error}</div>` : nothing}
      <div class="row">
        ${align.step === "preview"
          ? html`<button class="primary" ?disabled=${align.busy} @click=${() => this._saveAlign()}>Save</button>
              <button @click=${() => (this._align = { ...align, step: "photo1", u1: undefined, w1: undefined, u2: undefined, w2: undefined, result: undefined })}>
                Pick again
              </button>`
          : nothing}
        ${this._background ? html`<button @click=${() => this._clearBackground()}>Remove photo</button>` : nothing}
        <button @click=${() => (this._align = undefined)}>Cancel</button>
      </div>
    </div>`;
  }
}

// The public tag, custom:yarbo-local-card, belongs to the loader in entry.ts.
if (!customElements.get("yarbo-local-card-view")) {
  customElements.define("yarbo-local-card-view", YarboLocalCard);
}
