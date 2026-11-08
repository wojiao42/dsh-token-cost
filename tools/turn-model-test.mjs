/**
 * 逐轮计价：用该轮每次调用自己的时间与模型，而不是会话级 modelSelection.lastUsed。
 * 运行：node tools/turn-model-test.mjs
 */
import assert from 'node:assert/strict'
import { foldTurns, priceTurnEvents } from '../index.js'

const MS = (iso) => Date.parse(iso)
const doc = {
  peakRule: { timeZone: 'Asia/Shanghai', weekdays: [1, 2, 3, 4, 5], ranges: [[9, 12], [14, 18]], holidays: [] },
  models: {
    'deepseek-flash': {
      idle: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
      peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
    },
    'deepseek-v4-pro': {
      idle: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
      peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
    },
  },
}

const attempt = (time, model, usage) => ({
  type: 'assistant/message',
  time,
  data: { usage, message: { source: { kind: 'model', provider: 'deepseek-account', model } } },
})

// 会话内换模型：各按各的价目
{
  const result = priceTurnEvents(
    [
      attempt(MS('2026-11-09T03:00:00+08:00'), 'deepseek-flash', { inputTokens: 1e6 }),
      attempt(MS('2026-11-09T04:00:00+08:00'), 'deepseek-v4-pro', { inputTokens: 1e6 }),
    ],
    doc,
  )
  assert.deepEqual(result.models.sort(), ['deepseek-flash', 'deepseek-v4-pro'])
  assert.ok(Math.abs(result.cost - 5.5) < 1e-9, String(result.cost))
}

// 同一轮内换模型 + 峰谷：flash 高峰 2.0 + pro 空闲 4.5
{
  const result = priceTurnEvents(
    [
      attempt(MS('2026-11-09T10:00:00+08:00'), 'deepseek-flash', { inputTokens: 1e6 }),
      attempt(MS('2026-11-09T20:00:00+08:00'), 'deepseek-v4-pro', { inputTokens: 1e6 }),
    ],
    doc,
  )
  assert.ok(Math.abs(result.cost - 6.5) < 1e-9, String(result.cost))
}

// 重试的两次尝试都计入
{
  const result = priceTurnEvents(
    [
      attempt(MS('2026-11-09T03:00:00+08:00'), 'deepseek-flash', { inputTokens: 1e6 }),
      { type: 'llm/retry-started', time: MS('2026-11-09T03:01:00+08:00'), data: {} },
      attempt(MS('2026-11-09T03:02:00+08:00'), 'deepseek-flash', { inputTokens: 1e6 }),
    ],
    doc,
  )
  assert.ok(Math.abs(result.cost - 2) < 1e-9, String(result.cost))
}

// 未知模型计 unpriced，不静默按 0 混入金额
{
  const result = priceTurnEvents([attempt(MS('2026-11-09T03:00:00+08:00'), 'mystery', { inputTokens: 1e6 })], doc)
  assert.equal(result.unpriced, 1)
  assert.equal(result.cost, null)
}

// 没有 usage 的调用不计、也不报 unpriced
{
  const result = priceTurnEvents([{ type: 'assistant/message', time: Date.now(), data: {} }], doc)
  assert.equal(result.unpriced, 0)
  assert.equal(result.cost, null)
}

// foldTurns 保持向后兼容：不传价目时不附带 cost 字段
{
  const events = [
    { type: 'turn/start', time: MS('2026-11-09T03:00:00+08:00'), data: { turn: 1 } },
    { type: 'step/start', time: MS('2026-11-09T03:00:01+08:00'), data: { turn: 1, step: 1 } },
    attempt(MS('2026-11-09T03:00:02+08:00'), 'deepseek-flash', { inputTokens: 10, outputTokens: 5 }),
    { type: 'step/end', time: MS('2026-11-09T03:00:03+08:00'), data: { turn: 1, step: 1 } },
    { type: 'turn/end', time: MS('2026-11-09T03:00:04+08:00'), data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  assert.equal('cost' in foldTurns(events)[0], false, '不传价目时不应出现 cost')
  const priced = foldTurns(events, undefined, doc)[0]
  assert.ok(typeof priced.cost === 'number')
  assert.deepEqual(priced.models, ['deepseek-flash'])
}

console.log('逐轮计价：7 项通过')
