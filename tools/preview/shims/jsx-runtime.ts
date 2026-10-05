import { Fragment } from './react.ts'
export { Fragment }
export function jsx(type: any, props: any, key?: any) { return { type, props: props || {}, key } }
export const jsxs = jsx
export const jsxDEV = jsx
