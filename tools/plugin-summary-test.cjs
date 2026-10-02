// Offline test for the plugin's global (cross-session) summary half.
// Fakes React/ReactDOM/hooks, feeds a session-list snapshot with mixed models,
// and checks the aggregate math, ordering, badge text and popover rendering.
const path = require('node:path');

let definition;
global.window = {
  __ModuleLoader__: {
    load(def) {
      definition = def;
    },
  },
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
};
const portals = [];
global.document = {
  body: { tag: 'body' },
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
};

require(path.resolve(__dirname, '..', 'client.js'));

const hooks = [];
let setters = [];
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => {
    hooks.push('useState');
    const value = globalThis.__FORCE_OPEN__ === true ? true : initial;
    const setter = (next) => setters.push(next);
    setters.push(setter);
    return [value, setter];
  },
  useRef: () => {
    hooks.push('useRef');
    return { current: null };
  },
  useEffect: (fn) => {
    hooks.push('useEffect');
    const cleanup = fn();
    if (typeof cleanup === 'function') cleanup();
  },
  useMemo: (fn) => {
    hooks.push('useMemo');
    return fn();
  },
  useCallback: (fn) => {
    hooks.push('useCallback');
    return fn;
  },
  useSyncExternalStore: (subscribe, getSnapshot) => {
    hooks.push('useSyncExternalStore');
    return getSnapshot();
  },
};
const ReactDOM = {
  createPortal: (node, container) => {
    portals.push({ node, container });
    return node;
  },
};

const dictionaries = [];
const registrations = [];
function makeCtx() {
  return {
    effect: (fn) => fn(),
    locale: { register: (ns, dict) => dictionaries.push({ ns, dict }) },
    slots: {
      inject: (slot, callback) => callback(),
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
    get: () => undefined,
  };
}

const plugin = definition.factory((name) => {
  if (name === 'react') return React;
  if (name === 'react-dom') return ReactDOM;
  throw new Error('unexpected require: ' + name);
});
plugin.apply(makeCtx());

const assert = (label, condition) => {
  console.log((condition ? 'PASS  ' : 'FAIL  ') + label);
  if (!condition) process.exitCode = 1;
};

const registration = registrations.find((entry) => entry.options.name === 'sidebar.footer.action');
assert('registers into sidebar.footer.action', registration !== undefined);
const composerRegistration = registrations.find((entry) => entry.options.name === 'conversation.composer.dock' && entry.options.id === 'token-cost-summary');
assert('global summary is NOT duplicated into the composer dock', composerRegistration === undefined);
assert('summary registration options', JSON.stringify(registration.options) ===
  JSON.stringify({ name: 'sidebar.footer.action', id: 'token-cost-summary', order: 40, locale: 'tokenCostSummary', inject: registration.options.inject }));
assert('summary locale dictionaries registered', dictionaries.some((entry) => entry.ns === 'tokenCostSummary'));
assert('width hook present on summary dict', Object.keys(dictionaries.find((entry) => entry.ns === 'tokenCostSummary').dict.zh).length ===
  Object.keys(dictionaries.find((entry) => entry.ns === 'tokenCostSummary').dict.en).length);

// --- session list snapshot: A running/priced, B idle/priced, C running/unpriced,
//     D only present in projectionsBySession (defensive path).
const usage = (miss, cacheRead, output, cacheWrite = 0) => ({
  uncachedInputTokens: miss,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
  outputTokens: output,
});
const PROJECTIONS = {
  a: {
    tokenUsage: usage(1000, 9000, 500),
    contextPressure: { projectedTokens: 64000, contextWindow: 128000 },
    modelSelection: { next: { model: 'deepseek-flash' } },
  },
  b: {
    tokenUsage: usage(0, 0, 1000),
    modelSelection: { lastUsed: { model: 'deepseek-v4-pro' } },
  },
  c: {
    tokenUsage: usage(2000, 0, 0),
    modelSelection: { next: { model: 'mystery-model' } },
  },
  d: { tokenUsage: usage(0, 0, 100) },
};
const SESSIONS = {
  ids: ['a', 'b', 'c'],
  byId: {
    a: { id: 'a', displayTitle: '主任务', running: true, retainedBy: { mainView: 1 }, projectionValues: PROJECTIONS.a },
    b: { id: 'b', displayTitle: '旧会话', running: false, retainedBy: {}, projectionValues: PROJECTIONS.b },
    c: { id: 'c', displayTitle: '并行任务', running: true, retainedBy: {}, projectionValues: PROJECTIONS.c },
  },
  projectionsBySession: {
    a: { values: PROJECTIONS.a },
    d: { values: PROJECTIONS.d },
  },
  phase: 'ready',
};

const useSessions = (selector) => (typeof selector === 'function' ? selector(SESSIONS) : SESSIONS);
const ZH = dictionaries.find((entry) => entry.ns === 'tokenCostSummary').dict.zh;
const t = (key) => ZH[key] ?? key;
const opened = [];
const warmed = [];
const warmProjections = (id) => warmed.push(id);
const assertEqual = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  if (!ok) {
    console.log('      expected: ' + JSON.stringify(expected));
    console.log('      actual  : ' + JSON.stringify(actual));
    process.exitCode = 1;
  }
};

