import { plugin } from 'bun'
import { readFileSync } from 'fs'
import { basename } from 'path'
const g = globalThis as any
g.__cssRegistry = g.__cssRegistry || []
plugin({
  name: 'css-modules-static',
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, (args) => {
      const prefix = basename(args.path).replace('.module.css', '') + '_'
      const css = readFileSync(args.path, 'utf8').replace(/\.(?=[a-zA-Z_])([a-zA-Z_][\w-]*)/g, (_m, name) => '.' + prefix + name)
      g.__cssRegistry.push(`/* ${basename(args.path)} */\n${css}`)
      return {
        contents: `export default new Proxy({}, { get: (_, k) => typeof k === 'string' ? ${JSON.stringify(prefix)} + k : undefined })`,
        loader: 'js',
      }
    })
  },
})
