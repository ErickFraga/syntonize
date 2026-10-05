import { TEAM_COLORS, type TeamId } from '@/types/game'
import type { TranslationKey } from '@/i18n'

export const TEAM_IDS: readonly TeamId[] = [0, 1]

export function teamColor(team: TeamId): string {
    return TEAM_COLORS[team]
}

/** Dictionary key of a team's name (translated with `t`). */
export function teamKey(team: TeamId): TranslationKey {
    return team === 0 ? 'team.0' : 'team.1'
}
