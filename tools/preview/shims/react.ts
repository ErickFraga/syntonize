// Minimal static-render React shim: enough to execute components once.
export const Fragment = Symbol.for('fragment')
export function createElement(type: any, props: any, ...children: any[]) {
  const p = { ...(props || {}) }
  if (children.length) p.children = children.length === 1 ? children[0] : children
  return { type, props: p }
}
export function useState<T>(init: T | (() => T)) {
  const v = typeof init === 'function' ? (init as () => T)() : init
  return [v, (_: any) => {}] as const
}
export function useEffect() {}
export function useLayoutEffect() {}
export function useMemo<T>(fn: () => T) { return fn() }
export function useCallback<T>(fn: T) { return fn }
export function useRef<T>(v: T) { return { current: v } }
export function useId() { return 'id' }
export function forwardRef(fn: any) { return fn }
export function memo(fn: any) { return fn }
const React = { createElement, Fragment, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, useId, forwardRef, memo }
export default React
