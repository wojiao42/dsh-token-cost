/**
 * Host half of the token-cost bundle.
 *
 * All state comes from existing session projections (`tokenUsage`,
 * `contextPressure`, `modelSelection`), so the host side registers nothing and
 * only exists to make this package a normal Harness plugin row.
 */
export function apply() {}
