import { test, expect, type Player } from './fixtures'

// Fluxo de salas: criar, sair, entrar por convite em outra, recarregar a página
// e entrar pelo código. Cobre o bug em que quem já tinha uma sala voltava sempre
// para ela ao abrir o convite de uma sala nova.

async function criarSala(p: Player): Promise<string> {
    await p.page.goto('/')
    await expect(p.page.getByRole('button', { name: 'Criar sala' })).toBeEnabled()
    await p.page.getByLabel('Seu apelido').fill(p.name)
    await p.page.getByRole('button', { name: 'Criar sala' }).click()
    await p.page.waitForURL(/\/room\/[A-Z0-9]{6}$/)
    await expect(p.page.getByRole('heading', { name: 'Chama a galera' })).toBeVisible()
    return p.page.url().split('/').pop()!
}

async function entrarPeloConvite(p: Player, code: string) {
    await p.page.goto(`/join/${code}`)
    await expect(p.page.getByRole('button', { name: 'Entrar na sala' })).toBeEnabled()
    await expect(p.page.getByText(`código ${code}`)).toBeVisible()
    await p.page.getByLabel('Seu apelido').fill(p.name)
    await p.page.getByRole('button', { name: 'Entrar na sala' }).click()
    await p.page.waitForURL(`**/room/${code}`)
    await expect(p.page.getByRole('heading', { name: 'Chama a galera' })).toBeVisible()
}

test('sai da sala e entra pelo convite de outra sem voltar para a primeira', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana')
    const bia = await newPlayer('Bia')

    const salaA = await criarSala(ana)
    await ana.page.getByRole('button', { name: 'Sair' }).click()
    await ana.page.waitForURL(/\/$/)

    const salaB = await criarSala(bia)
    expect(salaB).not.toBe(salaA)

    await entrarPeloConvite(ana, salaB)
    await expect(ana.page).toHaveURL(new RegExp(`/room/${salaB}$`))
    await expect(bia.page.getByText('Ana', { exact: true }).first()).toBeVisible()
    await ana.print('entrou na sala nova depois de sair')

    // Segue na sala nova depois de recarregar
    await ana.page.reload()
    await expect(ana.page.getByRole('heading', { name: 'Chama a galera' })).toBeVisible()
    await expect(ana.page).toHaveURL(new RegExp(`/room/${salaB}$`))
})

test('convite de outra sala abre o convite mesmo com sala ativa, e entrar tira da anterior', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana')
    const bia = await newPlayer('Bia')
    const cai = await newPlayer('Cai')

    const salaA = await criarSala(ana)
    // Cai entra na sala A para ela continuar existindo depois que Ana sair.
    await entrarPeloConvite(cai, salaA)
    const salaB = await criarSala(bia)

    // Ana ainda está na sala A e abre o convite da B: fica no convite, não volta pra A.
    await ana.page.goto(`/join/${salaB}`)
    await expect(ana.page.getByText(`código ${salaB}`)).toBeVisible()
    await expect(ana.page.getByRole('button', { name: 'Entrar na sala' })).toBeEnabled()
    await expect(ana.page).toHaveURL(new RegExp(`/join/${salaB}$`))
    await ana.print('convite com outra sala ativa')

    await ana.page.getByRole('button', { name: 'Entrar na sala' }).click()
    await ana.page.waitForURL(`**/room/${salaB}`)
    await expect(bia.page.getByText('Ana', { exact: true }).first()).toBeVisible()
    // Ana saiu da sala A: Cai não vê mais a Ana lá.
    await expect(cai.page.getByText('Ana', { exact: true })).toHaveCount(0)

    // O mesmo vale para abrir direto /room/<outra sala>
    await cai.page.goto(`/room/${salaB}`)
    await expect(cai.page.getByText(`código ${salaB}`)).toBeVisible()
    await expect(cai.page).toHaveURL(new RegExp(`/join/${salaB}$`))
})

test('recarregar volta para a mesma sala e entrar pelo código na home funciona', async ({ newPlayer }) => {
    const ana = await newPlayer('Ana')
    const bia = await newPlayer('Bia')

    const sala = await criarSala(ana)
    await ana.page.reload()
    await expect(ana.page.getByRole('heading', { name: 'Chama a galera' })).toBeVisible()
    await expect(ana.page).toHaveURL(new RegExp(`/room/${sala}$`))

    await bia.page.goto('/')
    await bia.page.getByLabel('Seu apelido').fill(bia.name)
    await bia.page.getByLabel('Código da sala').fill(sala)
    await bia.page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await bia.page.waitForURL(`**/room/${sala}`)
    await expect(ana.page.getByText('Bia', { exact: true }).first()).toBeVisible()
})
