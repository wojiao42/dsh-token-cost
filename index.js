/**
 * Host half of the token-cost bundle.
 *
 * 侧栏徽标与面板用的投影数据全在客户端，Host 半侧只多做一件事：**逐轮用量**。
 * 轮次数据不在任何投影里（`tokenUsage` 只有整会话总量），所以这里读该会话的日志事件，
 * 用官方 `@deepseek-ai/dsh-token-meter` 的 `deriveTurnTokenUsage` 逐轮折叠——和聊天里
 * 「本轮用量」完全同源，只是换成了按需读取 + HTTP 返回。
 *
 *   GET /token-cost/turns?sessionId=<id>[&limit=30][&refresh=1]
 *     → { sessionId, totalTurns, truncated, turns: [{ turn, startTime, endTime, steps, closed, usage }] }
 *       `usage` 为 null 表示该轮用量无法证明（活动未闭合或计数不安全），与官方折叠语义一致。
 *
 * 冷会话走 `ctx.sessionQuery.read()`（持久化日志读取），活跃会话走同一接口的 live 分支。
 */

/** 默认返回的轮数上限（只回最近几轮，避免一次读太长）。 */
const DEFAULT_LIMIT = 30;
/** 轮数上限的硬顶。 */
const MAX_LIMIT = 200;
/** 同一会话的折叠结果缓存时长：避免鼠标扫过时反复读日志。 */
const CACHE_TTL_MS = 15_000;

export const name = 'token-cost';

/**
 * 把一份按 seq 排列的会话事件切成逐轮的事件片：`turn/start` … `turn/end`。
 * @param {Array<{type: string, time?: number, data?: any}>} events 会话日志事件。
 * @returns {Array<{turn: number, startTime: number|null, endTime: number|null, steps: number, closed: boolean, events: object[]}>}
 */
export function turnsFromEvents(events) {
  const turns = [];
  let current = null;
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    if (event.type === 'turn/start') {
      current = {
        turn: typeof event.data?.turn === 'number' ? event.data.turn : turns.length + 1,
        startTime: typeof event.time === 'number' ? event.time : null,
        endTime: null,
        steps: 0,
        closed: false,
        events: [event],
      };
      turns.push(current);
      continue;
    }
    if (current === null) continue;
    current.events.push(event);
    if (event.type === 'step/start') current.steps += 1;
    if (event.type === 'turn/end') {
      current.endTime = typeof event.time === 'number' ? event.time : null;
      current.closed = true;
      current = null;
    }
  }
  return turns;
}

/**
 * 逐轮折叠用量与时间。
 * @param {object[]} events 会话日志事件。
 * @param {(events: object[]) => object|undefined} [fold] 折叠函数；默认由调用方注入官方实现。
 * @returns {Array<{turn: number, startTime: number|null, endTime: number|null, steps: number, closed: boolean, usage: object|null}>}
 */
export function foldTurns(events, fold) {
  return turnsFromEvents(events).map((turn) => ({
    turn: turn.turn,
    startTime: turn.startTime,
    endTime: turn.endTime,
    steps: turn.steps,
    closed: turn.closed,
    usage: typeof fold === 'function' ? fold(turn.events) ?? null : null,
  }));
}

/** 官方折叠函数：只在第一次请求时动态导入，所以本模块在没有该包的进程里也能加载（例如离线测试）。 */
let foldPromise;
function loadFold() {
  foldPromise ??= import('@deepseek-ai/dsh-token-meter/client')
    .then((module) => module.deriveTurnTokenUsage)
    .catch(() => undefined);
  return foldPromise;
}

function sendJson(response, status, body) {
  const text = `${JSON.stringify(body)}\n`;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(text);
}

/**
 * 注册逐轮用量路由。
 * @param ctx Host 插件上下文。
 * @param config 可选 `{ fold?: (events) => object|undefined }`，覆盖默认的官方折叠函数（离线测试用）。
 */
export function apply(ctx, config = {}) {
  /** sessionId → { at, payload }：短缓存，鼠标扫过面板时不重复读日志。 */
  const cache = new Map();

  async function turnsPayload(sessionId, limit, refresh) {
    const cached = cache.get(sessionId);
    if (refresh !== true && cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return cached.payload;
    const query = ctx.get('sessionQuery');
    if (query === undefined) throw new Error('sessionQuery unavailable');
    const lease = await query.read(sessionId, { projectionMode: 'none' });
    try {
      const fold = typeof config.fold === 'function' ? config.fold : await loadFold();
      const turns = foldTurns(lease.events ?? [], fold);
      const selected = turns.slice(Math.max(0, turns.length - limit));
      const payload = {
        sessionId,
        totalTurns: turns.length,
        truncated: selected.length < turns.length,
        folded: typeof fold === 'function',
        turns: selected,
      };
      cache.set(sessionId, { at: Date.now(), payload });
      return payload;
    } finally {
      try {
        lease?.[Symbol.dispose]?.();
      } catch {
        /* 释放失败不影响结果 */
      }
    }
  }

  ctx.inject(['webServer'], (host) => {
    host.effect(
      () =>
        host.webServer.register({
          kind: 'exact',
          path: '/token-cost/turns',
          handler: async (request, response) => {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
              response.writeHead(405, { allow: 'GET, HEAD' });
              response.end();
              return;
            }
            const url = new URL(request.url ?? '/', 'http://localhost');
            const sessionId = url.searchParams.get('sessionId') ?? '';
            if (sessionId === '') {
              sendJson(response, 400, { error: 'sessionId is required' });
              return;
            }
            const rawLimit = Number(url.searchParams.get('limit'));
            const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(MAX_LIMIT, Math.floor(rawLimit)) : DEFAULT_LIMIT;
            try {
              const payload = await turnsPayload(sessionId, limit, url.searchParams.get('refresh') === '1');
              if (request.method === 'HEAD') {
                response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                response.end();
                return;
              }
              sendJson(response, 200, payload);
            } catch (error) {
              sendJson(response, 404, { error: String(error?.message ?? error) });
            }
          },
        }),
      'token-cost: per-turn usage route',
    );
  });
}
