// Verify the running Host serves the current build of the plugin: report the
// artifact revision, the feature markers, and the registration counts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BASE = 'http://127.0.0.1:19387';
const PKG = 'dsh-token-cost';
// Client bundle to check: argv[2], else this repo's own client.js.
const FILE = process.argv[2] ?? path.join(__dirname, '..', 'client.js');

const framedHash = (domain, parts) => {
  const hash = crypto.createHash('sha1').update(domain).update('\0');
  for (const part of parts) hash.update(`${String(Buffer.byteLength(part))}:`).update(part);
  return hash.digest('hex').slice(0, 12);
};

const stat = fs.statSync(FILE);
const rev = framedHash('plugin-artifact', [String(stat.mtimeMs), String(stat.ctimeMs), String(stat.size)]);
const count = (text, needle) => text.split(needle).length - 1;

const PRESENT = {
  '侧栏汇总槽': "name: 'sidebar.footer.action'",
  '徽标（全部 / 当前 / 截至）': 'currentSessionIdOf',
  '时间：截至时钟': 'fmtClock',
  '时间：行明细（运行时长/轮步/ttft/速度）': 'rowDetail',
  '悬停展开 + 点击钉住': 'onMouseEnter',
  '逐轮预览：取数路由': '/token-cost/turns',
  '逐轮预览：浮层': 'tcs-turns',
  '逐轮浮层白名单（点轮次才会触发跳转）': 'TURNS_PANEL_ID',
  '跳转只点一次（不做二次校正）': '不做二次校正',
  '面板标记当前任务行': "'data-current'",
  '冷会话取证 warmProjections': 'warmProjections',
  '会话列表源 useSyncExternalStore': 'useSyncExternalStore',
  '载入其余会话': 'loadRest',
  '单价表': 'PRICES',
};

(async () => {
  console.log(`file: ${String(stat.size)} bytes, rev ${rev}`);
  const response = await fetch(`${BASE}/plugins/??${PKG}/client.js&rev=${rev}`);
  const body = await response.text();
  console.log(`served: HTTP ${response.status}, ${String(body.length)} chars\n`);
  let bad = 0;
  for (const [label, marker] of Object.entries(PRESENT)) {
    const present = body.includes(marker);
    if (!present) bad += 1;
    console.log(`${present ? ' present' : ' MISSING'}  ${label}`);
  }
  const checks = [
    ['侧栏汇总注册 1 次', count(body, "ctx.slots.inject('sidebar.footer.action'"), 1],
    ['输入框下方无任何注册', count(body, "\n      ctx.slots.inject('conversation.composer.dock'"), 0],
    ['旧的会话内药丸代码已清除', count(body, 'TokenCostMeter'), 0],
  ];
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) bad += 1;
    console.log(`${ok ? ' present' : ' WRONG  '}  ${label}（实际 ${String(actual)}，期望 ${String(expected)}）`);
  }
  console.log(`\n${bad === 0 && response.status === 200 ? '全部命中：运行中的 Host 已在提供当前版本' : `有 ${String(bad)} 项不符合预期`}`);
  if (response.status !== 200 || bad > 0) process.exitCode = 1;
})();
