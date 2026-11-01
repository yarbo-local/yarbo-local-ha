import { css } from "lit";

/** What every page of the Yard panel shares. Colours come from the Home Assistant theme. */
export const pageStyles = css`
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
`;
