# dsh-token-cost

> **English** — Live token usage and estimated cost in the DSH sidebar: the current task on one line,
> every session combined on the next, with cache-hit rate and a per-session breakdown.
> Cost is estimated from an editable price table; the plugin adds no model calls, prompts or tools.

侧栏底部常驻的**用量与费用账本**：一行是**全部会话合计**，一行是**当前任务**。

```
全部  ≈¥0.1240 · 2 运行中
当前  ≈¥0.0330 · 45.4%
```

点开是逐会话明细：状态圆点 / 标题 / token / 费用 / 上下文占用百分比。**当前任务行加粗**，
点一行直接切到那个会话；运行中的任务排在最前。侧栏收起时降级为只显示合计金额。

输入框下方**刻意不显示任何东西**——同一份合计不重复出现。

## 快速上手

1. 装：`dsh plugin --profile desktop add github:wojiao42/dsh-token-cost`（或从插件市场安装），刷新页面。
2. 看侧栏底部那两行：上一行是全部会话，下一行是你正在看的任务。
3. 点开面板看明细；若某些后台任务还没取到数据，点底部 **「载入其余会话 · N」**。

## 界面

| 元素 | 内容 |
|---|---|
| 徽标第一行 | 全部会话的估算费用合计 + 正在运行的任务数（`全部 ≈¥0.12 · 2 运行中`） |
| 徽标第二行 | 主视图里那个任务的费用 + 上下文占用（`当前 ≈¥0.03 · 45.4%`） |
| 面板头部 | 合计金额；元信息行：会话数 / 运行中数 / 整体缓存命中率 / 运行中任务的最高占用 |
| 面板列表 | 每行：状态圆点、标题、token、费用、占用百分比；**当前任务加粗**，点行切换会话 |
| 面板底部 | 「载入其余会话 · N」（仅在还有会话没取到数据时出现） |

侧栏收起时只有一行金额——宽度不够放两行。

## 数据与口径

- **不新增任何模型调用、提示词或工具**：全部来自已有会话投影
  （`tokenUsage` / `contextPressure` / `modelSelection`，估算器就是官方 `dsh-token-meter`）。
- **上下文占用** = `contextPressure.projectedTokens / contextWindow`，与内置的上下文圆环同源。
- **冷会话取证**：Host 的控制基线只覆盖当前活跃 Session，后台任务/其他窗口的会话是冷会话，
  列表里没有它们的投影。插件对缺数据的会话调用客户端已有的
  `ctx.sessions.refreshProjections(id)`（官方语义：**不打开会话也能读它的全部投影**），
  顺序是**运行中优先**、其次按最近更新；每次列表更新最多取 48 个，取过的不重复请求；
  打开面板时会重试仍缺数据的会话。
- **取不到的会话**：已删除/已归档、不在会话列表里的会话没有数据，不计入合计。

## 单价与费用

费用 = 未缓存输入 × `cacheMiss` +（缓存读 + 缓存写）× `cacheHit` + 输出 × `output`，
按当前模型查表。表在 `client.js` 顶部：

```js
const PRICES = {
  'deepseek-flash': { cacheHit: 0.02, cacheMiss: 0.4, output: 4 },
  'deepseek-v4-pro': { cacheHit: 0.02, cacheMiss: 0.4, output: 4 },
};
```

单位是**人民币元 / 每百万 token**。表里没有的模型只显示 token 与占用，费用列显示 `—`
并在面板里提示未计入。

> **这是估算值，不是账单。** 默认单价按公开调价信息填写；插件也无法感知折扣、赠送额度、
> 不同计费档位与图片/文件计价。`dsh-token-meter` 的文本计量本身是「每 token 四字符」的
> 固定启发式规则，对 CJK 与 JSON 会低估。要对账请以官方账单为准，或按实际价格改表。

## 安装

**方式一：从 GitHub 装（发布后的正式方式）**

```sh
dsh plugin --profile desktop add github:wojiao42/dsh-token-cost
```

卸载：`dsh plugin --profile desktop remove dsh-token-cost`。

**方式二：本地源码开发**

| 位置 | 说明 |
|---|---|
| `<工作区根>\plugins\dsh-token-cost` | **源码**，改这里 |
| `<插件安装根>\dsh-token-cost` | 指向源码目录的目录联接（junction），作为安装源路径 |
| `…\.dsh\profiles\desktop\node_modules\dsh-token-cost` | 指向 `<插件安装根>\…` 的目录联接 |

