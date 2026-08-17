import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWeekLockAt, isWeekLocked } from './lock'

describe('getWeekLockAt', () => {
  it('locks week 1 at 7:00 PM Central on season_start_thursday itself', () => {
    // 2026-09-03 is CDT (UTC-5): 19:00 CDT == 00:00 UTC the next day.
    expect(getWeekLockAt(1, '2026-09-03')).toEqual(new Date('2026-09-04T00:00:00Z'))
  })

  it('advances by 7 days per week', () => {
    expect(getWeekLockAt(2, '2026-09-03')).toEqual(new Date('2026-09-11T00:00:00Z'))
    expect(getWeekLockAt(5, '2026-09-03')).toEqual(new Date('2026-10-02T00:00:00Z'))
  })

  it('uses the CDT (UTC-5) offset before the DST fall-back', () => {
    // Thursday 2026-10-29, before DST ends (2026-11-01).
    expect(getWeekLockAt(9, '2026-09-03')).toEqual(new Date('2026-10-30T00:00:00Z'))
  })

  it('uses the CST (UTC-6) offset after the DST fall-back', () => {
    // Thursday 2026-11-05, after DST ends (2026-11-01) -> UTC-6, so 19:00 local == 01:00 UTC next day.
    expect(getWeekLockAt(10, '2026-09-03')).toEqual(new Date('2026-11-06T01:00:00Z'))
  })
})

describe('isWeekLocked', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is always false when season_start_thursday is null (locking disabled)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z'))
    expect(isWeekLocked(1, null)).toBe(false)
  })

  it('is false right before the lock instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T23:59:59Z'))
    expect(isWeekLocked(1, '2026-09-03')).toBe(false)
  })

  it('is true at and after the lock instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T00:00:00Z'))
    expect(isWeekLocked(1, '2026-09-03')).toBe(true)

    vi.setSystemTime(new Date('2026-09-04T00:00:01Z'))
    expect(isWeekLocked(1, '2026-09-03')).toBe(true)
  })
})
