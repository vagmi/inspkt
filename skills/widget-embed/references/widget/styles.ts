/** Shadow-root CSS. Isolated from the host page; host pages can theme via
 * custom properties, e.g. `[data-mudhal] { --mudhal-accent: #0a6; }`. */
export const styles = /* css */ `
:host {
  all: initial;
  display: block;
  --st-bg: var(--mudhal-bg, #faf8f2);
  --st-ink: var(--mudhal-ink, #2e2a23);
  --st-muted: var(--mudhal-muted, #7d7468);
  --st-border: var(--mudhal-border, #d9d2c3);
  --st-accent: var(--mudhal-accent, #c2410c);
  --st-radius: var(--mudhal-radius, 8px);
  --st-font: var(--mudhal-font, ui-sans-serif, system-ui, sans-serif);
  --st-mono: ui-monospace, "SF Mono", Menlo, monospace;
}
.card {
  font-family: var(--st-font);
  color: var(--st-ink);
  background: var(--st-bg);
  border: 1px solid var(--st-border);
  border-radius: var(--st-radius);
  padding: 1.25rem 1.5rem;
  max-width: 28rem;
  box-sizing: border-box;
}
.card *, .card *::before, .card *::after { box-sizing: border-box; }
.kicker {
  font-family: var(--st-mono);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--st-accent);
  margin: 0 0 0.4rem;
}
.title { font-size: 1.3rem; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
.body { font-size: 0.9rem; color: var(--st-muted); margin: 0.5rem 0 0; }
.loading { font-family: var(--st-mono); font-size: 0.75rem; color: var(--st-muted); }
`;
