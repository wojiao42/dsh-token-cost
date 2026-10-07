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
  };
  return React;
}
const ReactDOM = { createPortal: (node) => node };

// ── 渲染树 → HTML ──────────────────────────────────────────────────────────
const VOID_TAGS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);
const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value) => escapeText(value).replace(/"/g, '&quot;');
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function serializeStyle(style) {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${kebab(key)}:${value}`)
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
};

// `renderWithOpen(open)`：`open=true` 时让组件第一个 useState 返回 true（面板展开态）
function renderWithOpen(open, wide = true) {
  const react = createReact(open);
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
  return captured.component({
    t: (key) => ZH[key] ?? key,
    sessionsSource: { getSnapshot: () => SESSIONS, subscribe: () => () => {} },
    openSession() {},
    warmProjections() {},
    wide,
  });
}

// ── 页面 ───────────────────────────────────────────────────────────────────
const PAGE_CSS = [
  'html,body{margin:0;padding:0}',
  'body{background:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-primary)}',
  '.canvas{position:relative;box-sizing:border-box;width:100%;height:100vh;padding:16px}',
  '.sidebar{position:absolute;left:16px;bottom:16px;box-sizing:border-box;width:248px;padding:10px 10px 12px;',
  'border-radius:14px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2)}',
  '.sidebar .cap{display:block;margin:0 8px 8px;font-size:12px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}',
  '.tcs-panel{position:absolute !important;left:16px !important;bottom:112px !important}',
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
const shots = [
  ['screenshot-1-badge.png', page(renderWithOpen(false), { dark: false }), '380,200'],
  ['screenshot-2-panel.png', page(renderWithOpen(true), { dark: false }), '560,640'],
  ['screenshot-3-dark.png', page(renderWithOpen(true), { dark: true }), '560,640'],
];
console.log('浏览器:', browser);
console.log('主题 CSS:', themeCss === '' ? '(缺失，用兜底变量)' : `${(themeCss.length / 1024).toFixed(1)} KB`);
for (const [name, html, size] of shots) {
  const bytes = shoot(browser, html, path.join(assets, name), size);
  console.log(`  ${name}  ${(bytes / 1024).toFixed(0)} KB  (${size})`);
}
