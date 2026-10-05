import { test, expect, dragDial, type Player } from './fixtures'

// Modo cooperativo com três jogadores: o anfitrião liga o modo no lobby, o
// grupo todo gira o mesmo ponteiro, e a partida acaba na rodada fixa com o
// veredito da meta. Cinco rodadas para o teste não demorar.

const CLUE_INPUT = 'Ex: pizza fria de ontem'

test('modo cooperativo: lobby, ponteiro compartilhado e fim de partida', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana')
    const bia = await newPlayer('Bia')
    const caio = await newPlayer('Caio')
    const all = [ana, bia, caio]

    await ana.page.goto('/')
    await ana.page.getByLabel('Seu apelido').fill(ana.name)
    await ana.page.getByRole('button', { name: 'Criar sala' }).click()
    await ana.page.waitForURL(/\/room\/[A-Z0-9]{6}$/)
    const code = ana.page.url().split('/').pop()!

    for (const p of [bia, caio]) {
        await p.page.goto(`/join/${code}`)
        await p.page.getByLabel('Seu apelido').fill(p.name)
        await p.page.getByRole('button', { name: 'Entrar na sala' }).click()
        await p.page.waitForURL(`**/room/${code}`)
    }
    await expect(ana.page.getByText('Caio', { exact: true }).first()).toBeVisible()

    // Anfitrião liga o cooperativo e fecha em 5 rodadas
    await ana.page.getByRole('radio', { name: 'Cooperativo' }).click()
    await ana.page.getByRole('radiogroup', { name: 'Limite de rodadas' }).getByRole('radio', { name: '5', exact: true }).click()
    await expect(bia.page.getByRole('radio', { name: 'Cooperativo', checked: true })).toBeVisible()
    await ana.print('lobby cooperativo anfitriã')
    await bia.print('lobby cooperativo convidada')

    await ana.page.getByRole('button', { name: 'Começar partida' }).click()
    for (const p of all) await expect(p.page.getByText('Rodada 1')).toBeVisible()

    for (let n = 1; n <= 5; n++) {
        const seer = await findSeer(all)
        const guessers = all.filter(p => p !== seer)
        await seer.page.getByPlaceholder(CLUE_INPUT).fill('Pizza fria')
        await seer.page.getByRole('button', { name: 'Enviar dica' }).click()

        const [first, second] = guessers
        const dial = second.page.getByRole('slider', { name: 'Ponteiro do espectro' })
        await expect(dial).toBeVisible()
        await expect(first.page.getByRole('button', { name: 'Travar palpite do grupo' })).toBeVisible()
        if (n === 1) await first.print('rodada 1 dica recebida')

        // Um do grupo arrasta; o outro (e o Vidente) veem o mesmo ponteiro
        await first.page.evaluate(() => window.scrollTo(0, 0)) // o clique em "Pronto!" deixou a página rolada
        await first.page.waitForTimeout(600) // deixa a animação de entrada do dial assentar
        await dragDial(first.page, 0.25)
        const mine = Number(await first.page.getByRole('slider', { name: 'Ponteiro do espectro' }).getAttribute('aria-valuenow'))
        expect(mine, 'o dial não acompanhou o arrasto').toBeLessThan(45)
        await expect(dial).toHaveAttribute('aria-valuenow', String(mine))
        if (n === 1) {
            await second.print('rodada 1 ponteiro compartilhado')
            await seer.print('rodada 1 vidente')
        }

        // Qualquer um do grupo trava: revela direto, sem fase de esquerda/direita
        await second.page.getByRole('button', { name: 'Travar palpite do grupo' }).click()
        // Na última rodada a revelação já cai direto na tela de fim de partida
        if (n < 5) for (const p of all) await expect(p.page.getByRole('heading', { name: 'Resultado da rodada' })).toBeVisible()
        if (n === 1) {
            await second.page.waitForTimeout(1500)
            await second.print('rodada 1 revelada')
        }

        if (n < 5) {
            for (const p of all) await p.page.getByRole('button', { name: 'Pronto!' }).click()
            for (const p of all) await expect(p.page.getByText(`Rodada ${n + 1}`).first()).toBeVisible()
        }
    }

    // Fim: o veredito do grupo, igual para todos
    for (const p of all) await expect(p.page.getByRole('heading', { level: 1 })).toContainText(/meta/i)
    await ana.print('fim cooperativo')
    await caio.print('fim cooperativo convidado')
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
