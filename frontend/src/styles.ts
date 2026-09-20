import { css } from "lit";

export const cardStyles = css`
  :host {
    display: block;
    --yl-area: var(--yarbo-area-color, var(--primary-color, #1e88e5));
    --yl-nogo: var(--yarbo-nogo-color, var(--error-color, #db4437));
    --yl-novision: var(--yarbo-novision-color, #8e5bd6);
    --yl-path: var(--yarbo-path-color, var(--warning-color, #ffa000));
    --yl-sidewalk: var(--yarbo-sidewalk-color, #00a39a);
    --yl-dock: var(--yarbo-dock-color, var(--success-color, #43a047));
    --yl-robot: var(--yarbo-robot-color, var(--primary-color, #1e88e5));
    --yl-trail: var(--yarbo-trail-color, var(--primary-color, #1e88e5));
    --yl-reverse: var(--yarbo-reverse-color, #d63fd6);
    --yl-ink: var(--primary-text-color, #1c1f24);
    --yl-muted: var(--secondary-text-color, #5f6670);
    --yl-ground: var(--secondary-background-color, #eef0f2);
    --yl-surface: var(--card-background-color, #ffffff);
    --yl-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
  }
  ha-card {
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px 10px;
    flex-wrap: wrap;
  }
  .title {
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--yl-ink);
    margin-right: auto;
    line-height: 1.3;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px 0 8px;
    border-radius: 13px;
    background: var(--yl-ground);
    color: var(--yl-ink);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .chip svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
    flex: none;
  }
  .chip.good {
    color: var(--success-color, #2e7d32);
  }
  .chip.warn {
    color: var(--warning-color, #b26a00);
  }
  .chip.bad {
    color: var(--error-color, #c62828);
  }
  .fault {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 16px 12px;
    background: color-mix(in srgb, var(--error-color, #c62828) 12%, var(--yl-surface));
    color: var(--yl-ink);
    border-top: 1px solid color-mix(in srgb, var(--error-color, #c62828) 30%, transparent);
  }
  .fault > svg {
    width: 22px;
    height: 22px;
    flex: none;
    fill: var(--error-color, #c62828);
    margin-top: 1px;
  }
  .fault-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .fault-title {
    font-weight: 600;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 8px;
  }
  .fault-detail {
    font-weight: 400;
    font-size: 0.85rem;
    color: var(--yl-muted);
    font-variant-numeric: tabular-nums;
  }
  .fault-hint {
    font-size: 0.9rem;
  }
  .map {
    position: relative;
    background: var(--yl-ground);
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  .map.dragging {
    cursor: grabbing;
  }
  .map.picking {
    cursor: crosshair;
  }
  .map > svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--yl-muted);
    padding: 24px;
    text-align: center;
  }
  .controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .controls button,
  .panel button {
    font: inherit;
  }
  .icon-button {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    border: 1px solid var(--yl-divider);
    background: var(--yl-surface);
    color: var(--yl-ink);
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  }
  .icon-button svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
  .icon-button.active {
    background: var(--primary-color, #1e88e5);
    color: var(--text-primary-color, #fff);
    border-color: transparent;
  }
  .icon-button:focus-visible,
  .panel button:focus-visible,
  .panel input:focus-visible {
    outline: 2px solid var(--primary-color, #1e88e5);
    outline-offset: 2px;
  }
  .scale {
    position: absolute;
    left: 12px;
    bottom: 10px;
    font-size: 0.75rem;
    color: var(--yl-ink);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .scale .bar {
    height: 4px;
    border: 2px solid var(--yl-ink);
    border-top: none;
    margin-top: 2px;
  }
  .north {
    position: absolute;
    right: 58px;
    top: 14px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--yl-ink);
    display: grid;
    justify-items: center;
    pointer-events: none;
  }
  .north svg {
    width: 14px;
    height: 16px;
    fill: var(--yl-ink);
  }
  .info {
    position: absolute;
    left: 12px;
    top: 12px;
    background: var(--yl-surface);
    color: var(--yl-ink);
    border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    font-size: 0.85rem;
    max-width: 60%;
  }
  .info .muted {
    color: var(--yl-muted);
  }
  .panel {
    position: absolute;
    left: 12px;
    right: 58px;
    bottom: 12px;
    background: var(--yl-surface);
    color: var(--yl-ink);
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    display: grid;
    gap: 8px;
    font-size: 0.9rem;
  }
  .panel .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .panel input[type="text"] {
    flex: 1;
    min-width: 160px;
    font: inherit;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--yl-divider);
    background: var(--yl-ground);
    color: var(--yl-ink);
  }
  .panel button {
    padding: 6px 12px;
    border-radius: 18px;
    border: 1px solid var(--yl-divider);
    background: var(--yl-surface);
    color: var(--yl-ink);
    cursor: pointer;
  }
  .panel button.primary {
    background: var(--primary-color, #1e88e5);
    color: var(--text-primary-color, #fff);
    border-color: transparent;
  }
  .panel .step {
    font-weight: 500;
  }
  .panel .hint {
    color: var(--yl-muted);
    font-size: 0.82rem;
  }
  .panel .error {
    color: var(--error-color, #c62828);
  }
  svg .zone {
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  svg .zone.areas {
    fill: color-mix(in srgb, var(--yl-area) 22%, transparent);
    stroke: var(--yl-area);
  }
  svg .zone.nogozones {
    fill: color-mix(in srgb, var(--yl-nogo) 26%, transparent);
    stroke: var(--yl-nogo);
  }
  svg .zone.novisionzones {
    fill: color-mix(in srgb, var(--yl-novision) 20%, transparent);
    stroke: var(--yl-novision);
  }
  svg .zone.elec_fence {
    fill: none;
    stroke: var(--yl-path);
    stroke-dasharray: 6 4;
  }
  svg .zone.disabled {
    opacity: 0.45;
  }
  svg .zone.selected {
    stroke-width: 4px;
  }
  svg .line {
    fill: none;
    stroke-width: 4px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 10 7;
  }
  svg .line.pathways {
    stroke: var(--yl-path);
  }
  svg .line.sidewalks {
    stroke: var(--yl-sidewalk);
  }
  svg .line.deadends {
    stroke: var(--yl-muted);
  }
  svg .line.selected {
    stroke-width: 7px;
  }
  svg .dock {
    fill: var(--yl-dock);
    stroke: var(--yl-surface);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .guard {
    fill: none;
    stroke: var(--yl-dock);
    stroke-width: 1.5px;
    stroke-dasharray: 4 4;
    vector-effect: non-scaling-stroke;
  }
  svg .trail {
    fill: none;
    stroke: var(--yl-trail);
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.55;
  }
  svg .trail.thin {
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }
  svg .trail.reverse {
    stroke: var(--yl-reverse);
  }
  svg .plan-visited {
    fill: none;
    stroke: var(--yl-trail);
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
    opacity: 0.8;
  }
  svg .plan-remaining {
    fill: none;
    stroke: var(--yl-muted);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    opacity: 0.35;
  }
  svg .route {
    fill: none;
    stroke: var(--yl-dock);
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 8 5;
  }
  svg .obstacle {
    fill: none;
    stroke: var(--yl-nogo);
    stroke-width: 4px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  svg .obstacle-dot {
    fill: var(--yl-nogo);
  }
  svg .detection {
    fill: color-mix(in srgb, var(--yl-path) 70%, transparent);
    stroke: var(--yl-surface);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .detection.selected {
    fill: var(--yl-path);
    stroke: var(--yl-ink);
    stroke-width: 2.5px;
  }
  svg .obstacle-ring {
    fill: color-mix(in srgb, var(--yl-nogo) 22%, transparent);
    stroke: var(--yl-nogo);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .robot {
    fill: var(--yl-robot);
    stroke: var(--yl-surface);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  svg .robot-halo {
    fill: color-mix(in srgb, var(--yl-robot) 25%, transparent);
    stroke: var(--yl-robot);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .robot.fault {
    fill: var(--error-color, #c62828);
  }
  svg .robot-halo.fault {
    fill: color-mix(in srgb, var(--error-color, #c62828) 25%, transparent);
    stroke: var(--error-color, #c62828);
  }
  svg .robot.asleep {
    fill: var(--yl-muted);
  }
  svg .label {
    fill: var(--yl-ink);
    stroke: var(--yl-surface);
    paint-order: stroke;
    stroke-linejoin: round;
    font-family: var(--ha-font-family-body, system-ui, sans-serif);
    font-weight: 500;
    text-anchor: middle;
    dominant-baseline: middle;
  }
  svg .grid line {
    stroke: var(--yl-muted);
    stroke-opacity: 0.16;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
  svg .pick {
    fill: var(--primary-color, #1e88e5);
    stroke: var(--yl-surface);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }
  .dim {
    opacity: 0.25;
  }
`;
