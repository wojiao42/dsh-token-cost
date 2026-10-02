#!/usr/bin/env node
/**
 * 从已安装的 DSH app.asar 里抽出主题样式表（`--dsw-*` 变量所在的那些内联 CSS），
 * 供 `tools/render-panel.mjs` 出截图时使用。
 *
 *   node tools/extract-theme.cjs <app.asar> <输出 css 路径> [asar 内的主题包路径]
 *
 * 默认参数按 Windows 桌面版安装位置：app.asar 在 `<安装目录>/resources/app.asar`，
 * 主题包在 `dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js`。
 * 用纯 node 读 asar（Electron 的 fs 不是必需的），所以不依赖任何运行时。
 */

const fs = require('node:fs');
const path = require('node:path');

const archive = process.argv[2] ?? '<DSH 安装目录>/resources/app.asar';
const out = process.argv[3] ?? path.join(__dirname, '..', 'assets', 'theme.css');
const inner =
  process.argv[4] ?? 'dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js';

/** 读 asar 目录树。 */
function readHeader(fd) {
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const headerStrSize = head.readUInt32LE(12);
  const headerBuf = Buffer.alloc(headerStrSize);
  fs.readSync(fd, headerBuf, 0, headerStrSize, 16);
  return { header: JSON.parse(headerBuf.toString('utf8')), dataOffset: 16 + Math.ceil(headerStrSize / 4) * 4 };
}

function findEntry(node, target, prefix = '') {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const here = prefix === '' ? name : `${prefix}/${name}`;
    if (entry.files) {
      const hit = findEntry(entry, target, here);
      if (hit !== null) return hit;
    } else if (here === target) {
      return entry;
    }
  }
  return null;
}

const fd = fs.openSync(archive, 'r');
const { header, dataOffset } = readHeader(fd);
const entry = findEntry(header, inner);
if (entry === null) {
  console.error(`asar 里找不到 ${inner}`);
  process.exit(1);
}
const source = (() => {
  const buf = Buffer.alloc(entry.size);
  fs.readSync(fd, buf, 0, entry.size, dataOffset + Number(entry.offset));
  return buf.toString('utf8');
})();
fs.closeSync(fd);

const blocks = [];
for (const match of source.matchAll(/var\s+\w+_css_default\s*=\s*("(?:[^"\\]|\\.)*")/g)) {
  try {
    blocks.push(JSON.parse(match[1]));
  } catch {
    /* 解析不了的字面量跳过 */
  }
}
const css = blocks.join('\n');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, css);
console.log(`theme css: ${String(blocks.length)} 块, ${(css.length / 1024).toFixed(1)} KB -> ${out}`);