const collect = (node, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (typeof node.type === 'string') {
    const props = node.props ?? {};
    const text = (node.children ?? []).filter((child) => typeof child !== 'string' ? false : child !== '').join('');
    out.push({ className: props.className ?? '', text, node });
  }
  for (const child of node.children ?? []) collect(child, out);
  return out;
};

// --- collapsed badge
hooks.length = 0;
setters = [];
portals.length = 0;
globalThis.__FORCE_OPEN__ = false;
const badge = registration.component({ useSessions, t, openSession: (id) => opened.push(id), warmProjections, wide: true });
const badgeNodes = collect(badge);
const badgeKeys = badgeNodes.filter((entry) => entry.className === 'tcs-key').map((entry) => entry.text);
const badgeValues = badgeNodes.filter((entry) => entry.className === 'tcs-value').map((entry) => entry.text);
assertEqual('badge shows the total and the current task side by side',
  [badgeKeys, badgeValues],
  [['全部', '当前'], ['≈¥0.00658 · 2 运行中', '≈¥0.00258 · 50.0%']]);
assert('badge uses summary icon', badgeNodes.some((entry) => entry.node.type === 'svg'));
assert('no portal while collapsed', portals.length === 0);

// --- narrow (collapsed sidebar)
const narrow = registration.component({ useSessions, t, openSession: () => {}, wide: false });
assert('narrow badge shows money only', collect(narrow).find((entry) => entry.className === 'tcs-label').text === '≈¥0.00658');

// --- expanded panel
hooks.length = 0;
setters = [];
portals.length = 0;
globalThis.__FORCE_OPEN__ = true;
const expanded = registration.component({ useSessions, t, openSession: (id) => opened.push(id), wide: true });
const nodes = collect(expanded);
const byClass = (className) => nodes.filter((entry) => entry.className === className);
assert('panel is portalled to document.body', portals.length === 1 && portals[0].container === global.document.body);
assert('panel head shows estimate', byClass('tcs-headValue')[0].text === '≈¥0.00658');
const meta = byClass('tcs-meta')[0].node.children.filter((child) => child !== null).map((child) => child.children.join(''));
const rows = byClass('tcs-row');
assertEqual('meta line reports sessions/running/cache/occupancy', meta, ['4 会话', '2 运行中', '缓存命中率 75.0%', '≤50.0%']);
assertEqual('four session rows', rows.length, 4);
const currentRow = rows.find((entry) => entry.node.props['data-current'] === 'true');
assert('panel marks the current task row', currentRow !== undefined && currentRow.node.props.title.startsWith('主任务'));
assertEqual('rows sorted running-first then by cost',
  rows.map((entry) => entry.node.props.title.split(' · ')[0]),
  ['主任务', '并行任务', '旧会话', 'd']);
