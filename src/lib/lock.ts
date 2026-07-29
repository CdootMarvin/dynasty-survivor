// Client-side mirror of pick_lock_at() in supabase/schema.sql, used only to drive the UI
// (disabling the pick form, showing the lock time). The database enforces the real deadline
// via RLS using Postgres's own clock — this can't be used to bypass that, only to lie to the
// UI about whether it's locked, which a modified client could do anyway.

const LOCK_HOUR_CENTRAL = 19 // 7:00 PM

/** Returns the instant week `week` locks, given the pool's week-1 Thursday date (YYYY-MM-DD). */
export function getWeekLockAt(week: number, seasonStartThursday: string): Date {
  const [year, month, day] = seasonStartThursday.split('-').map(Number)
  const thursdayUtcGuess = new Date(Date.UTC(year, month - 1, day + (week - 1) * 7))
  return centralWallClockToInstant(
    thursdayUtcGuess.getUTCFullYear(),
    thursdayUtcGuess.getUTCMonth() + 1,
    thursdayUtcGuess.getUTCDate(),
    LOCK_HOUR_CENTRAL,
  )
}

export function isWeekLocked(week: number, seasonStartThursday: string | null): boolean {
  if (!seasonStartThursday) return false
  return new Date() >= getWeekLockAt(week, seasonStartThursday)
}

function centralWallClockToInstant(year: number, month: number, day: number, hour: number): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0))
  const offsetMinutes = getTimeZoneOffsetMinutes('America/Chicago', utcGuess)
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000)
}

/** Minutes to ADD to a UTC instant to get local wall-clock time in `timeZone`. */
function getTimeZoneOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  )
  return (asUtc - instant.getTime()) / 60_000
}
