import { Fragment } from './shims/react.ts'
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link'])
const ATTR: Record<string, string> = {
  className: 'class', htmlFor: 'for', tabIndex: 'tabindex', autoFocus: 'autofocus', autoComplete: 'autocomplete',
  autoCapitalize: 'autocapitalize', maxLength: 'maxlength', readOnly: 'readonly', strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset', floodColor: 'flood-color', floodOpacity: 'flood-opacity', stopColor: 'stop-color',
  stopOpacity: 'stop-opacity', fillOpacity: 'fill-opacity', fillRule: 'fill-rule', clipPath: 'clip-path', clipRule: 'clip-rule',
  fontSize: 'font-size', fontFamily: 'font-family', fontWeight: 'font-weight', textAnchor: 'text-anchor',
  dominantBaseline: 'dominant-baseline', xmlnsXlink: 'xmlns:xlink', defaultValue: 'value',
}
const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'fontWeight', 'lineHeight', 'order', 'zoom'])
const esc = (s: any) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function styleStr(style: Record<string, any>) {
  return Object.entries(style).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => {
    const name = k.startsWith('--') ? k : k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
    const val = typeof v === 'number' && !UNITLESS.has(k) && !k.startsWith('--') ? `${v}px` : v
    return `${name}:${val}`
  }).join(';')
}
export function renderToString(node: any): string {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return esc(node)
  if (Array.isArray(node)) return node.map(renderToString).join('')
  const { type, props } = node
  if (type === Fragment) return renderToString(props.children)
  if (typeof type === 'function') return renderToString(type(props))
  let attrs = ''
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref' || k.startsWith('on') || v === undefined || v === null || v === false) continue
    if (k === 'style' && typeof v === 'object') { attrs += ` style="${esc(styleStr(v as any))}"`; continue }
    if (k === 'dangerouslySetInnerHTML') continue
    const name = ATTR[k] ?? k
    attrs += v === true ? ` ${name}` : ` ${name}="${esc(v)}"`
  }
  if (VOID.has(type)) return `<${type}${attrs}>`
  return `<${type}${attrs}>${renderToString(props.children)}</${type}>`
}
