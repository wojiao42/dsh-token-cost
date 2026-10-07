window.__ModuleLoader__.load({
  id: 'dsh-token-cost',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;

    /* ============================================================================
     * 单价表：人民币元 / 每百万 token。
     * 官方价格变动时改这里，然后刷新页面即可生效（无需重启 Harness）。
     * 表里没有的模型只显示 token 数与上下文占用，不显示费用。
     * ==========================================================================*/
    const PRICES = {
      'deepseek-flash': { cacheHit: 0.02, cacheMiss: 0.4, output: 4 },
      'deepseek-v4-pro': { cacheHit: 0.02, cacheMiss: 0.4, output: 4 },
    };

    const EMPTY = {
      uncachedInputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    const asNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

    const fmtInt = (value) => Math.round(asNumber(value)).toLocaleString('en-US');

    const fmtCompact = (value) => {
      const n = asNumber(value);
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return String(Math.round(n));
    };

    const fmtMoney = (value) => {
      if (!Number.isFinite(value)) return null;
      if (value <= 0) return '¥0';
      if (value >= 1) return '¥' + value.toFixed(2);
      if (value >= 0.01) return '¥' + value.toFixed(4);
      return '¥' + value.toFixed(5);
    };

    const fmtPercent = (value) => (Math.round(asNumber(value) * 10) / 10).toFixed(1) + '%';

    const modelOf = (selection) => {
      if (selection === null || typeof selection !== 'object') return null;
      const candidate = selection.next ?? selection.lastUsed;
      const model = candidate === null || typeof candidate !== 'object' ? null : candidate.model;
      return typeof model === 'string' && model.length > 0 ? model : null;
    };

    const costOf = (usage, price) => {
      if (price === null) return null;
      const miss = asNumber(usage.uncachedInputTokens);
      const cache = asNumber(usage.cacheReadTokens) + asNumber(usage.cacheWriteTokens);
      const output = asNumber(usage.outputTokens);
      const inputMiss = (miss / 1e6) * price.cacheMiss;
      const cacheCost = (cache / 1e6) * price.cacheHit;
      const outputCost = (output / 1e6) * price.output;
      return { inputMiss, cache: cacheCost, output: outputCost, total: inputMiss + cacheCost + outputCost };
    };

    /* 侧栏汇总：订阅会话列表快照（每个会话都带投影缓存），实时折叠出全部会话与当前任务的用量。 */
    const ReactDOM = require('react-dom');

    const NS_SUMMARY = 'tokenCostSummary';

    const SUMMARY_ZH = {
      label: '全部会话的 token 用量与估算费用',
      title: '全局用量汇总',
      sessions: '会话',
      running: '运行中',
      tokens: 'token',
      total: '全部',
      current: '当前',
      asOf: '截至',
      ago: '最近',
      turnsTitle: '逐轮用量',
      turn: '第',
      jumpTurn: '跳到第 {turn} 轮',
      turnsUnit: '轮',
      openTurn: '进行中',
      loading: '读取中…',
      loadFailed: '读取失败',
      noTurns: '还没有任何轮次',
      truncatedTurns: '仅显示最近',
      foldUnavailable: '无法折叠逐轮用量（缺少官方折叠函数）',
      needRestart: '逐轮数据需要重启一次 Harness（Host 半侧刚更新过）',
      approx: '近似',
      untitledTurn: '（这一轮没有输入记录）',
      now: '刚刚',
      turns: '轮',
      steps: '步',
      ttft: '首token',
      llm: '模型',
      tool: '工具',
      cacheRate: '缓存命中率',
      hint: '点一行切换到该会话；费用按内置单价估算。',
      unpriced: '部分会话的模型没有内置单价，其 token 未计入费用。',
      empty: '暂无用量',
      loadRest: '载入其余会话',
    };

    const SUMMARY_EN = {
      label: 'Token usage and estimated cost across all sessions',
      title: 'Global usage',
      sessions: 'sessions',
      running: 'running',
      tokens: 'tokens',
      total: 'All',
      current: 'Now',
      asOf: 'as of',
      ago: 'last',
      turnsTitle: 'Per-turn usage',
      turn: 'turn',
      jumpTurn: 'Jump to turn {turn}',
      turnsUnit: 'turns',
      openTurn: 'open',
      loading: 'loading…',
      loadFailed: 'load failed',
      noTurns: 'no turns yet',
      truncatedTurns: 'last',
      foldUnavailable: 'per-turn fold unavailable',
      needRestart: 'per-turn data needs one Harness restart (host half changed)',
      approx: 'approx',
      untitledTurn: '(no prompt recorded)',
      now: 'just now',
      turns: ' turns',
      steps: ' steps',
      ttft: 'ttft',
      llm: 'llm',
      tool: 'tools',
      cacheRate: 'Cache hit',
      hint: 'Click a row to switch to that session; cost is estimated.',
      unpriced: 'Some sessions use a model without a built-in price.',
      empty: 'No usage yet',
      loadRest: 'Load the rest',
    };

    const SUMMARY_CSS = [
      '.tcs-root{position:relative;display:inline-flex;align-items:center;min-width:0}',
      '.tcs-pill{box-sizing:border-box;max-width:100%;display:inline-flex;align-items:center;gap:5px;cursor:pointer;',
      'padding:2px 6px;border:none;border-radius:var(--dsw-radius-sm,8px);background:0 0;font:inherit;',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:1.25;',
      'color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.tcs-pill:hover,.tcs-pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.tcs-pill svg{flex:none;width:14px;height:14px}',
      '.tcs-lines{display:flex;flex-direction:column;gap:0;min-width:0;text-align:left}',
      '.tcs-line .tcs-dot{flex:none;width:6px;height:6px;align-self:center}',
      '.tcs-line{display:flex;align-items:baseline;gap:6px;min-width:0;white-space:nowrap}',
      '.tcs-key{flex:none;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px)}',
      '.tcs-value{min-width:0;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}',
      '.tcs-row[data-current="true"] .tcs-title{font-weight:600}',
      '.tcs-label{min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.tcs-panel{position:fixed;z-index:80;box-sizing:border-box;width:364px;max-height:min(70vh,520px);overflow:auto;',
      'padding:10px 12px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,16px);',
      'background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base));',
      'box-shadow:var(--dsw-elevation-panel,0 6px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary);',
      'font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums}',
      '.tcs-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-bottom:4px}',
      '.tcs-headTitle{color:var(--dsw-alias-label-secondary)}',
      '.tcs-headValue{font-weight:600}',
      '.tcs-meta{display:flex;flex-wrap:wrap;gap:4px 12px;padding-bottom:6px;border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}',
      '.tcs-list{display:flex;flex-direction:column;gap:1px;padding:4px 0}',
      '.tcs-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto auto 44px;align-items:center;gap:8px;width:100%;',
      'padding:4px;border:none;border-radius:var(--dsw-radius-sm,8px);background:0 0;font:inherit;color:inherit;text-align:left;cursor:pointer}',
      '.tcs-main{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.tcs-detail{min-width:0;white-space:normal;line-height:1.35;',
      'color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px)}',
      '.tcs-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.tcs-dot{width:8px;height:8px;border-radius:999px;background:var(--dsw-alias-border-l2)}',
      '.tcs-dot[data-running="true"]{background:var(--dsw-alias-state-success-primary,var(--dsw-static-green-500,#22c55e))}',
      '.tcs-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}',
      '.tcs-tokens{text-align:right;color:var(--dsw-alias-label-tertiary)}',
      '.tcs-money{text-align:right;color:var(--dsw-alias-label-secondary)}',
      '.tcs-percent{text-align:right;color:var(--dsw-alias-label-tertiary)}',
      '.tcs-empty{padding:8px 4px;color:var(--dsw-alias-label-tertiary)}',
      '.tcs-turns{position:fixed;z-index:81;box-sizing:border-box;width:328px;padding:10px 12px 8px;overflow:auto;',
      'border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,16px);',
      'background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base));',
      'box-shadow:var(--dsw-elevation-panel,0 6px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary);',
      'font-size:var(--dsh-content-font-size-secondary,13px)}',
      '.tcs-turnsHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-bottom:6px;',
      'border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.tcs-turnsTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}',
      '.tcs-turnsMeta{flex:none;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px)}',
      '.tcs-turnsList{display:flex;flex-direction:column;gap:1px;padding-top:4px}',
      '.tcs-turn{display:flex;flex-direction:column;gap:2px;padding:4px 0;',
      '.tcs-turnHead{display:flex;align-items:baseline;gap:6px;min-width:0}',
      '.tcs-turnMeta{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}',
      '.tcs-turnMeta>span{white-space:nowrap}',
      'width:100%;text-align:left;font:inherit;color:inherit;background:0 0;border:none;cursor:pointer;',
      'border-bottom:.5px solid color-mix(in srgb,var(--dsw-alias-border-l2) 45%,transparent)}',
      '.tcs-turn:hover,.tcs-turn:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}',
      // 焦点环自带一套：主题里管焦点环的规则（`:focus-visible{outline:none}`、pointer 模态下
      // `outline-color:#0000`）都是**文档级**的，照不到隔离的侧栏插槽子树——徽标就在那棵树里，
      // 于是点过徽标后浏览器默认的黑色焦点环会留在上面，看着就像凭空多了一圈黑框。
      // 鼠标点击不显示环；键盘聚焦给一个显式的蓝色环（保住可达性）。
      '.tcs-pill:focus,.tcs-row:focus,.tcs-turn:focus,.tcs-more:focus{outline:none}',
      '.tcs-pill:focus-visible,.tcs-row:focus-visible,.tcs-turn:focus-visible,.tcs-more:focus-visible{',
      'outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3964fe));outline-offset:1px}',
      '.tcs-turn:last-child{border-bottom:none}',
      '.tcs-turnTitle{min-width:0;white-space:normal;overflow-wrap:anywhere}',
      '.tcs-turnNo{white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
      '.tcs-turnTokens{color:var(--dsw-alias-label-tertiary)}',
      '.tcs-turnMoney{font-variant-numeric:tabular-nums}',
      '.tcs-turnWhen{white-space:nowrap;',
      'color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px)}',
      '.tcs-turnsNote{padding-top:6px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px)}',
      '.tcs-more{margin-top:6px;padding:3px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;',
      'background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}',
      '.tcs-more:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.tcs-hint{margin-top:6px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px)}',
    ].join('');

    const SUMMARY_PANEL_ID = 'dsh-token-cost-summary-panel';
    /** 逐轮预览浮层的 id：它也是 portal，必须和面板一样被排除在「点外面就关闭」之外。 */
    const TURNS_PANEL_ID = 'dsh-token-cost-turns-panel';
    /** Automatic projection warm-up cap per list update; running sessions always qualify first. */
    const WARM_LIMIT = 48;
    /** Session ids already asked for a projection baseline during this page life. */
    const warmedSessionIds = new Set();

    /** Token buckets, model-priced cost and context occupancy of one session's projections. */
    const pad2 = (value) => String(value).padStart(2, '0');
    /** 本地时钟 HH:MM。 */
    const fmtClock = (ms) => {
      const date = new Date(asNumber(ms));
      return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    };
    /** 相对时间：刚刚 / 3m / 2h / 4d。 */
    const fmtAgo = (ms, now, justNow) => {
      const delta = asNumber(now) - asNumber(ms);
      if (!(delta >= 60_000)) return justNow;
      if (delta < 3_600_000) return Math.floor(delta / 60_000) + 'm';
      if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + 'h';
      return Math.floor(delta / 86_400_000) + 'd';
    };
    /** 时长：42s / 12m / 1h05m。 */
    const fmtDuration = (ms) => {
      const seconds = Math.floor(Math.max(0, asNumber(ms)) / 1000);
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + 'm';
      return Math.floor(minutes / 60) + 'h' + pad2(minutes % 60) + 'm';
    };
    /** 毫秒：820ms / 1.2s。 */
    const fmtMs = (ms) => {
      const value = Math.max(0, asNumber(ms));
      return value < 1000 ? Math.round(value) + 'ms' : (value / 1000).toFixed(1) + 's';
    };
    /** 解码速度（token/s）。 */
    const tokensPerSecond = (tokens, ms) => (asNumber(ms) > 0 ? asNumber(tokens) / (asNumber(ms) / 1000) : null);

    /** sessionId → 首次观察到「运行中」的本地时刻（近似运行起点，供逐秒刷新显示时长）。 */
    const runningSince = new Map();
    function trackRunning(rows, now) {
      const ids = new Set();
      for (const row of rows) {
        ids.add(row.id);
        if (row.running) {
          if (!runningSince.has(row.id)) runningSince.set(row.id, now);
        } else {
          runningSince.delete(row.id);
        }
      }
      for (const id of [...runningSince.keys()]) if (!ids.has(id)) runningSince.delete(id);
    }

    function sessionUsageOf(values) {
      const usage = values?.tokenUsage;
      const miss = asNumber(usage?.uncachedInputTokens);
      const cache = asNumber(usage?.cacheReadTokens) + asNumber(usage?.cacheWriteTokens);
      const output = asNumber(usage?.outputTokens);
      const model = modelOf(values?.modelSelection);
      const price = model !== null && Object.hasOwn(PRICES, model) ? PRICES[model] : null;
      const pressure = values?.contextPressure ?? {};
      const contextWindow = asNumber(pressure.contextWindow);
      const used = asNumber(pressure.projectedTokens ?? pressure.pressureTokens);
      return {
        miss,
        cache,
        output,
        billed: miss + cache + output,
        model,
        cost: costOf(usage ?? EMPTY, price),
        percent: contextWindow > 0 && used > 0 ? (used / contextWindow) * 100 : null,
        hasUsage: values?.tokenUsage !== undefined,
        stats: (() => {
          const stats = values?.sessionStats;
          if (stats === undefined) return null;
          return {
            turns: asNumber(stats.turns),
            steps: asNumber(stats.steps),
            llmMs: asNumber(stats.llmMs),
            toolMs: asNumber(stats.toolMs),
            ttftMs: asNumber(stats.ttftMs),
            ttftSteps: asNumber(stats.ttftSteps),
            decodeMs: asNumber(stats.decodeMs),
            decodeTokens: asNumber(stats.decodeTokens),
          };
        })(),
      };
    }

    /**
     * Fold every known session's cached projections into one summary.
     * Running sessions sort first, then by estimated cost.
     */
    function aggregateSessions(list) {
      const rows = [];
      const seen = new Set();
      const add = (id, row, values) => {
        seen.add(id);
        rows.push({
          id,
          title: row?.displayTitle ?? row?.title ?? id,
          running: row?.running === true,
          origin: row?.origin,
          updatedAt: asNumber(row?.updatedAt),
          ...sessionUsageOf(values),
        });
      };
      for (const id of list?.ids ?? []) {
        const row = list?.byId?.[id];
        add(id, row, row?.projectionValues ?? list?.projectionsBySession?.[id]?.values);
      }
      for (const [id, block] of Object.entries(list?.projectionsBySession ?? {})) {
        if (seen.has(id)) continue;
        add(id, list?.byId?.[id], block?.values);
      }
      rows.sort(
        (left, right) =>
          Number(right.running) - Number(left.running) ||
          (right.cost?.total ?? 0) - (left.cost?.total ?? 0) ||
          right.billed - left.billed,
      );
      const totals = rows.reduce(
        (acc, row) => {
          acc.billed += row.billed;
          acc.miss += row.miss;
          acc.cache += row.cache;
          acc.output += row.output;
          if (row.cost === null) {
            if (row.billed > 0) acc.unpriced += 1;
          } else {
            acc.cost += row.cost.total;
            acc.priced += row.billed;
          }
          if (row.running) {
            acc.running += 1;
            if (row.percent !== null) acc.maxPercent = Math.max(acc.maxPercent, row.percent);
          }
          if (row.billed > 0) acc.active += 1;
          if (!row.hasUsage) acc.pending += 1;
          if (row.hasUsage) acc.asOf = Math.max(acc.asOf, row.updatedAt);
          if (row.stats !== null) {
            acc.decodeMs += row.stats.decodeMs;
            acc.decodeTokens += row.stats.decodeTokens;
            acc.ttftMs += row.stats.ttftMs;
            acc.ttftSteps += row.stats.ttftSteps;
            acc.llmMs += row.stats.llmMs;
            acc.toolMs += row.stats.toolMs;
          }
          return acc;
        },
        { billed: 0, miss: 0, cache: 0, output: 0, cost: 0, priced: 0, unpriced: 0, running: 0, active: 0, maxPercent: 0, pending: 0, asOf: 0, decodeMs: 0, decodeTokens: 0, ttftMs: 0, ttftSteps: 0, llmMs: 0, toolMs: 0 },
      );
      return {
        rows,
        totals: {
          ...totals,
          sessions: rows.length,
          cacheRate: totals.miss + totals.cache > 0 ? (totals.cache / (totals.miss + totals.cache)) * 100 : null,
          decodeRate: tokensPerSecond(totals.decodeTokens, totals.decodeMs),
          avgTtft: totals.ttftSteps > 0 ? totals.ttftMs / totals.ttftSteps : null,
        },
      };
    }

    const summaryIcon = () =>
      h(
        'svg',
        // 内在 width/height 不能省：只有 viewBox 的 SVG 在 CSS 尚未生效时会按替换元素
        // 默认尺寸撑开，把侧栏徽标顶大（dsh-space-optimizer 上实测过这个毛病）。
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: false },
        h('path', { d: 'M2.6 13.4V9.3h2.3v4.1zm4.4 0V6.1h2.3v7.3zm4.4 0V2.6h2.3v10.8z', fill: 'currentColor' }),
      );

    /** Session currently open in the main view — the task the user is looking at. */
    function currentSessionIdOf(list) {
      for (const id of list?.ids ?? []) {
        if (asNumber(list?.byId?.[id]?.retainedBy?.mainView) > 0) return id;
      }
      return undefined;
    }

    /** 一行的时间明细：运行时长或最近活动、轮/步、首 token、模型耗时、工具耗时、解码速度。 */
    function rowDetail(row, tr, now) {
      const stats = row.stats;
      const since = runningSince.get(row.id);
      const activity = row.running
        ? tr('running') + (since === undefined ? '' : ' ' + fmtDuration(now - since))
        : tr('ago') + ' ' + fmtAgo(row.updatedAt, now, tr('now'));
      const rate = stats === null ? null : tokensPerSecond(stats.decodeTokens, stats.decodeMs);
      return [
        activity,
        stats === null || stats.steps === 0 ? null : stats.turns + tr('turns') + ' ' + stats.steps + tr('steps'),
        stats === null || stats.ttftSteps === 0 ? null : tr('ttft') + ' ' + fmtMs(stats.ttftMs / stats.ttftSteps),
        stats === null || stats.llmMs === 0 ? null : tr('llm') + ' ' + fmtDuration(stats.llmMs),
        stats === null || stats.toolMs === 0 ? null : tr('tool') + ' ' + fmtDuration(stats.toolMs),
        rate === null ? null : rate.toFixed(1) + ' tok/s',
      ]
        .filter((part) => part !== null)
        .join(' · ');
    }

    /** 逐轮预览缓存：sessionId → { at, data }。 */
    const turnCache = new Map();
    const TURN_CACHE_TTL_MS = 15_000;
    /** 悬停到某行后延迟多久取数，避免指针扫过时连发请求。 */
    const PREVIEW_DELAY_MS = 140;
    /** 面板与逐轮预览的宽度（预览贴在面板旁边）。 */
    const PANEL_WIDTH = 364;
    const TURNS_WIDTH = 328;

    /** 一轮用量的展示数据（纯函数，便于离线断言）。 */
    function turnView(turn, price, openLabel, approxLabel, untitledLabel) {
      const usage = turn.usage;
      const cost = usage === null || usage === undefined ? null : costOf(usage, price);
      const billed =
        usage === null || usage === undefined
          ? null
          : asNumber(usage.uncachedInputTokens) +
            asNumber(usage.cacheReadTokens) +
            asNumber(usage.cacheWriteTokens) +
            asNumber(usage.outputTokens);
      const duration =
        typeof turn.startTime === 'number' && typeof turn.endTime === 'number' && turn.endTime >= turn.startTime
          ? fmtDuration(turn.endTime - turn.startTime)
          : null;
      const when = typeof turn.startTime === 'number' ? fmtClock(turn.startTime) : null;
      const steps = asNumber(turn.steps);
      const tools = asNumber(turn.toolCalls);
      return {
        label: typeof turn.summary === 'string' && turn.summary !== '' ? turn.summary : untitledLabel,
        tokens: billed === null ? '—' : fmtCompact(billed),
        amount: cost === null ? '—' : cost.total > 0 ? '≈' + fmtMoney(cost.total) : '¥0',
        when: [
          duration,
          when,
          steps > 0 ? String(steps) + '步' : null,
          tools > 0 ? String(tools) + '工具' : null,
          turn.closed === false ? openLabel : null,
          turn.exact === false ? approxLabel : null,
        ]
          .filter((part) => part !== null)
          .join(' · '),
      };
    }

    /**
     * 聊天视图轮次轨道刻度的 aria-label（中英都认）。
     * 未加载的历史刻度文案不同（会先分页再落位），两条都要匹配。
     */
    const TURN_MARK_LABELS = [
      /^跳转到第\s*(\d+)\s*轮$/,
      /^加载并跳转到第\s*(\d+)\s*轮$/,
      /^Jump to turn\s+(\d+)$/i,
      /^Load and jump to turn\s+(\d+)$/i,
    ];
    /** 轮次导航轨道的容器文案（中英都认）。 */
    const TURN_RAIL_LABELS = ['轮次导航', 'Turn navigation'];
    /** 轨道刻度间距（与平台 TurnNavigator 的 TURN_SPACING_PX 一致），用于滚动落位。 */
    const TURN_SPACING_PX = 10;
    /** 刻度轮询节奏与上限（切换会话/加载历史都要时间）。 */
    const JUMP_POLL_MS = 120;
    const JUMP_POLL_TRIES = 60;

    /** 刻度按钮上的轮号，识别不出返回 null。 */
    function turnNumberOf(node) {
      const label = String(node?.getAttribute?.('aria-label') ?? '').trim();
      for (const pattern of TURN_MARK_LABELS) {
        const match = pattern.exec(label);
        if (match !== null) return { turn: Number(match[1]), unloaded: /加载|Load/i.test(label) };
      }
      return null;
    }

    /** 轨道容器（只认可见的那个：切换会话时旧轨道可能还挂在 DOM 上但已不可见）。 */
    function turnRail() {
      if (typeof document === 'undefined') return null;
      for (const label of TURN_RAIL_LABELS) {
        for (const node of document.querySelectorAll('[aria-label="' + label + '"]')) {
          const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
          if (rect === null || rect.width > 0 || rect.height > 0) return node;
        }
      }
      return null;
    }

    /** 轨道里第 ordinal 个刻度（data-index 是平台自己给的序号）。 */
    function markByIndex(ordinal) {
      const rail = turnRail();
      if (rail === null) return null;
      for (const node of rail.querySelectorAll('button[aria-label][data-index]')) {
        if (Number(node.getAttribute('data-index')) === ordinal) return node;
      }
      return null;
    }

    /** 把轨道滚到第 ordinal 个刻度附近（刻度固定 10px 间距，平台自己的 scrollToIndex 也这么做）。 */
    function scrollRailToIndex(ordinal) {
      const rail = turnRail();
      if (rail === null) return;
      for (const node of rail.querySelectorAll('*')) {
        if (node.scrollHeight > node.clientHeight + 4) {
          node.scrollTop = Math.max(0, ordinal * TURN_SPACING_PX - node.clientHeight / 2);
          return;
        }
      }
    }

    /** 第 turn 轮的候选刻度：可见轨道优先，loaded 文案优先。 */
    function findTurnMarks(turn) {
      if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return [];
      const scope = turnRail() ?? document;
      const hits = [];
      for (const node of scope.querySelectorAll('button[aria-label]')) {
        const info = turnNumberOf(node);
        if (info === null || info.turn !== turn) continue;
        const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
        if (rect !== null && rect.width === 0 && rect.height === 0) continue;
        hits.push({ node, unloaded: info.unloaded });
      }
      hits.sort((left, right) => Number(left.unloaded) - Number(right.unloaded));
      return hits.map((hit) => hit.node);
    }


    /**
     * 把主视图落到某一轮。
     *
     * 平台没有公开的「跳转到第 N 轮」命令：`uiWorkspace.openSession(id)` 只切会话，
     * 真正的分页＋落位逻辑留在聊天视图的轮次轨道组件内部（`pendingJumpRef`）。
     * 所以这里复用轨道自己那一颗刻度按钮——点它等于用户手点轨道，未加载的历史
     * 会由轨道自己 loadThrough 之后再落位。刻度还没渲染出来就轮询等一会儿；
     * 一直找不到（比如会话只有一轮、或平台改了文案）就安静放弃，不报错。
     */
    /**
     * 点一次目标刻度就结束——像人自己点轨道一样，不做验证、不做二次校正。
     * 之前加过"等落点稳定 + 按偏差校正"，但那会在平滑滚动期间多点、把落点带偏，
     * 已回退：这里只负责把手点到正确的刻度上。
     */
    function jumpToTurn(turn, options = {}) {
      const ordinal = Number.isInteger(options.ordinal) ? options.ordinal : null;
      /** 先按序号点（不受标签编号影响）；序号处标签轮号对不上再退回按标签点。 */
      const clickOnce = () => {
        if (ordinal !== null) {
          // 序号是权威：两边都按轮次升序，序号一致即同一轮（标签编号可能 0 基/1 基不同）
          const byIndex = markByIndex(ordinal);
          if (byIndex !== null) {
            if (typeof byIndex.click === 'function') byIndex.click();
            return true;
          }
          scrollRailToIndex(ordinal);
        }
        const marks = findTurnMarks(turn);
        if (marks.length === 0) return false;
        if (typeof marks[0].click === 'function') marks[0].click();
        return true;
      };
      const attempt = (left) => {
        if (clickOnce()) return;
        if (left <= 0) return;
        setTimeout(() => attempt(left - 1), JUMP_POLL_MS);
      };
      // 立即尝试一次：刻度还没渲染出来就按 JUMP_POLL_MS 轮询（不额外等固定时间——那会把
      // "切会话后才出现的刻度"和"上一个会话残留的刻度"一起赌进去）。
      attempt(JUMP_POLL_TRIES);
    }

    /**
     * 一行逐轮用量：轮号 / token / 费用 / 用时与时刻。
     * 整行可点：切到该会话并把主视图落到这一轮（见 {@link jumpToTurn}）。
     *
     * 用 `div` + `role="button"`，不用真 `<button>`：真实界面里 `<button>` 会吃到
     * UA／外壳的按钮样式，凭空多出一圈黑框（离线出图不含外壳 CSS，所以看不出来）。
     * 外观与改之前一致，可达性用 role/tabIndex + Enter/Space 顶上。
     */
    function turnRow(turn, tr, price, onJump) {
      const view = turnView(turn, price, tr('openTurn'), tr('approx'), tr('untitledTurn'));
      const clickable = onJump !== undefined;
      return h(
        'div',
        {
          className: 'tcs-turn',
          key: String(turn.turn),
          role: clickable ? 'button' : undefined,
          tabIndex: clickable ? 0 : undefined,
          title: clickable ? tr('jumpTurn', { turn: turn.turn }) : view.label,
          onClick: clickable ? () => onJump(turn.turn, turn.ordinal) : undefined,
          onKeyDown: clickable
            ? (event) => {
                if (event?.key !== 'Enter' && event?.key !== ' ') return;
                if (typeof event.preventDefault === 'function') event.preventDefault();
                onJump(turn.turn, turn.ordinal);
              }
            : undefined,
        },
        // 第一行：轮号 + 触发这一轮的那句话（整行、可换行）——方便一眼定位
        h(
          'span',
          { className: 'tcs-turnHead' },
          h('span', { className: 'tcs-turnNo' }, tr('turn') + ' ' + String(turn.turn)),
          h('span', { className: 'tcs-turnTitle' }, view.label),
        ),
        // 第二行：费用 / token / 时间与步数
        h(
          'span',
          { className: 'tcs-turnMeta' },
          h('span', { className: 'tcs-turnMoney' }, view.amount),
          h('span', { className: 'tcs-turnTokens' }, view.tokens),
          h('span', { className: 'tcs-turnWhen' }, view.when),
        ),
      );
    }

    function summaryRow(row, tr, onOpen, currentId, now, onPreview) {
      const props = {
        key: row.id,
        type: 'button',
        className: 'tcs-row',
        title: row.title + ' · ' + row.id,
        'data-running': row.running ? 'true' : 'false',
        'data-current': row.id === currentId ? 'true' : 'false',
      };
      if (typeof onOpen === 'function') props.onClick = () => onOpen(row.id);
      if (typeof onPreview === 'function') {
        props.onMouseEnter = (event) => onPreview(row.id, event?.currentTarget);
        props.onFocus = (event) => onPreview(row.id, event?.currentTarget);
      }
      return h(
        'button',
        props,
        h('span', { className: 'tcs-dot', 'data-running': row.running ? 'true' : 'false' }),
        h(
          'span',
          { className: 'tcs-main' },
          h('span', { className: 'tcs-title' }, row.title),
          h('span', { className: 'tcs-detail' }, rowDetail(row, tr, now)),
        ),
        h('span', { className: 'tcs-tokens' }, fmtCompact(row.billed)),
        h('span', { className: 'tcs-money' }, row.cost === null ? '—' : '≈' + fmtMoney(row.cost.total)),
        h('span', { className: 'tcs-percent' }, row.percent === null ? '' : fmtPercent(row.percent)),
      );
    }

    /** Root-scoped badge in the sidebar footer: live totals across every session. */
    /**
     * Read the session-list observable directly, so this component works in any
     * slot scope (the composer dock is session-scoped, the sidebar footer is root).
     * Falls back to the standard `useSessions` hook when no source is injected.
     */
    function useSessionsSnapshot(sessionsSource, useSessions) {
      const sourceRef = React.useRef(sessionsSource);
      sourceRef.current = sessionsSource;
      const subscribe = React.useCallback((listener) => {
        const source = sourceRef.current;
        return typeof source?.subscribe === 'function' ? source.subscribe(listener) : () => {};
      }, []);
      const getSnapshot = React.useCallback(() => {
        const source = sourceRef.current;
        return typeof source?.getSnapshot === 'function' ? source.getSnapshot() : undefined;
      }, []);
      const injected = React.useSyncExternalStore(subscribe, getSnapshot, () => undefined);
      return injected ?? (typeof useSessions === 'function' ? useSessions((state) => state) : undefined);
    }

    function TokenCostSummary({ useSessions, t, openSession, warmProjections, sessionsSource, wide = true }) {
      const sessions = useSessionsSnapshot(sessionsSource, useSessions);
      const summary = React.useMemo(() => aggregateSessions(sessions), [sessions]);
      const [open, setOpen] = React.useState(false);
      const [position, setPosition] = React.useState(null);
      const rootRef = React.useRef(null);
      const warmRef = React.useRef(warmProjections);
      warmRef.current = warmProjections;
      const tr = (key) => (typeof t === 'function' ? t(key) : key);

      // Host 的控制基线只覆盖当前活跃 Session，后台任务的会话是冷的：它们没有
      // tokenUsage。对缺数据的会话逐个取证（先运行中的，再最近更新的），
      // 数量有上限；面板里的「载入其余会话」会取消上限重试一遍。
      React.useEffect(() => {
        if (typeof warmRef.current !== 'function') return undefined;
        const ids = Array.isArray(sessions?.ids) ? sessions.ids : [];
        const candidates = [];
        for (const id of ids) {
          if (warmedSessionIds.has(id)) continue;
          const row = sessions?.byId?.[id];
          const values = row?.projectionValues ?? sessions?.projectionsBySession?.[id]?.values;
          if (values?.tokenUsage !== undefined) {
            warmedSessionIds.add(id);
            continue;
          }
          candidates.push({ id, running: row?.running === true, updatedAt: asNumber(row?.updatedAt) });
        }
        candidates.sort((left, right) => Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt);
        for (const candidate of candidates.slice(0, WARM_LIMIT)) {
          warmedSessionIds.add(candidate.id);
          warmRef.current(candidate.id);
        }
        return undefined;
      }, [sessions]);

      React.useEffect(() => {
        if (!open) return undefined;
        const close = () => {
          setOpen(false);
          setPinned(false);
          setPreview(null);
          cancelPreview();
        };
        const onPointerDown = (event) => {
          const root = rootRef.current;
          if (root !== null && root.contains(event.target)) return;
          const panel = document.getElementById(SUMMARY_PANEL_ID);
          if (panel !== null && panel.contains(event.target)) return;
          // 逐轮预览同样是 portal：命中它不能算「点了外面」，否则按下就把行按钮卸载了
          const turns = document.getElementById(TURNS_PANEL_ID);
          if (turns !== null && turns.contains(event.target)) return;
          close();
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') close();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', close);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('resize', close);
        };
      }, [open]);

      const [pinned, setPinned] = React.useState(false);
      const [, setTick] = React.useState(0);
      const pinnedRef = React.useRef(pinned);
      pinnedRef.current = pinned;
      const leaveTimer = React.useRef(null);
      const cancelLeave = () => {
        if (leaveTimer.current !== null) {
          clearTimeout(leaveTimer.current);
          leaveTimer.current = null;
        }
      };
      React.useEffect(() => () => cancelLeave(), []);
      // 面板打开时按秒重渲染，让「运行中 12m」自己走
      React.useEffect(() => {
        if (!open) return undefined;
        const id = setInterval(() => setTick((value) => value + 1), 1000);
        return () => clearInterval(id);
      }, [open]);
      React.useEffect(() => {
        trackRunning(summary.rows, Date.now());
      });

      const [preview, setPreview] = React.useState(null);
      /** 被悬停那一行的视口坐标（逐轮预览要贴着它展开，不能贴在屏幕下方）。 */
      const [previewAnchor, setPreviewAnchor] = React.useState(null);
      const previewTimer = React.useRef(null);
      const previewAbort = React.useRef(null);
      const cancelPreview = () => {
        if (previewTimer.current !== null) {
          clearTimeout(previewTimer.current);
          previewTimer.current = null;
        }
        if (previewAbort.current !== null) {
          previewAbort.current.abort();
          previewAbort.current = null;
        }
      };
      React.useEffect(() => () => cancelPreview(), []);

      /** 取某会话的逐轮用量（带 15 秒缓存）。 */
      const loadTurns = (sessionId, force) => {
        const cached = turnCache.get(sessionId);
        if (force !== true && cached !== undefined && Date.now() - cached.at < TURN_CACHE_TTL_MS) {
          setPreview({ id: sessionId, state: 'ready', ...cached.data });
          return;
        }
        cancelPreview();
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        previewAbort.current = controller;
        setPreview({ id: sessionId, state: 'loading' });
        fetch(
          '/token-cost/turns?sessionId=' + encodeURIComponent(sessionId) + '&limit=30',
          controller === null ? undefined : { signal: controller.signal },
        )
          .then((response) => {
            if (response.ok) return response.json();
            const failure = new Error('HTTP ' + String(response.status));
            // 404 = Host 半侧还没加载（改过 index.js 后需要重启一次 Harness）
            failure.unavailable = response.status === 404;
            return Promise.reject(failure);
          })
          .then((data) => {
            turnCache.set(sessionId, { at: Date.now(), data });
            setPreview({ id: sessionId, state: 'ready', ...data });
          })
          .catch((error) => {
            if (controller !== null && controller.signal.aborted) return;
            setPreview({
              id: sessionId,
              state: 'error',
              error: String(error?.message ?? error),
              unavailable: error?.unavailable === true,
            });
          })
          .finally(() => {
            if (previewAbort.current === controller) previewAbort.current = null;
          });
      };

      /** 指针进入某行：延迟取数，避免扫过时连发请求。 */
      const openTurns = (sessionId, node) => {
        cancelPreview();
        // 记住这一行的位置：预览面板要贴着它（右侧、顶部对齐）展开。
        if (node !== null && node !== undefined && typeof node.getBoundingClientRect === 'function') {
          const rect = node.getBoundingClientRect();
          if (Number.isFinite(rect?.top) && Number.isFinite(rect?.bottom)) {
            setPreviewAnchor({ top: rect.top, bottom: rect.bottom });
          }
        }
        if (typeof fetch !== 'function') return;
        previewTimer.current = setTimeout(() => {
          previewTimer.current = null;
          loadTurns(sessionId);
        }, PREVIEW_DELAY_MS);
      };

      const totals = summary.totals;
      if (totals.billed === 0 && totals.active === 0) return null;

      const money = totals.cost > 0 ? '≈' + fmtMoney(totals.cost) : null;
      const currentId = currentSessionIdOf(sessions);
      const current = currentId === undefined ? undefined : summary.rows.find((row) => row.id === currentId);
      // 徽标只留金额：截至时刻放到悬停展开的面板元信息里（见 totals.asOf 那一行）
      const totalLine = money ?? fmtCompact(totals.billed) + ' ' + tr('tokens');
      const currentLine =
        current === undefined
          ? null
          : (current.cost !== null && current.cost.total > 0
              ? '≈' + fmtMoney(current.cost.total)
              : fmtCompact(current.billed) + ' ' + tr('tokens')) +
            (current.percent === null ? '' : ' · ' + fmtPercent(current.percent));
      const badgeLine = (key, text, lineKey, running) =>
        h(
          'span',
          { className: 'tcs-line', key: lineKey },
          h('span', { className: 'tcs-key' }, tr(key)),
          running === true ? h('span', { className: 'tcs-dot', 'data-running': 'true' }) : null,
          h('span', { className: 'tcs-value' }, text),
        );
      const now = Date.now();
      const label = wide
        ? h(
            'span',
            { className: 'tcs-lines' },
            badgeLine('total', totalLine, 'total', totals.running > 0),
            currentLine === null ? null : badgeLine('current', currentLine, 'current'),
          )
        : h('span', { className: 'tcs-label' }, money ?? fmtCompact(totals.billed));

      /** 展开面板：定位到徽标上方，并重试仍缺数据的会话。 */
      const openPanel = () => {
        cancelLeave();
        const node = rootRef.current;
        if (node !== null) {
          const rect = node.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 336)),
            bottom: Math.max(8, window.innerHeight - rect.top + 8),
          });
        }
        for (const row of summary.rows) if (!row.hasUsage) warmedSessionIds.delete(row.id);
        setOpen(true);
      };

      /** 指针离开后延迟收起，留出移动到面板上的时间。 */
      const scheduleLeave = () => {
        if (pinnedRef.current) return;
        cancelLeave();
        leaveTimer.current = setTimeout(() => {
          leaveTimer.current = null;
          setOpen(false);
          setPreview(null);
          setPreviewAnchor(null);
          cancelPreview();
        }, 220);
      };

      /** 点击 = 钉住 / 取消钉住（悬停本身就会展开）。 */
      const togglePin = () => {
        if (pinnedRef.current) {
          setPinned(false);
          setOpen(false);
          return;
        }
        setPinned(true);
        openPanel();
      };

      const onOpen = typeof openSession === 'function'
        ? (sessionId) => {
            openSession(sessionId);
            setOpen(false);
          }
        : undefined;

      const visible = summary.rows.filter((row) => row.billed > 0 || row.running);
      const panel = open
        ? ReactDOM.createPortal(
            h(
              'div',
              {
                id: SUMMARY_PANEL_ID,
                className: 'tcs-panel',
                role: 'dialog',
                'aria-label': tr('title'),
                onMouseEnter: cancelLeave,
                onMouseLeave: scheduleLeave,
                style: position === null
                  ? { left: 12, bottom: 64 }
                  : { left: position.left, bottom: position.bottom },
              },
              h(
                'div',
                { className: 'tcs-head' },
                h('span', { className: 'tcs-headTitle' }, tr('title')),
                h('span', { className: 'tcs-headValue' }, money ?? fmtInt(totals.billed) + ' tok'),
              ),
              h(
                'div',
                { className: 'tcs-meta' },
                h('span', null, totals.sessions + ' ' + tr('sessions')),
                h('span', null, totals.running + ' ' + tr('running')),
                totals.cacheRate === null ? null : h('span', null, tr('cacheRate') + ' ' + fmtPercent(totals.cacheRate)),
                totals.maxPercent > 0 ? h('span', null, '≤' + fmtPercent(totals.maxPercent)) : null,
                totals.asOf > 0 ? h('span', null, tr('asOf') + ' ' + fmtClock(totals.asOf)) : null,
                totals.decodeRate === null ? null : h('span', null, totals.decodeRate.toFixed(1) + ' tok/s'),
                totals.avgTtft === null ? null : h('span', null, tr('ttft') + ' ' + fmtMs(totals.avgTtft)),
              ),
              h(
                'div',
                { className: 'tcs-list' },
                visible.length === 0
                  ? h('div', { className: 'tcs-empty' }, tr('empty'))
                  : visible.map((row) => summaryRow(row, tr, onOpen, currentId, now, openTurns)),
              ),
              h('div', { className: 'tcs-hint' }, tr('hint')),
              totals.unpriced > 0 ? h('div', { className: 'tcs-hint' }, tr('unpriced')) : null,
              totals.pending > 0 &&
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'tcs-more',
                    onClick: () => {
                      if (typeof warmRef.current !== 'function') return;
                      for (const row of summary.rows) {
                        if (row.hasUsage) continue;
                        warmedSessionIds.delete(row.id);
                        warmRef.current(row.id);
                      }
                    },
                  },
                  tr('loadRest') + ' · ' + totals.pending,
                ),
            ),
            document.body,
          )
        : null;

      const previewRow = preview === null ? undefined : summary.rows.find((row) => row.id === preview.id);
      const previewPrice =
        previewRow !== undefined && previewRow.model !== null && Object.hasOwn(PRICES, previewRow.model)
          ? PRICES[previewRow.model]
          : null;
      const previewLeft = (() => {
        const base = position === null ? 12 : position.left;
        const right = base + PANEL_WIDTH + 8;
        if (typeof window === 'undefined') return right;
        return right + TURNS_WIDTH <= window.innerWidth ? right : Math.max(8, base - TURNS_WIDTH - 8);
      })();

      /**
       * 纵向锚定到**被悬停的那一行**，而不是跟主面板共用一个 bottom。
       * 之前预览固定在屏幕下方那一条线上：悬停靠上的会话行时，指针得跨过聊天区一路往下走，
       * 主面板的 mouseleave 会先到期（220ms 宽限），预览随即消失——轮次少时面板更矮，更明显。
       * 现在贴着该行展开，指针只走 8px 横向间隙；下方放不下就翻到行的上方。
       */
      const previewBox = (() => {
        const viewport = typeof window === 'undefined' ? 0 : window.innerHeight;
        const limit = viewport > 0 ? Math.min(viewport * 0.7, 520) : 520;
        const anchor = previewAnchor;
        const fallback = () => ({
          bottom: position === null ? 64 : position.bottom,
          maxHeight: limit,
        });
        if (anchor === null || !(viewport > 0)) return fallback();
        const below = viewport - anchor.top - 12;
        const above = anchor.bottom - 12;
        if (below >= Math.min(limit, 320) || below >= above) {
          return { top: Math.max(8, anchor.top), maxHeight: Math.max(160, Math.min(limit, below)) };
        }
        return { bottom: Math.max(8, viewport - anchor.bottom), maxHeight: Math.max(160, Math.min(limit, above)) };
      })();

      /**
       * 点某一轮：切到那个会话 → 收起面板 → 把主视图落到该轮。
       * 先切换再跳：轨道属于当前会话，不先切过去就找不到对应刻度。
       */
      const onJumpTurn = (sessionId) => (turnNo, ordinal) => {
        if (typeof openSession === 'function') openSession(sessionId);
        setPinned(false);
        setOpen(false);
        setPreview(null);
        setPreviewAnchor(null);
        cancelPreview();
        jumpToTurn(turnNo, { ordinal: Number.isInteger(ordinal) ? ordinal : null });
      };

      const turnsPanel =
        preview === null || open !== true
          ? null
          : ReactDOM.createPortal(
              h(
                'div',
                {
                  id: TURNS_PANEL_ID,
                  className: 'tcs-turns',
                  'data-turn-preview': preview.id,
                  onMouseEnter: cancelLeave,
                  onMouseLeave: scheduleLeave,
                  style: { left: previewLeft, ...previewBox },
                },
                h(
                  'div',
                  { className: 'tcs-turnsHead' },
                  h('span', { className: 'tcs-turnsTitle' }, previewRow === undefined ? tr('turnsTitle') : previewRow.title),
                  h('span', { className: 'tcs-turnsMeta' }, previewRow === undefined ? '' : tr('turnsTitle')),
                ),
                preview.state === 'loading'
                  ? h('div', { className: 'tcs-turnsNote' }, tr('loading'))
                  : preview.state === 'error'
                    ? h(
                        'div',
                        { className: 'tcs-turnsNote' },
                        preview.unavailable === true
                          ? tr('needRestart')
                          : tr('loadFailed') + '：' + String(preview.error ?? ''),
                      )
                    : h(
                        'div',
                        { className: 'tcs-turnsList' },
                        (preview.turns ?? []).length === 0
                          ? h('div', { className: 'tcs-turnsNote' }, tr('noTurns'))
                          : (preview.turns ?? [])
                              .map((turn, index) => ({
                                ...turn,
                                ordinal: (preview.totalTurns ?? preview.turns.length) - preview.turns.length + index,
                              }))
                              .reverse()
                              .map((turn) => turnRow(turn, tr, previewPrice, onJumpTurn(preview.id))),
                      ),
                preview.state === 'ready' && preview.truncated === true
                  ? h(
                      'div',
                      { className: 'tcs-turnsNote' },
                      tr('truncatedTurns') +
                        ' ' +
                        String((preview.turns ?? []).length) +
                        ' / ' +
                        String(preview.totalTurns ?? 0) +
                        ' ' +
                        tr('turnsUnit'),
                    )
                  : null,
                preview.state === 'ready' && preview.folded !== true
                  ? h('div', { className: 'tcs-turnsNote' }, tr('foldUnavailable'))
                  : null,
              ),
              document.body,
            );

      return h(
        'div',
        { className: 'tcs-root', ref: rootRef, 'data-token-cost': 'summary' },
        h('style', null, SUMMARY_CSS),
        h(
          'button',
          {
            type: 'button',
            className: 'tcs-pill',
            'aria-expanded': open,
            'data-pinned': pinned ? 'true' : 'false',
            title: tr('label'),
            onMouseEnter: openPanel,
            onMouseLeave: scheduleLeave,
            onFocus: openPanel,
            onBlur: scheduleLeave,
            onClick: togglePin,
          },
          summaryIcon(),
          label,
        ),
        panel,
        turnsPanel,
      );
    }

    const inject = ['slots', 'locale', 'sessions'];

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS_SUMMARY, { zh: SUMMARY_ZH, en: SUMMARY_EN }),
        'token-cost: summary dictionaries',
      );
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'token-cost-summary',
            order: 40,
            locale: NS_SUMMARY,
            inject: () => ({
              openSession: (sessionId) => ctx.get('uiWorkspace')?.openSession(sessionId),
              warmProjections: (sessionId) => ctx.sessions?.refreshProjections?.(sessionId),
              sessionsSource: ctx.sessions.list,
            }),
          },
          TokenCostSummary,
        ),
      );
    }

    // __internals 只给离线测试用（插件加载器忽略额外字段）
    return { name: 'token-cost', inject, apply, __internals: { turnView } };
  },
});
