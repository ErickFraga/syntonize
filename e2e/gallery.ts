import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PRINTS_DIR } from './fixtures'

/**
 * Depois da rodada de testes, junta os prints em e2e/prints/index.html:
 * uma página só, um bloco por projeto (desktop, mobile, claro), na ordem do fluxo.
 */
export default function gallery(): void {
    if (!existsSync(PRINTS_DIR)) return
    const projects = readdirSync(PRINTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort()
    const sections = projects.map(project => {
        const shots = readdirSync(path.join(PRINTS_DIR, project)).filter(f => f.endsWith('.png')).sort()
        const figures = shots
            .map(f => `<figure><a href="${project}/${f}"><img loading="lazy" src="${project}/${f}" alt="${f}"></a><figcaption>${f.replace(/\.png$/, '')}</figcaption></figure>`)
            .join('\n')
        return `<section><h2>${project}</h2><div class="grid ${project.startsWith('mobile') ? 'mobile' : ''}">${figures}</div></section>`
    })
    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prints do fluxo · Syntonize</title>
<style>
body{margin:0;padding:24px;font:14px system-ui,sans-serif;background:#1d1726;color:#f4ecff}
h1{margin:0 0 4px}p{margin:0 0 24px;opacity:.7}h2{margin:32px 0 12px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));align-items:start}
.grid.mobile{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
figure{margin:0;background:#2a2236;border-radius:12px;padding:8px}
img{width:100%;display:block;border-radius:6px}figcaption{padding:6px 2px 0;opacity:.8}
</style></head><body>
<h1>Prints do fluxo</h1><p>Gerado em ${new Date().toISOString()}</p>
${sections.join('\n')}
</body></html>`
    writeFileSync(path.join(PRINTS_DIR, 'index.html'), html)
}
