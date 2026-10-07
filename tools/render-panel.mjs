#!/usr/bin/env node
/**
 * 出商店截图：把**真实组件**渲染成 HTML（主题变量取自已安装的主题包），
 * 再用无头 Chrome/Edge 出图。
 *
 *   node tools/extract-theme.cjs                       # 先抽主题 CSS 到 assets/theme.css
 *   node tools/render-panel.mjs [--theme <css 路径>]
 *
 * ⚠️ **样本数据是虚构的**：真实用量含用户的任务标题与费用，不能进公开截图。
 * 产出：`assets/screenshot-1-badge.png`、`-2-panel.png`、`-3-dark.png`
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadClientDefinition } from './lib/harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const assets = path.join(root, 'assets');
const clientPath = path.join(root, 'client.js');

const themeArg = process.argv.indexOf('--theme');
const themePath = themeArg === -1 ? path.join(assets, 'theme.css') : process.argv[themeArg + 1];
const themeCss = fs.existsSync(themePath) ? fs.readFileSync(themePath, 'utf8') : '';
if (themeCss === '') console.warn(`（没有读到主题 CSS：${themePath}，将只靠兜底变量出图）`);

// ── 兜底变量：主题 CSS 里缺哪个补哪个（浅色值取自官方调色板）──────────────────
const FALLBACK_LIGHT = {
  '--dsw-alias-label-primary': '#0f1115',
  '--dsw-alias-label-secondary': '#545557',
  '--dsw-alias-label-tertiary': '#7f8287',
  '--dsw-alias-label-caption': '#a2a4a6',
  '--dsw-alias-border-l2': '#e5e5e5',
  '--dsw-alias-interactive-bg-hover': 'rgba(0,0,0,.05)',
  '--dsw-alias-bg-base': '#fff',
  '--dsw-alias-bg-overlay': '#fff',
  '--dsw-alias-state-business-primary': '#3964fe',
  '--dsw-static-deepseek-450': '#5686fe',
  '--dsw-static-green-500': '#22c55e',
  '--dsw-radius-sm': '8px',
  '--dsw-radius-lg': '16px',
  '--dsw-elevation-panel': '0 6px 24px rgba(0,0,0,.18)',
  '--dsh-content-font-size-secondary': '13px',
  '--dsh-content-font-delta': '0px',
  '--dsh-content-font-delta-secondary': '0px',
};
const shim = (values, selector) =>
  `${selector}{${Object.entries(values)
    .filter(([name]) => !themeCss.includes(`${name}:`))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')}}`;

// ── 假 React（hook 按调用顺序复用槽位；`--open` 时第一个 useState 返回 true）──
function createReact(forceOpen) {
  const states = [];
  let cursor = 0;
  let forced = false;
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
    },
    useRef(value) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: value };
      return states[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        const value = forceOpen && !forced ? ((forced = true), true) : typeof initial === 'function' ? initial() : initial;
        states[index] = { value };
      }
      const slot = states[index];
      return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      const previous = states[index];
      if (!previous || !same(previous.deps, deps)) states[index] = { fn, deps };
      return states[index].fn;
    },
    useMemo(fn, deps) {
      const index = cursor++;
      const previous = states[index];
      if (!previous || !same(previous.deps, deps)) states[index] = { value: fn(), deps };
      return states[index].value;
    },
    useEffect() { cursor++; },
    useSyncExternalStore(_subscribe, getSnapshot) { cursor++; return getSnapshot(); },
    /** 每次渲染前归零 hook 游标——否则第二次渲染会读到新槽位（状态全丢）。 */
    __beginRender() { cursor = 0; },
  };
  return React;
}
const ReactDOM = { createPortal: (node) => node };

