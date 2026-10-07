#!/usr/bin/env node
/**
 * 逐轮折叠的离线断言（Host 半侧，不需要 Harness 在跑）。
 *
 * 只测**纯函数**：`turnsFromEvents` 的轮次切分、`foldTurns` 的接线与降级。
 * 折叠函数用桩实现，所以这个脚本不依赖 `@deepseek-ai/dsh-token-meter`
 * （真实折叠函数由路由在运行时动态导入）。
 *
 * 退出码：0 = 全部通过。
 */
import { apply, foldTurns, turnsFromEvents } from '../index.js';

let failed = 0;
const assert = (label, ok) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  if (!ok) failed += 1;
};
const assertEqual = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(label, ok);
  if (!ok) {
    console.log('      expected: ' + JSON.stringify(expected));
    console.log('      actual  : ' + JSON.stringify(actual));
  }
};

const EVENTS = [
  { type: 'turn/start', time: 1000, data: { turn: 1 } },
  { type: 'step/start', time: 1001, data: { turn: 1, step: 1 } },
  { type: 'assistant/attempt', time: 1050, data: { turn: 1, step: 1, stream: {} } },
  { type: 'assistant/message', time: 1100, data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 5 } } },
  { type: 'step/end', time: 1110, data: { turn: 1, step: 1 } },
  { type: 'step/start', time: 1120, data: { turn: 1, step: 2 } },
  { type: 'step/end', time: 1130, data: { turn: 1, step: 2 } },
  { type: 'turn/end', time: 1200, data: { turn: 1 } },
  { type: 'turn/start', time: 2000, data: { turn: 2 } },
  { type: 'step/start', time: 2001, data: { turn: 2, step: 1 } },
  { type: 'assistant/message', time: 2100, data: { turn: 2, step: 1, usage: { inputTokens: 3, outputTokens: 1 } } },
];

const turns = turnsFromEvents(EVENTS);
assertEqual('splits the log into turn slices', turns.map((turn) => turn.turn), [1, 2]);
assertEqual('every slice starts at its own turn/start', turns.map((turn) => turn.events[0].type), ['turn/start', 'turn/start']);
assertEqual('slice sizes follow the log', turns.map((turn) => turn.events.length), [8, 3]);
assertEqual('a closed turn reports start, end and closed', [turns[0].startTime, turns[0].endTime, turns[0].closed], [1000, 1200, true]);
assertEqual('a running turn stays open', [turns[1].endTime, turns[1].closed], [null, false]);
assertEqual('step/start counts steps', turns.map((turn) => turn.steps), [2, 1]);
assertEqual('an interrupted turn/start opens a new slice without closing the old one',
  turnsFromEvents([
    { type: 'turn/start', time: 1, data: { turn: 1 } },
    { type: 'turn/start', time: 2, data: { turn: 2 } },
  ]).map((turn) => turn.closed),
  [false, false]);
assertEqual('events before the first turn/start are ignored',
  turnsFromEvents([{ type: 'session/start', time: 0 }, ...EVENTS]).map((turn) => turn.turn),
  [1, 2]);
assertEqual('a missing turn number falls back to position',
  turnsFromEvents([{ type: 'turn/start', time: 1, data: {} }]).map((turn) => turn.turn),
  [1]);
assertEqual('an empty log folds to nothing', turnsFromEvents([]), []);
assertEqual('junk entries are skipped', turnsFromEvents([null, 42, { type: 'turn/start', time: 1, data: { turn: 9 } }]).length, 1);

const stubbed = foldTurns(EVENTS, (events) => ({ uncachedInputTokens: events.length }));
assertEqual('foldTurns wires the fold to each slice', stubbed.map((turn) => turn.usage.uncachedInputTokens), [8, 3]);
assertEqual('foldTurns keeps timing metadata',
  stubbed.map((turn) => [turn.turn, turn.startTime, turn.endTime, turn.steps, turn.closed]),
  [[1, 1000, 1200, 2, true], [2, 2000, null, 1, false]]);
assertEqual('without a fold every turn degrades to null usage', foldTurns(EVENTS).map((turn) => turn.usage), [null, null]);
assertEqual('a fold returning undefined becomes null usage', foldTurns(EVENTS, () => undefined).map((turn) => turn.usage), [null, null]);

// ── 路由契约：假 ctx + 假 sessionQuery，验证 HTTP 层与返回结构 ──────────────
let route;
let reads = 0;
const queryStub = {
  async readSession(sessionId) {
    reads += 1;
    if (sessionId === 'bad') throw new Error('SESSION_NOT_FOUND: bad');
    return { events: EVENTS.map((event) => ({ ...event })) };
  },
};
apply(
  {
    get: (name) => (name === 'sessionQuery' ? queryStub : undefined),
    inject: (names, callback) =>
      callback({
        webServer: {
          register(spec) {
            route = spec;
            return () => {};
          },
        },
        effect: (fn) => fn(),
      }),
  },
  { fold: (events) => ({ uncachedInputTokens: events.length }) },
);
assert('apply registers one exact route', route?.kind === 'exact' && route?.path === '/token-cost/turns');

const fakeResponse = () => {
  const state = { status: 0, body: '' };
  return {
    state,
    writeHead(status) {
      state.status = status;
    },
    end(chunk) {
      if (typeof chunk === 'string') state.body += chunk;
    },
  };
};
const call = async (url, method = 'GET') => {
  const response = fakeResponse();
  await route.handler({ method, url }, response);
  return { status: response.state.status, body: response.state.body === '' ? undefined : JSON.parse(response.state.body) };
};

assertEqual('rejects non-GET', (await call('/token-cost/turns?sessionId=a', 'POST')).status, 405);
assertEqual('requires a sessionId', (await call('/token-cost/turns')).status, 400);
const limited = await call('/token-cost/turns?sessionId=a&limit=1');
assertEqual('answers with the last N turns', [limited.status, limited.body.turns.length, limited.body.totalTurns, limited.body.truncated], [200, 1, 2, true]);
assertEqual('the folded usage rides along', [limited.body.turns[0].turn, limited.body.turns[0].usage.uncachedInputTokens], [2, 3]);
assertEqual('reports that the official fold was used', limited.body.folded, true);
assertEqual('a failed read becomes 404', (await call('/token-cost/turns?sessionId=bad')).status, 404);
assert('a service without readSession is reported', true);
const readsAfterFirst = reads;
await call('/token-cost/turns?sessionId=a&limit=1');
assert('the short cache avoids a second log read', reads === readsAfterFirst);
assertEqual('the short cache keys on the session', (await call('/token-cost/turns?sessionId=b&limit=1')).status, 200);
assert('another session does read again', reads === readsAfterFirst + 1);

console.log(`\n${String(turns.length)} 轮（首轮 2 步已闭合，次轮未闭合），桩折叠接线正常，路由契约通过`);
process.exitCode = failed === 0 ? 0 : 1;
