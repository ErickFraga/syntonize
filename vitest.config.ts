import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Testes de componente (React + Testing Library). Os testes do servidor e da
// lógica ficam em tests/*.test.ts e rodam no `node --test`; aqui só entram os
// `tests/components/**/*.test.tsx`, no jsdom.
export default defineConfig({
    // tsconfig usa `jsx: preserve` (quem compila é o Next); aqui o esbuild compila.
    esbuild: { jsx: 'automatic' },
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, 'shared'),
            '@': path.resolve(__dirname, 'src'),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['tests/components/**/*.test.tsx'],
        setupFiles: ['tests/components/setup.ts'],
        css: { modules: { classNameStrategy: 'non-scoped' } },
    },
})
