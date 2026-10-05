import { test, expect, dragDial, type Player } from './fixtures'

// Uma partida de verdade com dois jogadores, cada um no seu navegador:
// criar sala, entrar pelo convite, dar a dica, arrastar o dial, revelar e
// começar a rodada seguinte. Cada tela vira um print em e2e/prints/<projeto>/.

const CLUE_INPUT = 'Ex: pizza fria de ontem'

test('partida de dois jogadores, da home à segunda rodada', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana')
    const bia = await newPlayer('Bia')

    // Home
    await ana.page.goto('/')
    await expect(ana.page.getByRole('button', { name: 'Criar sala' })).toBeEnabled()
    await ana.print('home')

    // Ana cria a sala
    await ana.page.getByLabel('Seu apelido').fill(ana.name)
    await ana.page.getByRole('button', { name: 'Criar sala' }).click()
    await ana.page.waitForURL(/\/room\/[A-Z0-9]{6}$/)
    const code = ana.page.url().split('/').pop()!
    await expect(ana.page.getByRole('heading', { name: 'Chama a galera' })).toBeVisible()
    await ana.print('lobby sozinha')

    // Bia entra pelo link de convite
    await bia.page.goto(`/join/${code}`)
    await expect(bia.page.getByRole('button', { name: 'Entrar na sala' })).toBeEnabled()
    await bia.page.getByLabel('Seu apelido').fill(bia.name)
    await bia.print('convite')
    await bia.page.getByRole('button', { name: 'Entrar na sala' }).click()
    await bia.page.waitForURL(`**/room/${code}`)
    await expect(bia.page.getByText('Ana', { exact: true }).first()).toBeVisible()
    await expect(ana.page.getByText('Bia', { exact: true }).first()).toBeVisible()
    await bia.print('lobby convidada')
    await ana.print('lobby anfitriã')

    // Começa a partida
    await ana.page.getByRole('button', { name: 'Começar partida' }).click()
    await expect(ana.page.getByText('Rodada 1')).toBeVisible()
    await expect(bia.page.getByText('Rodada 1')).toBeVisible()

    await playRound(1, [ana, bia])

    // Os dois ficam prontos e a rodada 2 começa com o outro Vidente
    await ana.page.getByRole('button', { name: 'Pronto!' }).click()
    await bia.page.getByRole('button', { name: 'Pronto!' }).click()
    await expect(ana.page.getByText('Rodada 2')).toBeVisible()
    await expect(bia.page.getByText('Rodada 2')).toBeVisible()
    const seer = await findSeer([ana, bia])
    await seer.print('rodada 2 vidente')
})

async function findSeer(players: Player[]): Promise<Player> {
    let seer: Player | undefined
    await expect
        .poll(async () => {
            for (const p of players) {
                if (await p.page.getByPlaceholder(CLUE_INPUT).isVisible()) {
                    seer = p
                    return p.name
                }
            }
            return null
        }, { message: 'ninguém recebeu o campo de dica do Vidente' })
        .not.toBeNull()
    return seer!
}

async function playRound(n: number, players: Player[]) {
    const seer = await findSeer(players)
    const guesser = players.find(p => p !== seer)!

    // Vidente vê o alvo e pensa na dica; o outro espera com a tampa fechada
    await expect(seer.page.getByRole('heading', { name: 'Você é o Vidente' })).toBeVisible()
    await seer.print(`rodada ${n} vidente pensando`)
    await guesser.print(`rodada ${n} esperando dica`)

    await seer.page.getByPlaceholder(CLUE_INPUT).fill('Pizza fria')
    await seer.page.getByRole('button', { name: 'Enviar dica' }).click()

    // Palpite: arrastando o dial, nunca um slider
    const dial = guesser.page.getByRole('slider', { name: 'Ponteiro do espectro' })
    await expect(dial).toBeVisible()
    await expect(guesser.page.getByText('“Pizza fria”')).toBeVisible()
    await guesser.print(`rodada ${n} dica recebida`)

    await dragDial(guesser.page, 0.25)
    const value = Number(await dial.getAttribute('aria-valuenow'))
    expect(value, 'o dial não acompanhou o arrasto').toBeLessThan(45)
    await guesser.print(`rodada ${n} palpite arrastado`)
    await seer.print(`rodada ${n} vidente aguardando`)

    await guesser.page.getByRole('button', { name: 'Travar palpite' }).click()

    // Com o único palpite travado, a rodada revela para os dois
    for (const p of players) {
        await expect(p.page.getByRole('heading', { name: 'Resultado da rodada' })).toBeVisible()
    }
    // Espera a tampa abrir e a cunha aparecer antes do print
    await guesser.page.waitForTimeout(1500)
    await guesser.print(`rodada ${n} revelada`)
    await seer.print(`rodada ${n} revelada vidente`)
}
