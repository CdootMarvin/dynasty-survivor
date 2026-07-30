// Keep in sync with pick_half in supabase/schema.sql.
//
// A manager can only be picked once per "half" of the season (weeks 1-8, then 9-18) rather
// than once for the whole season — a strict full-season no-reuse rule runs out of pickable
// managers before the season ends for typical dynasty league sizes (10-14 teams).

export const RESET_WEEK = 9

export function pickHalf(week: number): 1 | 2 {
  return week < RESET_WEEK ? 1 : 2
}
