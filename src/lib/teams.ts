import { TEAM_COLORS, type TeamId } from '@/types/game'

export const TEAM_IDS: readonly TeamId[] = [0, 1]

export function teamColor(team: TeamId): string {
    return TEAM_COLORS[team]
}

const TEAM_NAMES = ['Time Turquesa', 'Time Rosa'] as const

export function teamName(team: TeamId): string {
    return TEAM_NAMES[team]
}
