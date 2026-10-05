// Game logic - pure functions shared between client and server.
// Nothing in here talks to sockets or timers; the server orchestrates.

import type { Room, Player, GameRound, SpectrumCard, RoomSettings, Zone, TeamId, Side, TeamRoundState, NumericSetting, Message, MessageCode, MessageParams, ChatInput, ChatReaction } from './types.ts'
import { SCORING, LIMITS, CHAT_LIMITS, CHAT_REACTIONS, DEFAULT_SETTINGS, SETTINGS_OPTIONS, PLAYER_COLORS, TEAM_DEFAULT_TARGET, TEAM_RULES, settingOptionsFor } from './types.ts'
import { spectrumCards } from './cards.ts'

// ============================================
// RANDOM HELPERS
// ============================================

export function pickCard(usedIds: number[], rng: () => number = Math.random): SpectrumCard {
    const unused = spectrumCards.filter(c => !usedIds.includes(c.id))
    const pool = unused.length > 0 ? unused : spectrumCards
    return pool[Math.floor(rng() * pool.length)]
}

export function getRandomTarget(rng: () => number = Math.random): number {
    const span = LIMITS.TARGET_MAX - LIMITS.TARGET_MIN
    return LIMITS.TARGET_MIN + Math.floor(rng() * (span + 1))
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(existingCodes: Set<string>, rng: () => number = Math.random): string {
    for (let attempt = 0; attempt < 100; attempt++) {
        let code = ''
        for (let i = 0; i < 6; i++) {
            code += CODE_CHARS.charAt(Math.floor(rng() * CODE_CHARS.length))
        }
        if (!existingCodes.has(code)) return code
    }
    // Practically unreachable: 32^6 combinations. Fallback keeps uniqueness.
    return Date.now().toString(36).toUpperCase().slice(-6).padStart(6, 'X')
}

// ============================================
// VALIDATION
// ============================================

/** Builds a translatable message: the client turns codes into text in the player's language. */
export function msg(code: MessageCode, params?: MessageParams): Message {
    return params ? { code, params } : { code }
}

export function normalizeNickname(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    return raw.replace(/\s+/g, ' ').trim().slice(0, LIMITS.NICKNAME_MAX)
}

export function validateNickname(nickname: string): { ok: boolean; error?: Message } {
    if (nickname.length < LIMITS.NICKNAME_MIN) return { ok: false, error: msg('nickname_empty') }
    if (nickname.length > LIMITS.NICKNAME_MAX) return { ok: false, error: msg('nickname_too_long', { max: LIMITS.NICKNAME_MAX }) }
    return { ok: true }
}

export function normalizeRoomCode(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function stripAccents(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * The one real rule of the game: the clue cannot contain the words printed
 * on the card. We compare accent- and case-insensitively, word by word.
 */
export function validateClue(rawClue: unknown, card: SpectrumCard): { ok: boolean; clue: string; error?: Message } {
    const clue = typeof rawClue === 'string' ? rawClue.replace(/\s+/g, ' ').trim() : ''
    if (!clue) return { ok: false, clue, error: msg('clue_empty') }
    if (clue.length > LIMITS.CLUE_MAX) return { ok: false, clue, error: msg('clue_too_long', { max: LIMITS.CLUE_MAX }) }

    const clueWords = new Set(stripAccents(clue).split(/[^a-z0-9]+/).filter(w => w.length > 2))
    const forbidden = [card.leftConcept, card.rightConcept]
        .flatMap(c => stripAccents(c).split(/[^a-z0-9]+/))
        .filter(w => w.length > 2 && !STOP_WORDS.has(w))

    const hit = forbidden.find(w => clueWords.has(w))
    if (hit) return { ok: false, clue, error: msg('clue_uses_card_word', { word: hit }) }

    return { ok: true, clue }
}

/**
 * Chat input from an untrusted client: text is normalized (whitespace
 * collapsed, control characters dropped, trimmed) and limited to
 * CHAT_LIMITS.TEXT_MAX characters; reactions must be one of CHAT_REACTIONS.
 */
export function validateChatInput(raw: unknown): { ok: boolean; input?: ChatInput; error?: Message } {
    if (!raw || typeof raw !== 'object') return { ok: false, error: msg('chat_invalid') }
    const data = raw as Record<string, unknown>
    if (data.kind === 'reaction') {
        if (!CHAT_REACTIONS.includes(data.emoji as ChatReaction)) return { ok: false, error: msg('chat_invalid_reaction') }
        return { ok: true, input: { kind: 'reaction', emoji: data.emoji as ChatReaction } }
    }
    if (data.kind !== 'text' || typeof data.text !== 'string') return { ok: false, error: msg('chat_invalid') }
    // eslint-disable-next-line no-control-regex
    const text = data.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return { ok: false, error: msg('chat_empty') }
    if (Array.from(text).length > CHAT_LIMITS.TEXT_MAX) return { ok: false, error: msg('chat_too_long', { max: CHAT_LIMITS.TEXT_MAX }) }
    return { ok: true, input: { kind: 'text', text } }
}

/**
 * The seer cannot type while their round is open (only react), so the clue
 * or the target cannot leak through the chat.
 */
export function canSendChatText(room: Room, playerId: string): boolean {
    const round = room.currentRound
    return !(room.status === 'playing' && round && round.seerId === playerId && round.phase !== 'revealed')
}

const STOP_WORDS = new Set(['para', 'com', 'que', 'nao', 'sem', 'dos', 'das', 'uma', 'por', 'mais', 'muito', 'todo', 'tem', 'faz', 'se', 'de', 'em'])

export function sanitizeSettings(partial: Partial<RoomSettings>, current: RoomSettings = DEFAULT_SETTINGS): RoomSettings {
    const next: RoomSettings = { ...current }
    const input: Partial<RoomSettings> = partial && typeof partial === 'object' ? partial : {}

    // Switching modes resets the target to that mode's default (team points
    // add up much slower); an explicit valid targetScore below still wins.
    if ((input.mode === 'ffa' || input.mode === 'teams') && input.mode !== next.mode) {
        next.mode = input.mode
        next.targetScore = input.mode === 'teams' ? TEAM_DEFAULT_TARGET : DEFAULT_SETTINGS.targetScore
    }
    if (typeof input.catchUp === 'boolean') next.catchUp = input.catchUp

    for (const key of Object.keys(SETTINGS_OPTIONS) as NumericSetting[]) {
        const value = input[key]
        if (typeof value !== 'number' || !Number.isFinite(value)) continue
        if (settingOptionsFor(next.mode, key).includes(value)) next[key] = value
    }
    return next
}

// ============================================
// SCORING
// ============================================

export function zoneForDistance(distance: number): Zone {
    const d = Math.abs(distance)
    if (d <= SCORING.BULLSEYE_RANGE) return 4
    if (d <= SCORING.CLOSE_RANGE) return 3
    if (d <= SCORING.ACCEPTABLE_RANGE) return 2
    return 0
}

export function calculateScore(guess: number, target: number): number {
    return zoneForDistance(guess - target)
}

/**
 * Seer score: the rounded average of the guessers' base points.
 * A clue that puts everyone in the 4 earns 4; a clue nobody understood
 * earns 0. Keeps the seer's maximum in line with a guesser's.
 */
export function calculateSeerScore(zones: Zone[]): number {
    if (zones.length === 0) return 0
    const total = zones.reduce<number>((sum, z) => sum + z, 0)
    return Math.round(total / zones.length)
}

// ============================================
// ROOM & PLAYERS
// ============================================

export function nextColorIndex(players: Player[]): number {
    const used = new Set(players.map(p => p.colorIndex))
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
        if (!used.has(i)) return i
    }
    return players.length % PLAYER_COLORS.length
}

export function createPlayer(id: string, nickname: string, colorIndex: number, isHost = false, team: TeamId = 0): Player {
    return {
        team,
        id,
        nickname,
        score: 0,
        isHost,
        isConnected: true,
        colorIndex,
        hasGuessed: false,
        isReady: false,
        disconnectedAt: null,
    }
}

export function createRoom(code: string, host: Player, now: number = Date.now()): Room {
    return {
        code,
        players: [host],
        status: 'waiting',
        settings: { ...DEFAULT_SETTINGS },
        currentRound: null,
        roundHistory: [],
        seerOrder: [host.id],
        currentSeerIndex: 0,
        usedCardIds: [],
        winnerId: null,
        nextRoundAt: null,
        createdAt: now,
        teamScores: [0, 0],
        teamSeerIndex: [0, 0],
        nextTeam: 0,
        winnerTeam: null,
        chat: [],
    }
}

/** The team with fewer players (team 0 on a tie): keeps teams balanced on join. */
export function balancedTeam(players: Player[]): TeamId {
    const first = players.filter(p => p.team === 0).length
    return players.length - first < first ? 1 : 0
}

export function addPlayerToRoom(room: Room, player: Player): void {
    player.team = balancedTeam(room.players)
    room.players.push(player)
    room.seerOrder.push(player.id)
}

export function removePlayerFromRoom(room: Room, playerId: string): void {
    const removedIndex = room.seerOrder.indexOf(playerId)
    room.players = room.players.filter(p => p.id !== playerId)
    room.seerOrder = room.seerOrder.filter(id => id !== playerId)

    // Keep the rotation pointing at the same "next" player.
    if (removedIndex !== -1 && removedIndex < room.currentSeerIndex) {
        room.currentSeerIndex -= 1
    }
    if (room.seerOrder.length === 0) {
        room.currentSeerIndex = 0
    } else {
        room.currentSeerIndex = room.currentSeerIndex % room.seerOrder.length
    }

    ensureHost(room)
}

/** Guarantees exactly one host, preferring a connected player. */
export function ensureHost(room: Room): Player | null {
    if (room.players.length === 0) return null
    const hosts = room.players.filter(p => p.isHost)
    if (hosts.length === 1 && hosts[0].isConnected) return hosts[0]

    room.players.forEach(p => { p.isHost = false })
    const candidate = room.players.find(p => p.isConnected) ?? room.players[0]
    candidate.isHost = true
    return candidate
}

export function canJoinRoom(room: Room, nickname: string): { ok: boolean; error?: Message } {
    if (room.status === 'finished') {
        return { ok: false, error: msg('game_already_finished') }
    }
    if (room.players.length >= LIMITS.MAX_PLAYERS) {
        return { ok: false, error: msg('room_full', { max: LIMITS.MAX_PLAYERS }) }
    }
    if (room.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) {
        return { ok: false, error: msg('nickname_taken') }
    }
    return { ok: true }
}

export function canStartGame(room: Room): { ok: boolean; error?: Message } {
    const connected = room.players.filter(p => p.isConnected)
    if (connected.length < LIMITS.MIN_PLAYERS) {
        return { ok: false, error: msg('not_enough_players', { min: LIMITS.MIN_PLAYERS }) }
    }
    if (room.settings.mode === 'teams' && !([0, 1] as TeamId[]).every(t => canTeamPlay(room, t))) {
        return { ok: false, error: msg('team_needs_players', { min: TEAM_RULES.MIN_PER_TEAM }) }
    }
    return { ok: true }
}

// ============================================
// TEAMS
// ============================================

export function otherTeam(team: TeamId): TeamId {
    return team === 0 ? 1 : 0
}

/** Members of a team, in seer-rotation order. */
export function teamMembers(room: Room, team: TeamId): Player[] {
    return room.seerOrder
        .map(id => room.players.find(p => p.id === id))
        .filter((p): p is Player => !!p && p.team === team)
}

/** A team can take a turn with a connected seer and at least one connected guesser. */
export function canTeamPlay(room: Room, team: TeamId): boolean {
    return teamMembers(room, team).filter(p => p.isConnected).length >= TEAM_RULES.MIN_PER_TEAM
}

export function setPlayerTeam(room: Room, playerId: string, team: TeamId): boolean {
    const player = room.players.find(p => p.id === playerId)
    if (!player || (team !== 0 && team !== 1)) return false
    player.team = team
    return true
}

/** Team that plays the next round: the scheduled one, or the other if it cannot. */
export function pickTeamForRound(room: Room): TeamId | null {
    if (canTeamPlay(room, room.nextTeam)) return room.nextTeam
    const other = otherTeam(room.nextTeam)
    return canTeamPlay(room, other) ? other : null
}

/** Rotates the seer inside a team, skipping offline players. */
export function pickNextTeamSeer(room: Room, team: TeamId): string | null {
    const members = teamMembers(room, team)
    const n = members.length
    for (let step = 0; step < n; step++) {
        const idx = (room.teamSeerIndex[team] + step) % n
        if (members[idx].isConnected) {
            room.teamSeerIndex[team] = (idx + 1) % n
            return members[idx].id
        }
    }
    return null
}

function newTeamPlay(team: TeamId): TeamRoundState {
    return {
        team,
        needle: 50,
        guess: null,
        lockedBy: null,
        side: null,
        sideBy: null,
        zone: null,
        points: [0, 0],
        sideCorrect: null,
        catchUp: false,
    }
}

/** Which side of `guess` the target is on; null when it is exactly on it. */
export function sideOfTarget(guess: number, target: number): Side | null {
    if (target < guess) return 'left'
    if (target > guess) return 'right'
    return null
}

function clampPosition(position: number): number {
    return Math.round(Math.max(0, Math.min(100, position)))
}

function activeTeamGuesser(room: Room, playerId: string): { ok: boolean; error?: Message; player?: Player; play?: TeamRoundState } {
    const round = room.currentRound
    const play = round?.teamPlay
    if (!round || !play || round.phase !== 'guessing') return { ok: false, error: msg('not_guess_time') }
    if (round.seerId === playerId) return { ok: false, error: msg('seer_cannot_guess') }
    const player = room.players.find(p => p.id === playerId)
    if (!player) return { ok: false, error: msg('player_not_in_room') }
    if (player.team !== play.team) return { ok: false, error: msg('not_your_team_turn') }
    return { ok: true, player, play }
}

/** Live needle drag by any guesser of the active team. */
export function moveTeamNeedle(room: Room, playerId: string, position: number): { ok: boolean; error?: Message; position?: number } {
    const check = activeTeamGuesser(room, playerId)
    if (!check.ok) return { ok: false, error: check.error }
    if (typeof position !== 'number' || !Number.isFinite(position)) return { ok: false, error: msg('invalid_guess') }
    const clamped = clampPosition(position)
    check.play!.needle = clamped
    return { ok: true, position: clamped }
}

/** Any guesser of the active team locks the single team guess. */
export function submitTeamGuess(room: Room, playerId: string, position: number): { ok: boolean; error?: Message } {
    const check = activeTeamGuesser(room, playerId)
    if (!check.ok) return { ok: false, error: check.error }
    if (typeof position !== 'number' || !Number.isFinite(position)) return { ok: false, error: msg('invalid_guess') }
    lockTeamGuess(room, clampPosition(position), playerId)
    check.player!.hasGuessed = true
    return { ok: true }
}

/** Locks the team guess (also used when the guess timer runs out). */
export function lockTeamGuess(room: Room, position: number | null = null, lockedBy: string | null = null): void {
    const round = room.currentRound
    const play = round?.teamPlay
    if (!round || !play || round.phase !== 'guessing') return
    const guess = position ?? play.needle ?? 50
    play.needle = guess
    play.guess = guess
    play.lockedBy = lockedBy
    round.phase = 'side_guess'
}

export function submitSideGuess(room: Room, playerId: string, side: unknown): { ok: boolean; error?: Message } {
    const round = room.currentRound
    const play = round?.teamPlay
    if (!round || !play || round.phase !== 'side_guess') return { ok: false, error: msg('not_side_time') }
    const player = room.players.find(p => p.id === playerId)
    if (!player) return { ok: false, error: msg('player_not_in_room') }
    if (player.team === play.team) return { ok: false, error: msg('side_is_other_team') }
    if (side !== 'left' && side !== 'right') return { ok: false, error: msg('invalid_side') }
    if (play.side) return { ok: false, error: msg('side_already_called') }
    play.side = side
    play.sideBy = playerId
    return { ok: true }
}

/** Whether a connected guesser of the active team is still around. */
export function activeTeamHasGuessers(room: Room): boolean {
    const round = room.currentRound
    if (!round?.teamPlay) return false
    return teamMembers(room, round.teamPlay.team).some(p => p.id !== round.seerId && p.isConnected)
}

/** Whether the opposing team has someone connected to call the side. */
export function opposingTeamPresent(room: Room): boolean {
    const play = room.currentRound?.teamPlay
    if (!play) return false
    return teamMembers(room, otherTeam(play.team)).some(p => p.isConnected)
}

function processTeamRoundResults(room: Room, round: GameRound, play: TeamRoundState, now: number): GameRound {
    const target = round.targetPosition ?? 50
    const guess = play.guess ?? play.needle ?? 50
    play.guess = guess
    play.zone = zoneForDistance(guess - target)

    const points: [number, number] = [0, 0]
    points[play.team] = play.zone
    if (play.side) {
        play.sideCorrect = play.side === sideOfTarget(guess, target)
        if (play.sideCorrect) points[otherTeam(play.team)] = TEAM_RULES.SIDE_POINTS
    }
    play.points = points
    room.teamScores = [room.teamScores[0] + points[0], room.teamScores[1] + points[1]]

    // Catch-up rule from the original game: a bullseye by a team that is
    // still behind after scoring earns it another turn.
    const other = otherTeam(play.team)
    play.catchUp = room.settings.catchUp && play.zone === 4 && room.teamScores[play.team] < room.teamScores[other]
    room.nextTeam = play.catchUp ? play.team : other

    round.phase = 'revealed'
    round.revealedAt = now
    room.players.forEach(p => { p.isReady = false })
    room.roundHistory.push(round)
    room.nextRoundAt = now + room.settings.timeBetweenRounds * 1000

    const { targetScore, maxRounds } = room.settings
    const [a, b] = room.teamScores
    // A tie at the target keeps going: the next round breaks it.
    const reachedScore = Math.max(a, b) >= targetScore && a !== b
    const reachedRounds = maxRounds > 0 && room.roundHistory.length >= maxRounds
    if (reachedScore || reachedRounds) finishGame(room)
    return round
}

// ============================================
// ROUNDS
// ============================================

export function getSeer(room: Room): Player | undefined {
    return room.currentRound ? room.players.find(p => p.id === room.currentRound!.seerId) : undefined
}

export function getGuessers(room: Room): Player[] {
    const seerId = room.currentRound?.seerId
    return room.players.filter(p => p.id !== seerId)
}

/**
 * Advances the rotation to the next connected player and returns their id.
 * Returns null when nobody is connected.
 */
export function pickNextSeer(room: Room): string | null {
    const n = room.seerOrder.length
    if (n === 0) return null
    for (let step = 0; step < n; step++) {
        const idx = (room.currentSeerIndex + step) % n
        const id = room.seerOrder[idx]
        const player = room.players.find(p => p.id === id)
        if (player && player.isConnected) {
            room.currentSeerIndex = idx
            return id
        }
    }
    return null
}

export function startNewRound(room: Room, now: number = Date.now(), rng: () => number = Math.random): GameRound | null {
    const teams = room.settings.mode === 'teams'
    let seerId: string | null
    let teamPlay: TeamRoundState | null = null
    if (teams) {
        const team = pickTeamForRound(room)
        seerId = team === null ? null : pickNextTeamSeer(room, team)
        if (team !== null) teamPlay = newTeamPlay(team)
    } else {
        seerId = pickNextSeer(room)
    }
    if (!seerId) return null

    const card = pickCard(room.usedCardIds, rng)
    if (!room.usedCardIds.includes(card.id)) room.usedCardIds.push(card.id)
    if (room.usedCardIds.length >= spectrumCards.length) room.usedCardIds = []

    room.players.forEach(p => {
        p.hasGuessed = false
        p.isReady = false
    })

    const round: GameRound = {
        roundNumber: room.roundHistory.length + 1,
        seerId,
        spectrumCard: card,
        targetPosition: getRandomTarget(rng),
        clue: null,
        phase: 'waiting_clue',
        guesses: {},
        scores: {},
        zones: {},
        closestIds: [],
        startedAt: now,
        clueAt: null,
        revealedAt: null,
        teamPlay,
    }

    room.currentRound = round
    room.status = 'playing'
    room.nextRoundAt = null
    // Rotation moves on as soon as the round starts, so a seer who leaves
    // mid-round does not get picked again. (Team rotation already moved.)
    if (!teams) room.currentSeerIndex = (room.currentSeerIndex + 1) % Math.max(1, room.seerOrder.length)
    return round
}

export function submitGuess(room: Room, playerId: string, position: number): { ok: boolean; error?: Message } {
    if (room.currentRound?.teamPlay) return submitTeamGuess(room, playerId, position)
    const round = room.currentRound
    if (!round || round.phase !== 'guessing') return { ok: false, error: msg('not_guess_time') }
    if (round.seerId === playerId) return { ok: false, error: msg('seer_cannot_guess') }
    const player = room.players.find(p => p.id === playerId)
    if (!player) return { ok: false, error: msg('player_not_in_room') }
    if (player.hasGuessed) return { ok: false, error: msg('guess_already_locked') }
    if (typeof position !== 'number' || !Number.isFinite(position)) return { ok: false, error: msg('invalid_guess') }

    const clamped = Math.round(Math.max(0, Math.min(100, position)))
    player.hasGuessed = true
    round.guesses[playerId] = clamped
    return { ok: true }
}

export function allGuessersDone(room: Room): boolean {
    const round = room.currentRound
    if (!round || round.phase !== 'guessing') return false
    const pending = getGuessers(room).filter(p => p.isConnected && !p.hasGuessed)
    return pending.length === 0
}

export function processRoundResults(room: Room, now: number = Date.now()): GameRound | null {
    const round = room.currentRound
    if (!round || round.phase === 'revealed') return null
    if (round.teamPlay) return processTeamRoundResults(room, round, round.teamPlay, now)
    const target = round.targetPosition ?? 50

    let bestDistance = Infinity
    const zones: Zone[] = []

    for (const [playerId, position] of Object.entries(round.guesses)) {
        const distance = Math.abs(position - target)
        const zone = zoneForDistance(distance)
        round.zones[playerId] = zone
        round.scores[playerId] = zone
        zones.push(zone)
        if (zone > 0 && distance < bestDistance) bestDistance = distance
    }

    // Closest-guesser bonus only counts inside the wedge: missing the whole
    // target "by less than the others" is still a miss.
    round.closestIds = Object.entries(round.guesses)
        .filter(([, position]) => Math.abs(position - target) === bestDistance)
        .map(([playerId]) => playerId)

    for (const id of round.closestIds) {
        round.scores[id] += SCORING.CLOSEST_BONUS
    }

    round.scores[round.seerId] = calculateSeerScore(zones)

    for (const [playerId, points] of Object.entries(round.scores)) {
        const player = room.players.find(p => p.id === playerId)
        if (player) player.score += points
    }

    round.phase = 'revealed'
    round.revealedAt = now
    room.players.forEach(p => { p.isReady = false })
    room.roundHistory.push(round)
    room.nextRoundAt = now + room.settings.timeBetweenRounds * 1000

    const { targetScore, maxRounds } = room.settings
    const reachedScore = room.players.some(p => p.score >= targetScore)
    const reachedRounds = maxRounds > 0 && room.roundHistory.length >= maxRounds
    if (reachedScore || reachedRounds) {
        finishGame(room)
    }

    return round
}

export function finishGame(room: Room): void {
    room.status = 'finished'
    room.nextRoundAt = null
    if (room.settings.mode === 'teams') {
        const [a, b] = room.teamScores
        room.winnerTeam = a === b ? null : a > b ? 0 : 1
        room.winnerId = null
        return
    }
    const top = [...room.players].sort((a, b) => b.score - a.score)[0]
    room.winnerId = top ? top.id : null
}

export function allReady(room: Room): boolean {
    const connected = room.players.filter(p => p.isConnected)
    return connected.length > 0 && connected.every(p => p.isReady)
}

export function resetGameState(room: Room): void {
    room.players.forEach(p => {
        p.score = 0
        p.hasGuessed = false
        p.isReady = false
    })
    room.roundHistory = []
    room.usedCardIds = []
    room.currentSeerIndex = 0
    room.teamScores = [0, 0]
    room.teamSeerIndex = [0, 0]
    room.nextTeam = 0
    room.winnerTeam = null
    room.winnerId = null
    room.currentRound = null
    room.nextRoundAt = null
    room.status = 'waiting'
}

// ============================================
// CLIENT VIEW
// ============================================

/**
 * What a given player is allowed to see. The target is hidden from everyone
 * but the seer until the reveal, and so are the other players' guesses.
 */
export function roomViewFor(room: Room, viewerId: string | null): Room {
    const round = room.currentRound
    // The chat history goes in its own event (`chat:history`), not on every state.
    if (!round) return { ...room, chat: [] }

    const revealed = round.phase === 'revealed'
    const isSeer = viewerId === round.seerId

    const visibleRound: GameRound = {
        ...round,
        targetPosition: revealed || isSeer ? round.targetPosition : null,
        guesses: revealed
            ? round.guesses
            : viewerId && round.guesses[viewerId] !== undefined
                ? { [viewerId]: round.guesses[viewerId] }
                : {},
    }

    // Team mode: the live needle belongs to the active team until it locks.
    if (round.teamPlay) {
        const viewer = room.players.find(p => p.id === viewerId)
        const onActiveTeam = !!viewer && viewer.team === round.teamPlay.team
        const needleVisible = onActiveTeam || round.phase === 'side_guess' || revealed
        visibleRound.teamPlay = { ...round.teamPlay, needle: needleVisible ? round.teamPlay.needle : null }
    }

    return { ...room, chat: [], currentRound: visibleRound }
}

// ============================================
// STATS (for the results screen)
// ============================================

export interface PlayerStats {
    playerId: string
    bullseyes: number
    closest: number
    bestRound: number
    roundsAsSeer: number
    seerPoints: number
}

export function computeStats(room: Room): PlayerStats[] {
    return room.players.map(p => {
        const stats: PlayerStats = { playerId: p.id, bullseyes: 0, closest: 0, bestRound: 0, roundsAsSeer: 0, seerPoints: 0 }
        for (const r of room.roundHistory) {
            if (r.zones[p.id] === 4) stats.bullseyes++
            if (r.closestIds.includes(p.id)) stats.closest++
            if (r.seerId === p.id) {
                stats.roundsAsSeer++
                stats.seerPoints += r.scores[p.id] ?? 0
            }
            stats.bestRound = Math.max(stats.bestRound, r.scores[p.id] ?? 0)
        }
        return stats
    })
}

export interface TeamStats {
    team: TeamId
    rounds: number
    bullseyes: number
    /** Correct left/right calls against the other team. */
    sideHits: number
    catchUps: number
}

export interface SeerStats {
    playerId: string
    rounds: number
    points: number
}

export function computeTeamStats(room: Room): { teams: [TeamStats, TeamStats]; seers: SeerStats[] } {
    const teams: [TeamStats, TeamStats] = [0, 1].map(t => ({ team: t as TeamId, rounds: 0, bullseyes: 0, sideHits: 0, catchUps: 0 })) as [TeamStats, TeamStats]
    const seers = new Map<string, SeerStats>()
    for (const r of room.roundHistory) {
        const play = r.teamPlay
        if (!play) continue
        const own = teams[play.team]
        own.rounds++
        if (play.zone === 4) own.bullseyes++
        if (play.catchUp) own.catchUps++
        if (play.sideCorrect) teams[otherTeam(play.team)].sideHits++
        const seer = seers.get(r.seerId) ?? { playerId: r.seerId, rounds: 0, points: 0 }
        seer.rounds++
        seer.points += play.zone ?? 0
        seers.set(r.seerId, seer)
    }
    return { teams, seers: Array.from(seers.values()) }
}
