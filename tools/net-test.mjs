#!/usr/bin/env node
/**
 * 联网功能离线断言：计价规则刷新（pricing.json）+ 官方余额对账（含账本与偏差）。
 * 全程用临时 DSH_HOME 与桩 fetch，不联网、不碰真实凭据。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'token-cost-net-'))
process.env.DSH_HOME = HOME

const mod = await import('../index.js')
const { apply, EMBEDDED_PRICING, resolveApiKey, driftOf } = mod

let failed = 0
const assert = (name, cond) => {
  if (cond) console.log('PASS  ' + name)
  else {
    failed += 1
    console.log('FAIL  ' + name)
  }
}
const assertEqual = (name, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log('PASS  ' + name)
  else {
    failed += 1
    console.log('FAIL  ' + name + '\n      expected: ' + e + '\n      actual  : ' + a)
  }
}

// ── 内置兜底表 ───────────────────────────────────────────────
assert('兜底表带版本与来源', EMBEDDED_PRICING.version === 1 && /^https:/.test(EMBEDDED_PRICING.source))
assertEqual('兜底表 flash 空闲价', EMBEDDED_PRICING.models['deepseek-flash'].idle, { cacheHit: 0.02, cacheMiss: 1, output: 4 })
assertEqual('兜底表 flash 高峰价', EMBEDDED_PRICING.models['deepseek-flash'].peak, { cacheHit: 0.04, cacheMiss: 2, output: 8 })

// ── 对账口径 ─────────────────────────────────────────────────
assertEqual('样本不足时不给对账', driftOf([{ at: 1, total: 100, local: 0, algo: 'x' }]), null)
const drift = driftOf([
  { at: 1000, total: 100, local: 10, algo: 'x' },
  { at: 2000, total: 96, local: 14, algo: 'x' },
])
assertEqual('跨算法（本地估算量纲变了）不给对账', driftOf([
  { at: 1000, total: 100, local: 10, algo: 'old' },
  { at: 2000, total: 96, local: 14, algo: 'new' },
]), null)
assertEqual('没有 algo 的老快照不参与对账', driftOf([
  { at: 1000, total: 100, local: 10 },
  { at: 2000, total: 96, local: 14 },
]), null)
assertEqual('官方花了 4、本地算 4 → gap 0', [drift.spentOfficial, drift.spentLocal, drift.gap], [4, 4, 0])
const drift2 = driftOf([
  { at: 1000, total: 100, local: 10, algo: 'x' },
  { at: 2000, total: 96, local: 12, algo: 'x' },
])
assertEqual('本地少算 → gap 为负', drift2.gap, -2)

// ── API key 解析优先级 ────────────────────────────────────────
assertEqual('配置里直接给 key 优先', resolveApiKey({ balance: { apiKey: 'sk-config' } }, {}), { key: 'sk-config', source: 'config' })
assertEqual('env 次之', resolveApiKey({ balance: { apiKeyEnv: 'MY_KEY' } }, { MY_KEY: 'sk-env' }), { key: 'sk-env', source: 'env' })
assertEqual('没允许就不读凭据文件', resolveApiKey({}, {}), undefined)
fs.writeFileSync(path.join(HOME, '.credentials.yaml'), "refs:\n  DEEPSEEK_API_KEY: sk-from-credentials\n", 'utf8')
assertEqual(
  '允许后从 DSH 凭据库取 key',
  resolveApiKey({ balance: { readCredentials: true } }, {}),
  { key: 'sk-from-credentials', source: 'credentials' },
)

// ── 路由：桩 fetch ──────────────────────────────────────────
let routes = new Map()
let fetchCalls = []
let fetchImpl = async () => ({ ok: true, json: async () => ({}) })
globalThis.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options })
  return fetchImpl(url, options)
}

const fakeResponse = () => {
  const state = { status: 0, body: '' }
  return {
    state,
    writeHead(status) {
      state.status = status
    },
    end(chunk) {
      if (typeof chunk === 'string') state.body += chunk
    },
  }
}
const call = async (url, method = 'GET') => {
  const response = fakeResponse()
  const request = { method, url }
  await routes.get(url.split('?')[0]).handler(request, response)
  return { status: response.state.status, body: response.state.body === '' ? null : JSON.parse(response.state.body) }
}

apply(
  {
    get: () => undefined,
    inject: (names, callback) =>
      callback({
        webServer: {
          register(spec) {
            routes.set(spec.path, spec)
            return () => {}
          },
        },
        effect: (fn) => fn(),
      }),
  },
  { network: { pricing: true, balance: true }, balance: { readCredentials: true } },
)

assertEqual('注册了五条路由', [...routes.keys()].sort(), ['/token-cost/balance', '/token-cost/costs', '/token-cost/pricing', '/token-cost/session-usage', '/token-cost/turns'])

// 计价：远程成功
fetchImpl = async () => ({
  ok: true,
  json: async () => ({
    ...EMBEDDED_PRICING,
    updatedAt: '2026-12-01T00:00:00Z',
    models: { 'deepseek-flash': { idle: { cacheHit: 0.03, cacheMiss: 2, output: 5 }, peak: { cacheHit: 0.06, cacheMiss: 4, output: 10 } } },
  }),
})
let pricing = await call('/token-cost/pricing')
assertEqual('远程计价规则被采用', [pricing.status, pricing.body.source, pricing.body.doc.updatedAt], [200, 'remote', '2026-12-01T00:00:00Z'])
assert('远程规则落盘缓存', fs.existsSync(path.join(HOME, 'token-cost', 'pricing.json')))
const callsAfterRemote = fetchCalls.length
await call('/token-cost/pricing')
assertEqual('24h 内走缓存不再联网', fetchCalls.length, callsAfterRemote)

// 计价：远程坏了退回缓存
fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) })
pricing = await call('/token-cost/pricing?refresh=1')
assertEqual('远程失败退回上次缓存', [pricing.body.source, typeof pricing.body.error], ['cache', 'string'])

// 余额：成功
fetchImpl = async () => ({
  ok: true,
  json: async () => ({
    is_available: true,
    balance_infos: [{ currency: 'CNY', total_balance: '25.20', granted_balance: '0.00', topped_up_balance: '25.20' }],
  }),
})
let balance = await call('/token-cost/balance?local=10')
assertEqual('余额读到了', [balance.status, balance.body.ok, balance.body.total, balance.body.currency], [200, true, 25.2, 'CNY'])
assertEqual('key 来源是凭据库', balance.body.keySource, 'credentials')
assert('账本落盘', fs.existsSync(path.join(HOME, 'token-cost', 'ledger.json')))
const ledgerFile = JSON.parse(fs.readFileSync(path.join(HOME, 'token-cost', 'ledger.json'), 'utf8'))
assert('账本快照带算法标记（跨算法不对账）', typeof ledgerFile.snapshots?.[0]?.algo === 'string')

// 余额：1 分钟内同 local 走缓存
const callsBeforeCache = fetchCalls.length
balance = await call('/token-cost/balance?local=10')
assertEqual('60s 内同 local 走缓存', [balance.body.cached === true, fetchCalls.length], [true, callsBeforeCache])

// 余额：key 缺失
const modNoKey = await call('/token-cost/balance?local=20')
assertEqual('本地估算变了会重新查余额', modNoKey.status, 200)

// 关掉网络功能：不联网、返回 embedded / enabled:false
routes = new Map()
apply(
  {
    get: () => undefined,
    inject: (names, callback) =>
      callback({ webServer: { register(spec) { routes.set(spec.path, spec); return () => {} } }, effect: (fn) => fn() }),
  },
  {},
)
const callsBeforeOffline = fetchCalls.length
pricing = await call('/token-cost/pricing')
balance = await call('/token-cost/balance?local=1')
assertEqual('网络关掉时计价退回内置表', [pricing.body.source, pricing.body.doc.updatedAt], ['cache', '2026-12-01T00:00:00Z'])
assertEqual('网络关掉时余额返回 enabled:false', balance.body.enabled, false)
assertEqual('网络关掉时一次都没联网', fetchCalls.length, callsBeforeOffline)


// ── 会话总用量兜底（投影缺失的历史会话）───────────────────────
routes = new Map()
const events = [
  { type: 'request/header', time: 10, data: { header: { config: { model: 'deepseek-flash' } } } },
  { type: 'assistant/message', time: 20, data: { usage: { inputTokens: 1000, cacheReadTokens: 9000, cacheWriteTokens: 0, outputTokens: 500 } } },
  { type: 'assistant/message', time: 30, data: { usage: { inputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 100, outputTokens: 50 } } },
]
const sessionQueryStub = {
  async readSession(sessionId) {
    if (sessionId === 'bad') throw new Error('SESSION_NOT_FOUND')
    return { events }
  },
}
apply(
  {
    get: (name) => (name === 'sessionQuery' ? sessionQueryStub : undefined),
    inject: (names, callback) =>
      callback({ webServer: { register(spec) { routes.set(spec.path, spec); return () => {} } }, effect: (fn) => fn() }),
  },
  {},
)
assertEqual('注册了第四条路由', routes.has('/token-cost/session-usage'), true)
let usage = await call('/token-cost/session-usage?sessionId=a')
assertEqual('兜底用量按 provider 上报累加', usage.body.usage, {
  uncachedInputTokens: 1200,
  cacheReadTokens: 9000,
  cacheWriteTokens: 100,
  outputTokens: 550,
})
assertEqual('兜底同时给出模型与时间范围', [usage.body.model, usage.body.firstAt, usage.body.lastAt], ['deepseek-flash', 10, 30])
assertEqual('缺 sessionId 报 400', (await call('/token-cost/session-usage')).status, 400)
assertEqual('读不到会话报 404', (await call('/token-cost/session-usage?sessionId=bad')).status, 404)
const cachedUsage = await call('/token-cost/session-usage?sessionId=a')
assertEqual('兜底结果有短缓存（同一会话再问一次仍成功）', cachedUsage.status, 200)


// ── 逐事件定价：高峰/空闲档 + 真实费用路由 ─────────────────────
const { peakTierAt, EMBEDDED_PRICING: PRICING } = mod
assertEqual('北京 10:00 周一 = peak', peakTierAt(PRICING.peakRule, Date.parse('2026-11-09T02:00:00Z')), 'peak')
assertEqual('北京 12:30 = idle', peakTierAt(PRICING.peakRule, Date.parse('2026-11-09T04:30:00Z')), 'idle')
assertEqual('北京 15:00 = peak', peakTierAt(PRICING.peakRule, Date.parse('2026-11-09T07:00:00Z')), 'peak')
assertEqual('周六 10:00 = idle', peakTierAt(PRICING.peakRule, Date.parse('2026-11-14T02:00:00Z')), 'idle')

// 清掉前面测试改过的远程价表缓存，这里要用内置表算
fs.rmSync(path?.join?.(HOME, 'token-cost', 'pricing.json') ?? '', { force: true })
routes = new Map()
const costEvents = [
  { type: 'request/header', time: 1, data: { header: { config: { model: 'deepseek-flash' } } } },
  { type: 'assistant/message', time: Date.parse('2026-11-09T02:00:00Z'), data: { usage: { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } } },
  { type: 'assistant/message', time: Date.parse('2026-11-09T04:30:00Z'), data: { usage: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1_000_000 } } },
]
apply(
  {
    get: (name) => (name === 'sessionQuery' ? { async readSession() { return { events: costEvents } } } : undefined),
    inject: (names, callback) =>
      callback({ webServer: { register(spec) { routes.set(spec.path, spec); return () => {} } }, effect: (fn) => fn() }),
  },
  {},
)
const costRes = await call('/token-cost/costs?ids=a')
const costA = costRes.body?.costs?.a
assertEqual('按每个事件自己的时间取档：peak 1M 输入 2 元 + idle 1M 输出 4 元', Number(costA?.cost?.toFixed(2)), 6)
assertEqual('同时回报 token 汇总与模型', [costA?.usage?.outputTokens, costA?.model], [1_000_000, 'deepseek-flash'])
assertEqual('缺 ids 报 400', (await call('/token-cost/costs')).status, 400)


// ── Platform 账号汇总：余额 + 官方累计花费（total_costs）对账 ─────────
fs.appendFileSync(
  path.join(HOME, '.credentials.yaml'),
  'deepseek-account-platform/default:\n  kind: grant\n  payload:\n    token: account-grant-token-1234567890\n',
)
routes = new Map()
apply(
  {
    get: () => undefined,
    inject: (names, callback) =>
      callback({ webServer: { register(spec) { routes.set(spec.path, spec); return () => {} } }, effect: (fn) => fn() }),
  },
  { network: { balance: true }, balance: { readCredentials: true, rechargeTotal: 100 } },
)
fetchImpl = async (url) => {
  if (String(url).includes('get_user_summary')) {
    return {
      ok: true,
      json: async () => ({
        code: 0,
        msg: '',
        data: {
          biz_code: 0,
          biz_msg: '',
          biz_data: {
            normal_wallets: [{ currency: 'CNY', balance: '19.1158860800' }],
            bonus_wallets: [{ currency: 'CNY', balance: '0' }],
            total_costs: [{ currency: 'CNY', amount: '94.1760941200' }],
          },
        },
      }),
    }
  }
  return { ok: false, status: 500, json: async () => ({}) }
}
const platformBalance = await call('/token-cost/balance?local=91.675')
assertEqual('优先用 Platform 汇总：余额 = 充值余额', [platformBalance.body.ok, platformBalance.body.source, Number(platformBalance.body.total.toFixed(2))], [true, 'platform', 19.12])
assertEqual('官方累计花费读出来了', Number(platformBalance.body.officialTotalCost.toFixed(2)), 94.18)
assertEqual('一次读取就能算累计偏差（本地 − 官方）', Number(platformBalance.body.cumulativeGap.toFixed(3)), -2.501)
assertEqual('总额度 = 官方累计 + 充值余额 + 赠送余额', Number(platformBalance.body.totalCredit.toFixed(3)), 113.292)
assertEqual('配置了充值总额就能拆出赠送', [platformBalance.body.rechargeTotal, Number((platformBalance.body.totalCredit - 100).toFixed(2))], [100, 13.29])
assert('平台快照写进了账本（含官方累计花费）', JSON.parse(fs.readFileSync(path.join(HOME, 'token-cost', 'ledger.json'), 'utf8')).snapshots.some((s) => typeof s.officialTotalCost === 'number'))

fs.rmSync(HOME, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '全部通过' : failed + ' 项失败'}`)
process.exitCode = failed === 0 ? 0 : 1