assert('row shows tokens and money', collect(rows[0].node).find((entry) => entry.className === 'tcs-tokens').text === '10.5k' &&
  collect(rows[0].node).find((entry) => entry.className === 'tcs-money').text === '≈¥0.00258');
assert('running row shows occupancy', collect(rows[0].node).find((entry) => entry.className === 'tcs-percent').text === '50.0%');
assert('unpriced row shows dash', collect(rows[1].node).find((entry) => entry.className === 'tcs-money').text === '—');
assert('idle row keeps its cost', collect(rows[2].node).find((entry) => entry.className === 'tcs-money').text === '≈¥0.00400');
assert('unpriced hint rendered', nodes.some((entry) => entry.className === 'tcs-hint' && entry.text === ZH.unpriced));
assert('row click switches session', (() => {
  rows[0].node.props.onClick();
  return opened[0] === 'a';
})());

// --- empty list
const empty = registration.component({ useSessions: () => ({ ids: [], byId: {} }), t, wide: true });
assert('no sessions renders nothing', empty === null || empty === undefined);

// --- cold sessions: background tasks whose projections are not in the control
//     baseline, so their tokenUsage must be fetched with refreshProjections().
const COLD = {
  ids: ['a', 'e', 'f'],
  byId: {
    a: { id: 'a', displayTitle: '主任务', running: true, updatedAt: 300, projectionValues: PROJECTIONS.a },
    e: { id: 'e', displayTitle: '后台任务', running: true, updatedAt: 200 },
    f: { id: 'f', displayTitle: '昨天的会话', running: false, updatedAt: 100 },
  },
  projectionsBySession: {},
};
const useCold = (selector) => (typeof selector === 'function' ? selector(COLD) : COLD);

globalThis.__FORCE_OPEN__ = false;
const coldBadge = registration.component({ useSessions: useCold, t, wide: true, warmProjections });
assertEqual('warms cold sessions, running first', warmed, ['e', 'f']);
assert('badge still renders while cold sessions load', collect(coldBadge).some((entry) => entry.className === 'tcs-lines'));

warmed.length = 0;
registration.component({ useSessions: useCold, t, wide: true, warmProjections });
assertEqual('does not re-request an already warmed session', warmed, []);

globalThis.__FORCE_OPEN__ = true;
const coldPanel = registration.component({ useSessions: useCold, t, wide: true, warmProjections });
const coldNodes = collect(coldPanel);
const coldRows = coldNodes.filter((entry) => entry.className === 'tcs-row');
const more = coldNodes.find((entry) => entry.className === 'tcs-more');
assertEqual('only running/used sessions get rows', coldRows.length, 2);
assert('pending loader reports the remaining sessions', more !== undefined && more.text === '载入其余会话 · 2');
warmed.length = 0;
more.node.props.onClick();
assertEqual('pending loader warms every remaining session', warmed, ['e', 'f']);

// --- missing hook never crashes
globalThis.__FORCE_OPEN__ = false;
const noHook = registration.component({ t, wide: true });
assert('missing useSessions degrades to nothing', noHook === null || noHook === undefined);

// --- injected session-list observable (root-scope path, no root hooks needed)
const fakeSource = { getSnapshot: () => SESSIONS, subscribe: () => () => {} };
const viaSource = registration.component({ t, wide: true, sessionsSource: fakeSource, openSession: () => {} });
const viaSourceValues = collect(viaSource).filter((entry) => entry.className === 'tcs-value').map((entry) => entry.text);
assertEqual('reads the session list from the injected source', viaSourceValues, ['≈¥0.00658 · 2 运行中', '≈¥0.00258 · 50.0%']);

console.log('\ntotals: 13,600 tokens across 4 sessions, 2 running, estimated ¥0.00658');
