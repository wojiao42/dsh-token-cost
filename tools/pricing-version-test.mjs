/**
 * 价目版本化：按调用时刻选生效版本；旧结构（单版本/扁平）继续可用。
 * 运行：node tools/pricing-version-test.mjs
 */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { pickPriceVersion, priceAt } from '../index.js'
import { loadClientDefinition, createPlugin, createReact } from './lib/harness.mjs'

const MS = (iso) => Date.parse(iso)
const peakRule = { timeZone: 'Asia/Shanghai', weekdays: [1, 2, 3, 4, 5], ranges: [[9, 12], [14, 18]], holidays: [] }
const versions = [
  { from: '2026-09-10T00:00:00+08:00', to: '2026-11-01T00:00:00+08:00', idle: { cacheMiss: 1 }, peak: { cacheMiss: 2 } },
  { from: '2026-11-01T00:00:00+08:00', to: null, idle: { cacheMiss: 3 }, peak: { cacheMiss: 6 } },
]

// 版本边界
assert.equal(pickPriceVersion(versions, MS('2026-09-10T00:00:00+08:00')).version.peak.cacheMiss, 2)
assert.equal(pickPriceVersion(versions, MS('2026-10-31T23:59:59+08:00')).version.peak.cacheMiss, 2)
assert.equal(pickPriceVersion(versions, MS('2026-11-01T00:00:00+08:00')).version.peak.cacheMiss, 6)
assert.equal(pickPriceVersion(versions, MS('2026-11-02T00:00:00+08:00')).warning, null)

// 早于覆盖范围：用最早版本并告警
const early = pickPriceVersion(versions, MS('2026-08-01T00:00:00+08:00'))
assert.equal(early.version.peak.cacheMiss, 2)
assert.equal(early.warning, 'pricing-before-coverage')

// 旧结构兼容：单版本对象
assert.equal(pickPriceVersion({ idle: { cacheMiss: 9 }, peak: { cacheMiss: 18 } }, Date.now()).version.idle.cacheMiss, 9)

// priceAt：版本 + 峰谷一起生效
const doc = { peakRule, models: { m: versions } }
assert.equal(priceAt(doc, 'm', MS('2026-10-01T10:00:00+08:00')).table.cacheMiss, 2)
assert.equal(priceAt(doc, 'm', MS('2026-11-02T10:00:00+08:00')).table.cacheMiss, 6)
assert.equal(priceAt(doc, 'm', MS('2026-11-02T03:00:00+08:00')).table.cacheMiss, 3)
assert.equal(priceAt(doc, 'nope', Date.now()).table, null)

// 客户端 resolvePrice 吃同一份版本数组
const definition = await loadClientDefinition(fileURLToPath(new URL('../client.js', import.meta.url)))
const plugin = createPlugin(definition, createReact())
const clientResolve = plugin.__internals.resolvePrice
assert.equal(clientResolve(versions, MS('2026-10-01T10:00:00+08:00')).cacheMiss, 2)
assert.equal(clientResolve(versions, MS('2026-11-02T10:00:00+08:00')).cacheMiss, 6)
assert.equal(clientResolve(versions, MS('2026-08-03T10:00:00+08:00')).cacheMiss, 2)
assert.equal(clientResolve({ idle: { cacheMiss: 4 }, peak: { cacheMiss: 8 } }, MS('2026-10-01T10:00:00+08:00')).cacheMiss, 8)

console.log('价目版本化：12 项通过')
