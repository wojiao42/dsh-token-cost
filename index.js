/**
 * Host half of the token-cost bundle.
 *
 * 侧栏徽标与面板用的投影数据全在客户端，Host 半侧只多做一件事：**逐轮用量**。
 * 轮次数据不在任何投影里（`tokenUsage` 只有整会话总量），所以这里读该会话的日志事件逐轮折叠。
 * 折叠是自己实现的：按轮累加 provider 在 `assistant/message` 上报的 `usage`；
 * 出现 `llm/retry*` 或该轮未闭合时把该轮标成近似（`exact: false`），不猜不补。
 *
 *   GET /token-cost/turns?sessionId=<id>[&limit=30][&refresh=1]
 *     → { sessionId, totalTurns, truncated, turns: [{ turn, startTime, endTime, steps, closed, usage }] }
 *       `usage` 为 null 表示该轮用量无法证明（活动未闭合或计数不安全），与官方折叠语义一致。
 *
 * 走 `ctx.sessionQuery.readSession()`：活跃会话读 live 日志，冷会话读持久化日志，返回已验证的克隆事件。
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
 * @param {(events: object[]) => object|undefined} [fold] 折叠函数；默认 `foldTurnUsage`（可注入桩做离线测试）。
 * @returns {Array<{turn: number, startTime: number|null, endTime: number|null, steps: number, closed: boolean, usage: object|null}>}
 */
export function foldTurns(events, fold) {
  const foldUsage = typeof fold === 'function' ? fold : foldTurnUsage;
  return turnsFromEvents(events).map((turn) => {
    const usage = foldUsage(turn.events) ?? null;
    return {
      turn: turn.turn,
      startTime: turn.startTime,
      endTime: turn.endTime,
      steps: turn.steps,
      closed: turn.closed,
      usage,
      // 未闭合（还在跑）或折叠器自己标了近似，都算近似
      exact: usage !== null && usage.exact !== false && turn.closed,
    };
  });
}

/**
 * 一轮的用量：把该轮 `assistant/message` 上报的 provider 用量相加。
 * 字段名与官方一致（`inputTokens` = 未缓存输入），所以客户端的单价表可以直接套用。
 * @param {object[]} events 该轮的事件片（turn/start … turn/end）。
 * @returns {{uncachedInputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, outputTokens: number, samples: number, exact: boolean}|null}
 */
export function foldTurnUsage(events) {
  const total = { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, samples: 0, exact: true };
  for (const event of events) {
    if (event?.type === 'llm/retry' || event?.type === 'llm/retry-started') total.exact = false;
    if (event?.type !== 'assistant/message') continue;
    const usage = event.data?.usage;
    if (usage === null || typeof usage !== 'object') continue;
    if (typeof usage.inputTokens !== 'number' && typeof usage.outputTokens !== 'number') continue;
    total.uncachedInputTokens += typeof usage.inputTokens === 'number' ? usage.inputTokens : 0;
    total.cacheReadTokens += typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0;
    total.cacheWriteTokens += typeof usage.cacheWriteTokens === 'number' ? usage.cacheWriteTokens : 0;
    total.outputTokens += typeof usage.outputTokens === 'number' ? usage.outputTokens : 0;
    total.samples += 1;
  }
  if (total.samples === 0) return null;
  return total;
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
    if (typeof query.readSession !== 'function') throw new Error('sessionQuery.readSession unavailable');
    // readSession: 读并校验整份会话日志（活跃会话走 live，冷会话走持久化），返回克隆过的事件
    const { events } = await query.readSession(sessionId);
    const turns = foldTurns(events ?? [], config.fold);
    const selected = turns.slice(Math.max(0, turns.length - limit));
    const payload = {
      sessionId,
      totalTurns: turns.length,
      truncated: selected.length < turns.length,
      // 兼容字段：折叠器是本插件自带的，始终可用
      folded: true,
      turns: selected,
    };
    cache.set(sessionId, { at: Date.now(), payload });
    return payload;
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
