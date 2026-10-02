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
      cacheRate: 'Cache hit',
      hint: 'Click a row to switch to that session; cost is estimated.',
      unpriced: 'Some sessions use a model without a built-in price.',
      empty: 'No usage yet',
      loadRest: 'Load the rest',
    };

    const SUMMARY_CSS = [
      '.tcs-root{position:relative;display:inline-flex;align-items:center;min-width:0}',
      '.tcs-pill{box-sizing:border-box;max-width:100%;display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
      'padding:4px 8px;border:none;border-radius:var(--dsw-radius-sm,8px);background:0 0;font:inherit;',
      'font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.4;color:var(--dsw-alias-label-tertiary);',
      'white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.tcs-pill:hover,.tcs-pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.tcs-pill svg{flex:none;width:14px;height:14px}',
      '.tcs-lines{display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left}',
      '.tcs-line{display:flex;align-items:baseline;gap:6px;min-width:0;white-space:nowrap}',
      '.tcs-key{flex:none;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px)}',
      '.tcs-value{min-width:0;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}',
      '.tcs-row[data-current="true"] .tcs-title{font-weight:600}',
      '.tcs-label{min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.tcs-panel{position:fixed;z-index:80;box-sizing:border-box;width:328px;max-height:min(60vh,420px);overflow:auto;',
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
      '.tcs-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.tcs-dot{width:8px;height:8px;border-radius:999px;background:var(--dsw-alias-border-l2)}',
      '.tcs-dot[data-running="true"]{background:var(--dsw-alias-state-success-primary,var(--dsw-static-green-500,#22c55e))}',
      '.tcs-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}',
      '.tcs-tokens{text-align:right;color:var(--dsw-alias-label-tertiary)}',
      '.tcs-money{text-align:right;color:var(--dsw-alias-label-secondary)}',
      '.tcs-percent{text-align:right;color:var(--dsw-alias-label-tertiary)}',
      '.tcs-empty{padding:8px 4px;color:var(--dsw-alias-label-tertiary)}',
      '.tcs-more{margin-top:6px;padding:3px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;',
      'background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}',
      '.tcs-more:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.tcs-hint{margin-top:6px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px)}',
    ].join('');

    const SUMMARY_PANEL_ID = 'dsh-token-cost-summary-panel';
    /** Automatic projection warm-up cap per list update; running sessions always qualify first. */
    const WARM_LIMIT = 48;
    /** Session ids already asked for a projection baseline during this page life. */
    const warmedSessionIds = new Set();

    /** Token buckets, model-priced cost and context occupancy of one session's projections. */
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
          return acc;
        },
        { billed: 0, miss: 0, cache: 0, output: 0, cost: 0, priced: 0, unpriced: 0, running: 0, active: 0, maxPercent: 0, pending: 0 },
      );
      return {
        rows,
        totals: {
          ...totals,
          sessions: rows.length,
          cacheRate: totals.miss + totals.cache > 0 ? (totals.cache / (totals.miss + totals.cache)) * 100 : null,
        },
      };
    }

    const summaryIcon = () =>
      h(
        'svg',
        { viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M2.6 13.4V9.3h2.3v4.1zm4.4 0V6.1h2.3v7.3zm4.4 0V2.6h2.3v10.8z', fill: 'currentColor' }),
      );

    /** Session currently open in the main view — the task the user is looking at. */
    function currentSessionIdOf(list) {
      for (const id of list?.ids ?? []) {
        if (asNumber(list?.byId?.[id]?.retainedBy?.mainView) > 0) return id;
      }
      return undefined;
    }

    function summaryRow(row, tr, onOpen, currentId) {
      const props = {
        key: row.id,
        type: 'button',
        className: 'tcs-row',
        title: row.title + ' · ' + row.id,
        'data-running': row.running ? 'true' : 'false',
        'data-current': row.id === currentId ? 'true' : 'false',
      };
      if (typeof onOpen === 'function') props.onClick = () => onOpen(row.id);
      return h(
        'button',
        props,
        h('span', { className: 'tcs-dot', 'data-running': row.running ? 'true' : 'false' }),
        h('span', { className: 'tcs-title' }, row.title),
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
        const close = () => setOpen(false);
        const onPointerDown = (event) => {
          const root = rootRef.current;
          if (root !== null && root.contains(event.target)) return;
          const panel = document.getElementById(SUMMARY_PANEL_ID);
          if (panel !== null && panel.contains(event.target)) return;
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

      const totals = summary.totals;
      if (totals.billed === 0 && totals.active === 0) return null;

      const money = totals.cost > 0 ? '≈' + fmtMoney(totals.cost) : null;
      const currentId = currentSessionIdOf(sessions);
      const current = currentId === undefined ? undefined : summary.rows.find((row) => row.id === currentId);
      const totalLine =
        (money ?? fmtCompact(totals.billed) + ' ' + tr('tokens')) +
        (totals.running > 0 ? ' · ' + totals.running + ' ' + tr('running') : '');
      const currentLine =
        current === undefined
          ? null
          : (current.cost !== null && current.cost.total > 0
              ? '≈' + fmtMoney(current.cost.total)
              : fmtCompact(current.billed) + ' ' + tr('tokens')) +
            (current.percent === null ? '' : ' · ' + fmtPercent(current.percent));
      const badgeLine = (key, text, lineKey) =>
        h(
          'span',
          { className: 'tcs-line', key: lineKey },
          h('span', { className: 'tcs-key' }, tr(key)),
          h('span', { className: 'tcs-value' }, text),
        );
      const label = wide
        ? h(
            'span',
            { className: 'tcs-lines' },
            badgeLine('total', totalLine, 'total'),
            currentLine === null ? null : badgeLine('current', currentLine, 'current'),
          )
        : h('span', { className: 'tcs-label' }, money ?? fmtCompact(totals.billed));

      const toggle = () => {
        if (open) {
          setOpen(false);
          return;
        }
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
              ),
              h(
                'div',
                { className: 'tcs-list' },
                visible.length === 0
                  ? h('div', { className: 'tcs-empty' }, tr('empty'))
                  : visible.map((row) => summaryRow(row, tr, onOpen, currentId)),
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
            title: tr('label'),
            onClick: toggle,
          },
          summaryIcon(),
          label,
        ),
        panel,
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

    return { name: 'token-cost', inject, apply };
  },
});
