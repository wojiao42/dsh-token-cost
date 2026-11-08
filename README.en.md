# dsh-token-cost

[简体中文（完整版）](README.md) · English (abridged)

> This is an **abridged English version**. The [Chinese README](README.md) is the source of truth;
> details that change often (design notes, changelog, screenshots) live there.

Live token usage and estimated cost in the DSH sidebar: every session combined plus the current
task, with a per-session breakdown and per-turn preview on hover. Cost comes from an editable
price table; the plugin adds no model calls, prompts or tools.

[![version](https://img.shields.io/badge/version-2.4.1-blue)](https://github.com/wojiao42/dsh-token-cost/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## What it does

- Two-line badge in the sidebar footer: total cost across all sessions, and cost plus context
  usage for the current task. A green dot marks a running task; the as-of time is only in the panel.
- Hover the badge to expand a per-session panel (click to pin): title, tokens, cost, occupancy,
  elapsed/relative time, turns/steps, averaged first token, model and tool time, decode `tok/s`,
  cache-hit rate and the as-of clock.
- Hover a single session row for that conversation's per-turn usage and cost; click a turn to
  switch to that session and land on it. The Host half reads the log via
  `ctx.sessionQuery.readSession()` and folds turns itself (`foldTurns` / `foldTurnUsage`); retried
  turns are marked approximate, unprovable usage is shown as `—` instead of a guess.
- The per-turn preview returns all turns by default (`limit` defaults to 200, max 200).
- Cost = uncached input × `cacheMiss` + (cache read + cache write) × `cacheHit` + output ×
  `output`, looked up per model in a table at the top of `client.js` (CNY per million tokens).
Prices are **time-of-day tiered** since 2026-09-10 (peak / idle; idle is half of peak):
peak = Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time, everything else (weekends included) is idle.
Chinese statutory holidays are not detected, so a holiday is priced at the peak rate — over-counted, never under.
- Everything comes from existing session projections (`tokenUsage` / `contextPressure` /
  `modelSelection`); the official `dsh-token-meter` provides the usage figures.

## Quick start

In DSH Desktop: Settings (Ctrl+,) → Plugin Market → Custom install →
`github:wojiao42/dsh-token-cost`, then restart DSH.

> The desktop profile is managed by the app: running `dsh plugin --profile desktop add` may be
> rejected; use the step above.

For DSH Web, install from the command line and refresh the page:

```sh
dsh plugin --profile web add github:wojiao42/dsh-token-cost
```

Then hover the sidebar badge to see the breakdown.

## Key limits

- **Estimates, not a bill.** Default prices follow public pricing and the peak/idle schedule; discounts, credits, billing
  tiers and image/file pricing are invisible to the plugin. The meter itself uses a
  four-characters-per-token heuristic and underestimates CJK and JSON. Reconcile against the
  official bill, or edit the price table.
- Deleted, archived or unlisted sessions carry no data and are excluded from the total.
- At most 48 cold sessions are warmed per list update (running first); the rest need one click on
  the load-remaining button in the panel footer.
- Context occupancy includes heuristic error; it is a reference value, not the billed size.
- **Costs are priced per event:** each `assistant/message` is priced by its own timestamp (peak/idle) and the model in effect, instead of pricing a whole session by its last-activity tier — a session crossing the 09:00/12:00/14:00/18:00 boundaries used to be doubled or halved. Host route: `GET /token-cost/costs?ids=…`.
- **Missing projections are backfilled:** for old/cold sessions without a `tokenUsage` projection, the panel asks `/token-cost/session-usage`, which sums provider-reported usage straight from the session log and returns the model name too.
- No model requests are added: the plugin only reads local Host projections.
- **Price table auto-updates:** `pricing.json` in the repo root is fetched every 24 h (cached); changing it updates every user without a plugin release.
- **Ledger groups:** credit (recharged / gifted / total), spend (official / local / gap), balance (official / estimated), book (last check / status / backups).
- **Ledger panel:** total credit (recharge + gifts), official spend, local estimate, gap, official balance and estimated balance, with a daily ledger backup under `$DSH_HOME/token-cost/backups/`.
- **Official cumulative reconciliation:** with credentials access the panel reads `get_user_summary` (`total_costs`) and shows official cumulative spend vs the local estimate — one read, no snapshot pair needed.
- **Balance reconciliation:** with `network.balance: true` the panel shows the official DeepSeek balance plus the drift between the local estimate and the official deduction. Two or more snapshots are needed before a drift appears; spending from other apps on the same API key lands in that gap too.

## Compatibility

- DSH Desktop and DSH Web: the client half declares `platform: web` and injects into
  `@deepseek-ai/dsh-client-ui-sidebar`. The target DSH must support bundle patches (`dsh.bundle.patch`).
- No build step: `client.js` is a committed artifact, so git installs never run a build.
- Offline tests need no browser: `node tools/plugin-summary-test.cjs` (49 assertions) and
  `node tools/turns-test.mjs` (36 assertions); both must exit 0.
- `package.json` declares no `engines`; the Host half is plain ESM with no native modules.
  Tested locally on Node v24.21.0 (Windows).

## License

MIT. See [LICENSE](LICENSE).
