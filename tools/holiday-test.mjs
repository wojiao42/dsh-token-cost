/**
 * 法定节假日峰谷判定：官方规则是「北京时间周一至周五（不含法定节假日）09:00–12:00、14:00–18:00 为高峰」。
 * 运行：node tools/holiday-test.mjs
 */
import assert from 'node:assert/strict'
import { holidayKeyAt, peakTierAt } from '../index.js'

const MS = (iso) => Date.parse(iso)
const base = { timeZone: 'Asia/Shanghai', weekdays: [1, 2, 3, 4, 5], ranges: [[9, 12], [14, 18]] }
const withHoliday = { ...base, holidays: ['2026-10-01'] }

// 基线：工作日 10:00 是高峰
assert.equal(peakTierAt(base, MS('2026-10-01T10:00:00+08:00')), 'peak', '工作日 10:00 应为高峰')

// 同一时刻列进节假日 → 空闲
assert.equal(peakTierAt(withHoliday, MS('2026-10-01T10:00:00+08:00')), 'idle', '节假日应全天空闲')

// 节假日也压过窗口边界：09:00 整点仍是空闲
assert.equal(peakTierAt(withHoliday, MS('2026-10-01T09:00:00+08:00')), 'idle', '节假日 09:00 应为空闲')

// 相邻工作日不受影响
assert.equal(peakTierAt(withHoliday, MS('2026-10-02T10:00:00+08:00')), 'peak', '非节假日 10-02 应为高峰')

// 日期键按规则时区取：2026-10-01T02:00Z = 北京 10:00
assert.equal(holidayKeyAt(MS('2026-10-01T02:00:00Z'), 'Asia/Shanghai'), '2026-10-01')
assert.equal(peakTierAt(withHoliday, MS('2026-10-01T02:00:00Z')), 'idle', '按 UTC 时间戳传入也应识别节假日')

// 周末仍然空闲，且不依赖 holidays
assert.equal(peakTierAt(base, MS('2026-11-07T10:00:00+08:00')), 'idle', '周六应为空闲')

// holidays 缺省/非法值不炸
assert.equal(peakTierAt({ ...base, holidays: undefined }, MS('2026-10-01T10:00:00+08:00')), 'peak')
assert.equal(peakTierAt({ ...base, holidays: 'not-an-array' }, MS('2026-10-01T10:00:00+08:00')), 'peak')

console.log('节假日峰谷判定：7 项通过')