// ── 渲染树 → HTML ──────────────────────────────────────────────────────────
const VOID_TAGS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);
const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value) => escapeText(value).replace(/"/g, '&quot;');
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

// React 会给数值型长度自动补 px；序列化时照做，否则 `top:150` 是非法 CSS，
// 截图里预览会跑到静态位置上去（真实浏览器里 React 会补，所以这个问题只在出图侧）。
const UNITLESS = new Set(['zIndex', 'opacity', 'flexGrow', 'flexShrink', 'order', 'lineHeight', 'fontWeight', 'zoom']);

function serializeStyle(style) {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${kebab(key)}:${typeof value === 'number' && !UNITLESS.has(key) ? value + 'px' : value}`)
    .join(';');
}

function serializeAttrs(node) {
  const parts = [];
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'children' || key === 'key' || key === 'ref') continue;
    if (typeof value === 'function' || value === undefined || value === null || value === false) continue;
    if (key === 'style') {
      const css = serializeStyle(value);
      if (css !== '') parts.push(`style="${escapeAttr(css)}"`);
      continue;
    }
    const name = key === 'className' ? 'class' : key;
    if (value === true) {
      parts.push(name);
      continue;
    }
    parts.push(`${name}="${escapeAttr(String(value))}"`);
  }
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function toHtml(node) {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return escapeText(node);
  if (typeof node.type === 'function') return toHtml(node.type(node.props));
  const tag = node.type;
  if (tag === 'style') return `<style>${node.children.map(String).join('')}</style>`;
  const inner = node.children.map(toHtml).join('');
  if (VOID_TAGS.has(tag)) return `<${tag}${serializeAttrs(node)}>`;
  return `<${tag}${serializeAttrs(node)}>${inner}</${tag}>`;
}

// ── 虚构样本（不是任何人的真实数据）────────────────────────────────────────
const usage = (miss, cacheRead, output) => ({
  uncachedInputTokens: miss,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: 0,
  outputTokens: output,
});
const projections = (miss, cacheRead, output, model, window, used, stats) => ({
  tokenUsage: usage(miss, cacheRead, output),
  contextPressure: { projectedTokens: used, contextWindow: window },
  modelSelection: { next: { model } },
  ...(stats === undefined ? {} : { sessionStats: stats }),
});
const stats = ({ turns, steps, llmMs, toolMs = 0, ttftMs, ttftSteps, decodeMs, decodeTokens }) => ({
  turns,
  steps,
  llmMs,
  toolMs,
  ttftMs,
  ttftSteps,
  decodeMs,
  decodeTokens,
});
const ago = (minutes) => Date.now() - minutes * 60_000;
const SESSIONS = {
  ids: ['s1', 's2', 's3', 's4'],
  byId: {
    s1: {
      id: 's1', displayTitle: '给侧栏加用量徽标', running: true, retainedBy: { mainView: 1 }, updatedAt: ago(0),
      projectionValues: projections(42_000, 120_000, 18_000, 'deepseek-flash', 128_000, 79_000,
        stats({ turns: 9, steps: 17, llmMs: 168_000, toolMs: 94_000, ttftMs: 7_200, ttftSteps: 8, decodeMs: 96_000, decodeTokens: 2_100 })),
    },
    s2: {
      id: 's2', displayTitle: '并发：三份文档校对', running: true, retainedBy: {}, updatedAt: ago(1),
      projectionValues: projections(88_000, 260_000, 41_000, 'deepseek-flash', 128_000, 101_000,
        stats({ turns: 14, steps: 26, llmMs: 254_000, toolMs: 181_000, ttftMs: 11_000, ttftSteps: 13, decodeMs: 143_000, decodeTokens: 3_400 })),
    },
    s3: {
      id: 's3', displayTitle: '重构登录模块', running: false, retainedBy: {}, updatedAt: ago(46),
      projectionValues: projections(31_000, 90_000, 26_000, 'deepseek-v4-pro', 128_000, 33_000,
        stats({ turns: 6, steps: 11, llmMs: 132_000, toolMs: 58_000, ttftMs: 8_400, ttftSteps: 6, decodeMs: 61_000, decodeTokens: 1_050 })),
    },
    s4: {
      id: 's4', displayTitle: '调研：缓存方案', running: false, retainedBy: {}, updatedAt: ago(320),
      projectionValues: projections(12_000, 0, 9_000, 'local-model', 128_000, 14_000,
        stats({ turns: 3, steps: 5, llmMs: 44_000, toolMs: 12_000, ttftMs: 3_100, ttftSteps: 3, decodeMs: 19_000, decodeTokens: 380 })),
    },
  },
  projectionsBySession: {},
  phase: 'ready',
};

const definition = await loadClientDefinition(clientPath);

const ZH = {
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
  asOf: '截至',
  ago: '最近',
  now: '刚刚',
  turns: '轮',
  steps: '步',
  ttft: '首token',
  llm: '模型',
  tool: '工具',
  turnsTitle: '逐轮用量',
  turn: '第',
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
};

/**
 * 挂载组件：返回 `(props) => 渲染树`。复用同一个 React 实例再渲染一次，
 * hook 状态会保留——逐轮预览就是这样出图的（第一次挂悬停，第二次带出浮层）。
 */
function mount(react) {
  let captured;
  const instance = definition.factory((name) => {
    if (name === 'react') return react;
    if (name === 'react-dom') return ReactDOM;
    throw new Error(`unexpected require: ${name}`);
  });
  instance.apply({
    effect: (fn) => fn(),
    locale: { register() {} },
    slots: {
      inject: (name, callback) => {
        if (name === 'sidebar.footer.action') callback();
        return () => {};
      },
      register: (options, component) => {
        captured = { options, component };
        return () => {};
      },
    },
    get: () => undefined,
  });
  return captured.component;
}
const PROPS = {
  t: (key) => ZH[key] ?? key,
  sessionsSource: { getSnapshot: () => SESSIONS, subscribe: () => () => {} },
  openSession() {},
  warmProjections() {},
  wide: true,
};

/** 深度优先找组件树里的节点。 */
function walk(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return out;
  }
  out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
}

/** 逐轮预览用的假响应（虚构数据）。 */
const TURNS = {
  sessionId: 's1',
  totalTurns: 12,
  truncated: true,
  folded: true,
  turns: [
    { turn: 12, summary: '把徽标压小一点，别比旁边的按钮高', startTime: Date.now() - 240_000, endTime: Date.now() - 150_000, steps: 3, toolCalls: 1, closed: true, usage: { uncachedInputTokens: 8_400, cacheReadTokens: 62_000, cacheWriteTokens: 0, outputTokens: 4_100 } },
    { turn: 11, summary: '悬停某个对话能看到逐轮消费吗', startTime: Date.now() - 700_000, endTime: Date.now() - 520_000, steps: 2, toolCalls: 3, closed: true, usage: { uncachedInputTokens: 5_200, cacheReadTokens: 41_000, cacheWriteTokens: 0, outputTokens: 2_600 } },
    { turn: 10, summary: '侧栏加个截至时间', startTime: Date.now() - 1_500_000, endTime: Date.now() - 1_260_000, steps: 4, toolCalls: 2, closed: true, usage: { uncachedInputTokens: 11_000, cacheReadTokens: 88_000, cacheWriteTokens: 0, outputTokens: 7_300 } },
    { turn: 9, summary: '顺便把 token 费用也记一下', startTime: Date.now() - 2_600_000, endTime: null, steps: 1, toolCalls: 0, closed: false, exact: false, usage: null },
  ],
};

/** 悬停某行 → 逐轮预览（同一 React 实例渲染两次）。 */
async function turnsPage(dark) {
  globalThis.fetch = async () => ({ ok: true, json: async () => TURNS });
  // 预览的落位取决于视口高度与那一行的坐标，出图前把两者固定下来。
  // top 取列表第一行在页面里的实际位置，截图看起来才自洽。
  const ROW_RECT = { top: 190, bottom: 224 };
  if (globalThis.window !== undefined) {
    globalThis.window.innerWidth = 900;
    globalThis.window.innerHeight = 660;
  }
  const react = createReact(true);
  const component = mount(react);
  react.__beginRender();
  const first = component(PROPS);
  const row = walk(first).find((node) => node.props?.className === 'tcs-row');
  // 传真实的 currentTarget：预览必须按这一行的视口坐标锚定，而不是贴在屏幕下方。
  row?.props?.onMouseEnter?.({ currentTarget: { getBoundingClientRect: () => ROW_RECT } });
  await new Promise((resolve) => setTimeout(resolve, 250));
  react.__beginRender();
  const html = page(component(PROPS), { dark });

  // 自检：锚定错了就报错，别悄悄出一张错的图。
  const turnsTag = /<div class="tcs-turns"[^>]*style="([^"]*)"/.exec(html);
  if (turnsTag === null) throw new Error('逐轮预览没渲染出来');
  const style = turnsTag[1];
  if (!style.includes(`top:${ROW_RECT.top}px`) || style.includes('bottom:')) {
    throw new Error('逐轮预览没有锚定到被悬停的那一行，实际 style=' + style);
  }
  return html;
}

// ── 页面 ───────────────────────────────────────────────────────────────────
const PAGE_CSS = [
  'html,body{margin:0;padding:0}',
  'body{background:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-primary)}',
  // canvas 是定位祖先：harness 的 createPortal 桩会把 portal 摊平成组件子节点，
  // 于是面板和逐轮预览都落在 .sidebar 里面。侧栏若自身 position:absolute，
  // 预览的 top/left 就会相对侧栏算，跑到画面外（旧截图"贴在下方"的假象就是这么来的）。
  '.canvas{position:relative;box-sizing:border-box;width:100%;height:100vh;padding:16px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start}',
  '.sidebar{box-sizing:border-box;width:248px;padding:10px 10px 12px;',
  'border-radius:14px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2)}',
  '.sidebar .cap{display:block;margin:0 8px 8px;font-size:12px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}',
  // 组件在真实界面里就用 position:fixed（视口坐标）。整页截图只有一个视口高，
  // 所以照搬 fixed 即可；改成 absolute 会让定位祖先后退到 .tcs-root
  // （position:relative 的徽标本身，只有 248px 宽），预览的 top 相对它算就跑到视口外。
  '.tcs-panel{left:16px !important;bottom:112px !important}',
  '.tcs-turns{position:fixed !important}',
].join('');

function page(tree, { dark }) {
  const styles = toHtml(tree);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>dsh-token-cost</title>
<style>${themeCss}</style>
<style>${shim(FALLBACK_LIGHT, ':root')}</style>
<style>${PAGE_CSS}</style>
</head><body${dark ? ' data-ds-dark-theme=""' : ''}>
<div class="canvas"><div class="sidebar"><span class="cap">侧栏底部</span>${styles}</div></div>
</body></html>`;
}

function findBrowser() {
  const candidates = [
    path.join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ];
  const found = candidates.find((candidate) => candidate !== '' && fs.existsSync(candidate));
  if (found === undefined) throw new Error('找不到 Chrome / Edge，无法出截图');
  return found;
}

function shoot(browser, html, outFile, size) {
  fs.mkdirSync(assets, { recursive: true });
  const htmlFile = path.join(assets, `${path.basename(outFile, '.png')}.html`);
  fs.writeFileSync(htmlFile, html);
  fs.rmSync(outFile, { force: true });
  execFileSync(
    browser,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${size}`, '--virtual-time-budget=4000', `--screenshot=${outFile}`, `file:///${htmlFile.replace(/\\/g, '/')}`],
    { stdio: 'ignore', timeout: 120000 },
  );
  if (!fs.existsSync(outFile)) throw new Error(`截图失败：${outFile}`);
  return fs.statSync(outFile).size;
}

const browser = findBrowser();
/** 渲染一次（每次渲染前归零 hook 游标）。 */
const view = (forceOpen, props = PROPS) => {
  const react = createReact(forceOpen);
  const component = mount(react);
  react.__beginRender();
  return component(props);
};

const shots = [
  ['screenshot-1-badge.png', () => page(view(false), { dark: false }), '380,200'],
  ['screenshot-2-panel.png', () => page(view(true), { dark: false }), '560,640'],
  ['screenshot-3-dark.png', () => page(view(true), { dark: true }), '560,640'],
  ['screenshot-4-turns.png', () => turnsPage(false), '900,660'],
];
console.log('浏览器:', browser);
console.log('主题 CSS:', themeCss === '' ? '(缺失，用兜底变量)' : `${(themeCss.length / 1024).toFixed(1)} KB`);
for (const [name, makeHtml, size] of shots) {
  const bytes = shoot(browser, await makeHtml(), path.join(assets, name), size);
  console.log(`  ${name}  ${(bytes / 1024).toFixed(0)} KB  (${size})`);
}
