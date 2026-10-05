import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { DICTIONARIES, LOCALES, interpolate, matchLocale, translate, translateMessage, splitPlaceholders } from '../src/i18n/index.ts'
import { ptBR } from '../src/i18n/pt-BR.ts'
import { MESSAGE_CODES } from '../shared/types.ts'

const placeholders = (text: string) => new Set(Array.from(text.matchAll(/\{(\w+)\}/g), m => m[1]))
const forms = (entry: unknown): string[] => (typeof entry === 'string' ? [entry] : Object.values(entry as Record<string, string>))

describe('i18n', () => {
    test('every locale has every key, with the same placeholders and plural shape', () => {
        for (const locale of LOCALES) {
            const dict = DICTIONARIES[locale]
            for (const [key, source] of Object.entries(ptBR)) {
                const entry = dict[key as keyof typeof ptBR]
                assert.ok(entry, `${locale} is missing ${key}`)
                assert.equal(typeof entry, typeof source, `${locale}.${key} plural shape`)
                const expected = placeholders(forms(source).join(' '))
                for (const form of forms(entry)) {
                    assert.deepEqual(placeholders(form), expected, `${locale}.${key} placeholders`)
                    assert.ok(form.trim().length > 0 || key === 'common.youSuffix', `${locale}.${key} empty`)
                }
            }
        }
    })

    test('every server message code has a translation', () => {
        for (const code of MESSAGE_CODES) {
            assert.ok(`msg.${code}` in ptBR, `missing msg.${code}`)
        }
    })

    test('interpolation and plurals', () => {
        assert.equal(interpolate('Oi {name}, {name}!', { name: 'Ana' }), 'Oi Ana, Ana!')
        assert.equal(interpolate('sem {param}', {}), 'sem {param}', 'unknown placeholders stay visible')
        assert.equal(translate('pt-BR', 'lobby.missing', { count: 1 }), 'Falta 1 jogador')
        assert.equal(translate('pt-BR', 'lobby.missing', { count: 3 }), 'Faltam 3 jogadores')
        assert.equal(translate('en', 'score.played', { count: 1 }), '1 round played')
        assert.equal(translate('es', 'score.played', { count: 0 }), '0 rondas jugadas')
    })

    test('server messages are translated from code + params', () => {
        const message = { code: 'player_joined' as const, params: { name: 'Bia' } }
        assert.equal(translateMessage('pt-BR', message), 'Bia entrou na sala')
        assert.equal(translateMessage('en', message), 'Bia joined the room')
        assert.equal(translateMessage('es', message), 'Bia entró en la sala')
        assert.equal(translateMessage('en', undefined, 'error.joinRoom'), 'Couldn’t join the room')
        assert.equal(translateMessage('en', { code: 'nope' } as never), 'Something went wrong')
    })

    test('locale detection from navigator.language and Accept-Language', () => {
        assert.equal(matchLocale('pt-BR'), 'pt-BR')
        assert.equal(matchLocale('pt-PT'), 'pt-BR')
        assert.equal(matchLocale('en-US,en;q=0.9'), 'en')
        assert.equal(matchLocale('es-AR'), 'es')
        assert.equal(matchLocale('fr-FR,es;q=0.8'), 'es')
        assert.equal(matchLocale('de-DE'), null)
        assert.equal(matchLocale(''), null)
    })

    test('rich text split keeps text and placeholders in order', () => {
        assert.deepEqual(splitPlaceholders('Vez do {team}!'), [{ text: 'Vez do ' }, { key: 'team' }, { text: '!' }])
    })
})
