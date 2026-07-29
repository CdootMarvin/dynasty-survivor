// Rows from Supabase, mirroring supabase/schema.sql

export interface Profile {
  id: string
  display_name: string
  created_at: string
}

export interface Pool {
  id: string
  name: string
  sleeper_league_id: string
  season: string
  invite_code: string
  created_by: string
  created_at: string
}

export interface PoolMember {
  pool_id: string
  user_id: string
  joined_at: string
}

export interface Pick {
  id: string
  pool_id: string
  user_id: string
  week: number
  sleeper_roster_id: number
  sleeper_manager_name: string
  created_at: string
}

// Shapes returned by the Sleeper API (subset of fields we actually use).
// Full reference: https://docs.sleeper.com/

export interface SleeperUser {
  user_id: string
  display_name: string
  avatar: string | null
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
}

export interface SleeperNflState {
  week: number
  season: string
  season_type: 'pre' | 'regular' | 'post'
}

// A pick joined with the live result computed from Sleeper matchup data.
export type PickResult = 'pending' | 'win' | 'loss'

export interface PickWithResult extends Pick {
  result: PickResult
}
