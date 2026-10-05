import { test, expect } from './fixtures'

// Modo espectador: Caio entra só para assistir. Fica fora do jogo (sem dial,
// sem "Pronto!", sem placar) mas vê a rodada, a dica e a revelação.

const CLUE_INPUT = 'Ex: pizza fria de ontem'

test('espectador assiste uma rodada sem jogar', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana')
    const bia = await newPlayer('Bia')
    const caio = await newPlayer('Caio')

    await ana.page.goto('/')
    await ana.page.getByLabel('Seu apelido').fill(ana.name)
    await ana.page.getByRole('button', { name: 'Criar sala' }).click()
    await ana.page.waitForURL(/\/room\/[A-Z0-9]{6}$/)
    const code = ana.page.url().split('/').pop()!

    await bia.page.goto(`/join/${code}`)
    await bia.page.getByLabel('Seu apelido').fill(bia.name)
    await bia.page.getByRole('button', { name: 'Entrar na sala' }).click()
    await bia.page.waitForURL(`**/room/${code}`)

    // Caio escolhe "Só assistir" no convite
    await caio.page.goto(`/join/${code}`)
    await caio.page.getByLabel('Seu apelido').fill(caio.name)
    await expect(caio.page.getByRole('button', { name: 'Só assistir' })).toBeEnabled()
    await caio.print('convite com so assistir')
    await caio.page.getByRole('button', { name: 'Só assistir' }).click()
    await caio.page.waitForURL(`**/room/${code}`)

    // Lobby: Caio aparece como espectador, não como jogador
    await expect(ana.page.getByText('1 espectador')).toBeVisible()
    await expect(ana.page.getByText('2/16')).toBeVisible()
    await ana.print('lobby com espectador')
    await caio.print('lobby do espectador')

    await ana.page.getByRole('button', { name: 'Começar partida' }).click()
    await expect(caio.page.getByText('Rodada 1')).toBeVisible()

    // Ana é a Vidente da rodada 1: dá a dica
    await ana.page.getByPlaceholder(CLUE_INPUT).fill('Pizza fria')
    await ana.page.getByRole('button', { name: 'Enviar dica' }).click()
    await expect(caio.page.getByText('“Pizza fria”')).toBeVisible()
    await expect(caio.page.getByRole('slider', { name: 'Ponteiro do espectro' })).toHaveCount(0)
    await expect(caio.page.getByRole('button', { name: 'Travar palpite' })).toHaveCount(0)
    await expect(caio.page.getByText('Os jogadores estão palpitando')).toBeVisible()
    await caio.print('rodada 1 espectador palpitando')

    await bia.page.getByRole('button', { name: 'Travar palpite' }).click()
    await expect(caio.page.getByRole('heading', { name: 'Resultado da rodada' })).toBeVisible()
    await caio.page.waitForTimeout(1500)
    await expect(caio.page.getByRole('button', { name: 'Pronto!' })).toHaveCount(0)
    await expect(caio.page.getByText('Assistindo', { exact: true }).first()).toBeVisible()
    await caio.print('rodada 1 espectador revelacao')

    // Ana e Bia ficam prontas: a rodada 2 começa sem esperar o espectador
    await ana.page.getByRole('button', { name: 'Pronto!' }).click()
    await bia.page.getByRole('button', { name: 'Pronto!' }).click()
    await expect(caio.page.getByText('Rodada 2')).toBeVisible()
    await caio.print('rodada 2 espectador')
})
