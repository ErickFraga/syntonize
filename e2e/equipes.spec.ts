import { test, expect, dragDial, type Player } from './fixtures'

// Modo em equipes com quatro jogadores: lobby (embaralhar times, pílula de
// idioma) e a fase "esquerda ou direita" com o botão Confirmar.

const CLUE_INPUT = 'Ex: pizza fria de ontem'

test('equipes: embaralhar times e confirmar esquerda ou direita', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana')
    const others = [await newPlayer('Bia'), await newPlayer('Caio'), await newPlayer('Duda')]
    const all = [ana, ...others]

    await ana.page.goto('/')
    // Pílula de idioma: PT · EN · ES
    const lang = ana.page.getByRole('radiogroup', { name: 'Idioma' })
    await expect(lang.getByRole('radio', { name: 'Português' })).toHaveAttribute('aria-checked', 'true')
    await ana.print('home com pilula de idioma')

    await ana.page.getByLabel('Seu apelido').fill(ana.name)
    await ana.page.getByRole('button', { name: 'Criar sala' }).click()
    await ana.page.waitForURL(/\/room\/[A-Z0-9]{6}$/)
    const code = ana.page.url().split('/').pop()!

    for (const p of others) {
        await p.page.goto(`/join/${code}`)
        await p.page.getByLabel('Seu apelido').fill(p.name)
        await p.page.getByRole('button', { name: 'Entrar na sala' }).click()
        await p.page.waitForURL(`**/room/${code}`)
    }
    await expect(ana.page.getByText('Duda', { exact: true }).first()).toBeVisible()

    await ana.page.getByRole('radio', { name: 'Em equipes' }).click()
    const shuffle = ana.page.getByRole('button', { name: 'Embaralhar times' })
    await expect(shuffle).toBeVisible()
    await expect(others[0].page.getByRole('button', { name: 'Embaralhar times' })).toHaveCount(0)
    await ana.print('lobby equipes antes de embaralhar')
    await shuffle.click()
    await ana.print('lobby equipes depois de embaralhar')

    await ana.page.getByRole('button', { name: 'Começar partida' }).click()
    const seer = await findSeer(all)
    await seer.page.getByPlaceholder(CLUE_INPUT).fill('Pizza fria')
    await seer.page.getByRole('button', { name: 'Enviar dica' }).click()

    // Quem pode palpitar (time da vez) trava; o outro time chama o lado.
    const guesser = await firstWith(all, p => p.page.getByRole('button', { name: 'Travar palpite' }).isVisible(), 'ninguém pôde travar o palpite')
    await dragDial(guesser.page, 0.25)
    await guesser.page.getByRole('button', { name: 'Travar palpite' }).click()

    const caller = await firstWith(all, p => p.page.getByRole('button', { name: 'Esquerda' }).isVisible(), 'ninguém viu a pergunta de lado')
    const confirm = caller.page.getByRole('button', { name: 'Confirmar', exact: true })
    await expect(confirm).toBeDisabled()
    await caller.print('lado sem escolha')
    await caller.page.getByRole('button', { name: 'Esquerda' }).click()
    await expect(caller.page.getByRole('button', { name: 'Confirmar esquerda' })).toBeEnabled()
    await caller.print('lado escolhido aguardando confirmar')
    await caller.page.getByRole('button', { name: 'Confirmar esquerda' }).click()
    await expect(caller.page.getByRole('heading', { name: 'Resultado da rodada' })).toBeVisible()
    await caller.page.waitForTimeout(1500)
    await caller.print('lado confirmado revelado')
})

async function findSeer(players: Player[]): Promise<Player> {
    return firstWith(players, p => p.page.getByPlaceholder(CLUE_INPUT).isVisible(), 'ninguém recebeu o campo de dica do Vidente')
}

async function firstWith(players: Player[], test: (p: Player) => Promise<boolean>, message: string): Promise<Player> {
    let found: Player | undefined
    await expect
        .poll(async () => {
            for (const p of players) {
                if (await test(p)) {
                    found = p
                    return p.name
                }
            }
            return null
        }, { message })
        .not.toBeNull()
    return found!
}
