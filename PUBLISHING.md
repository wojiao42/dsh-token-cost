# 发布清单 / Publishing

目标：让 `dsh-token-cost` 进入社区精选目录
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。
`dsh-plugin.org` 上的条目从这个目录同步，所以**进了这里就等于进了插件市场**，
不需要另外向 `api.dsh-plugin.org` 投稿（那个域名只提供目录 JSON，没有投稿接口）。

## 一、前置条件核对

| 收录要求（来自 contributing.md） | 本仓库状态 |
|---|---|
| `package.json` 声明 `dsh.bundle`（**只声明 `dsh.client` 会被 CI 直接拒**） | ✅ `dsh.bundle.patch` → `./cordis.patch.yml` |
| `cordis.patch.yml` 紧邻 `package.json`，插入行的 `name` 与包名一致 | ✅ `name: dsh-token-cost` |
| 包根就是仓库根（CI 只读根包 / `packages/`·`plugins/`·`apps/` 子包） | ✅ 本目录整体作为仓库根 |
| 构建产物已提交（git 安装不跑构建） | ✅ `client.js` 就是产物，无构建步骤 |
| 仓库创建满 **1 天** | ⏳ 建仓后需等 1 天才能提 PR |
| 仓库带 `dsh-plugin` topic | ⏳ 建仓后设置 |
| 描述含英文 `: ` 时必须加引号 | ✅ 见下方 YAML，已引号 |

分类选 **`usage`**：插件做的事就是统计与展示 token 用量与费用
（目录 schema 里 `usage` 是独立分类，同类是「用量」这一支）。

## 二、建仓并推送

### 快路径：一条命令（推荐）

`tools/publish.mjs` 把这一节所有步骤固化了。令牌只经 **stdin/环境变量**交给 `gh`，
不进命令行参数、不进 git remote URL：

```sh
node tools/publish.mjs --dry-run --email you@example.com   # 先看它要做什么，零副作用
node tools/publish.mjs --email you@example.com             # 建仓 + 推送 + 加 topic
node tools/publish.mjs --pr                                # 仓库满 1 天后再提收录 PR
node tools/publish.mjs --prepare-pr                        # 不受 1 天限制：先推 fork 与分支
```

令牌来源（按顺序）：`GH_TOKEN` / `GITHUB_TOKEN` 环境变量 → 工作区根的 `.gh-token` 文件。
**必须是经典 PAT，勾 `public_repo` + `read:user`**（细粒度令牌无法建仓库）。
脚本会自动：读登录名 → 写 `LICENSE`（MIT，版权行 = 登录名）→ 补 `package.json` 的
`repository` → `git init` + 首个提交 → `gh repo create --public --push` → 加 topic
→ 把收录条目生成到 `dist/awesome-submission/`。

`--pr` 会先查仓库 `created_at`，**不满 1 天直接拒绝并告诉你还差多久**，不会去提一个必红的 PR。

### 手动路径

```sh
git init -b main
git add -A
git commit -m "feat: DSH 侧栏用量与费用汇总插件 dsh-token-cost v1.0.0"
gh repo create wojiao42/dsh-token-cost --public --source=. --remote=origin --push
gh repo edit wojiao42/dsh-token-cost --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh
```

## 三、提 PR 收录（建仓满 1 天后）

`data/plugins/` 下一个插件一个文件，新增 **`data/plugins/wojiao42__dsh-token-cost.yml`**：

```yaml
url: https://github.com/wojiao42/dsh-token-cost
name: wojiao42/dsh-token-cost
category: usage
description:
  en: 'Live token usage and estimated cost in the sidebar: the current task plus every session combined, with cache-hit rate and a per-session breakdown.'
  zh: 侧栏里实时显示 token 用量与估算费用：当前任务与全部会话合计，含缓存命中率与逐会话明细。
```

`tools/publish.mjs --prepare-pr` 已经把这套（fork + 分支 + 文件）走完，到点只需：

```sh
node tools/publish.mjs --pr
```

**不要手工编辑仓库根的两个 README**——它们由 `data/plugins/*.yml` 生成。
一个 PR 最多 3 条。

## 四、可选：不发 npm，改用预构建 tarball

市场客户端是 **npm 优先、GitHub 兜底**，所以不发 npm 也能被正常安装
（目录里的 `ic` 字段就是 `dsh plugin --profile desktop add github:wojiao42/dsh-token-cost`）。

若想省掉源码构建这一步，把预构建包挂到 GitHub Release，并在投稿 YAML 里加**可选的
`tarball:` 字段**。**不要**手写 `npm:` 键——npm 映射由 registry 自动采集，手写会被校验拒绝。

## 五、回滚

- 收录未合并：关掉 PR 即可，本仓库不受影响。
- 已合并要下架：向该目录提一个删除 yml 的 PR。
- 用户侧卸载：`dsh plugin --profile desktop remove dsh-token-cost`。
