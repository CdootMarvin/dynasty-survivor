import { describe, expect, it } from 'vitest'
import { RESET_WEEK, pickHalf } from './pickRules'

describe('pickHalf', () => {
  it('returns 1 for every week before the reset week', () => {
    for (let week = 1; week < RESET_WEEK; week++) {
      expect(pickHalf(week)).toBe(1)
    }
  })

  it('returns 2 for the reset week and every week after', () => {
    for (let week = RESET_WEEK; week <= 18; week++) {
      expect(pickHalf(week)).toBe(2)
    }
  })

  it('flips exactly at week 9', () => {
    expect(pickHalf(8)).toBe(1)
    expect(pickHalf(9)).toBe(2)
  })
})