profile 的 `package.json` 里登记为组合包（**必须**用 pnpm 的 `link:` 协议，
`file:` 会把目录硬链/复制进 `node_modules`，之后改源码不生效）：

```json
"dependencies": { "dsh-token-cost": "link:<插件安装根>/dsh-token-cost" },
"dsh": { "profile": { "bundles": [ "…", "dsh-token-cost" ] } }
```

## 文件

| 文件 | 作用 |
|---|---|
| `package.json` | 插件清单：`dsh.bundle.patch` 与 `dsh.client`（`platform: web`、`immediately`、`inject: dsh-client-ui-sidebar`） |
| `index.js` | Host 半侧：不注册任何东西，只为让本包成为一条正常的 Loader 行 |
| `client.js` | 浏览器半侧：侧栏两行徽标 + 明细面板（构建产物直接提交，git 安装不跑构建） |
| `cordis.patch.yml` | 组合包 patch：插入 `token-cost` 行（`name` 必须等于包名） |
| `tools/plugin-summary-test.cjs` | 30 项离线断言（假 React/ReactDOM/hook harness，不需要浏览器） |
| `tools/verify-live.cjs` | 检查运行中的 Host 是否已在提供当前版本 |
| `tools/publish.mjs` | GitHub 侧发布：建仓 + 推送 + topic + 收录条目，见 `PUBLISHING.md` |

## 改完代码怎么生效

客户端 bundle 在**条目被移除后重新加入**时才会重新读文件（`artifactRevision` 只看
mtime/ctime/size），所以改完 `client.js` 要重挂一次这个包：

1. **不重启（推荐）**：侧栏「插件」页找到 `dsh-token-cost`，开关**关掉再打开**。
2. **等价的文件做法**：把该包从 profile 的 `dsh.profile.bundles` 里删掉，等几秒
   （`dsh-hmr` 会重新组合 profile，旧 rev 立刻 404），再加回末尾。

Host 半侧 `index.js` 是空实现，所以没有需要重启 Harness 的部分。

## 测试

```
node plugins/dsh-token-cost/tools/plugin-summary-test.cjs   # 30 项：注册面、两行徽标、当前任务标记、
                                                            #   金额算式、排序、未知模型、冷会话取证、
                                                            #   载入其余、空列表、注入源
node plugins/dsh-token-cost/tools/verify-live.cjs           # 运行中的 Host 是否已在提供当前版本
```

两个脚本的退出码都必须为 0。

## 投稿到插件市场

社区精选目录 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
（`dsh-plugin.org` 的条目由它同步）用**一个仓库一个 YAML** 收录：

```yaml
url: https://github.com/wojiao42/dsh-token-cost
name: wojiao42/dsh-token-cost
category: usage
description:
  en: 'Live token usage and estimated cost in the sidebar: the current task plus every session combined, with cache-hit rate and a per-session breakdown.'
  zh: 侧栏里实时显示 token 用量与估算费用：当前任务与全部会话合计，含缓存命中率与逐会话明细。
```

分类选 `usage`（「用量」）：插件做的事就是统计与展示用量/费用。
完整流程与检查表见 `PUBLISHING.md`。

## 常见问题

**为什么只有侧栏一处，输入框下方没有？**
早期版本在输入框下方也有一个「本会话」药丸，两处显示同一类数字属于重复。现在只保留侧栏一处，
把「全部」与「当前」并排放在同一块。

**为什么合计和我看到的当前会话对不上？**
合计包含所有会话（含后台任务与子智能体）。冷会话第一次要按需取证，几毫秒内补齐；
还没补齐时面板底部会出现「载入其余会话 · N」。

**费用准吗？**
是估算。单价表可改；官方计量本身对 CJK/JSON 有低估，且插件看不到折扣与赠送额度。
要对账以官方账单为准。

**会发额外请求吗？**
不发模型请求。只在客户端向本机 Host 读会话投影（冷会话取证走的是官方 `session.projections` 接口）。

**侧栏收起后看到什么？**
只有一行合计金额（宽度不够两行），面板照常点开。

## 已知边界

- **已删除/已归档、不在会话列表里的会话取不到数据**，不计入合计。
- **上下文占用是参考值**：`projectedTokens` 含启发式误差，与内置圆环同源，不等于计费规模。
- **每次列表更新最多自动取证 48 个冷会话**，其余需要点一次「载入其余会话」。
