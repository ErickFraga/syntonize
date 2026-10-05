declare module 'react' {
  export type Key = string | number
  export type ReactNode = string | number | boolean | null | undefined | ReactElement | ReactNode[]
  export interface ReactElement { type: any; props: any; key: Key | null }
  export interface CSSProperties { [k: string]: string | number | undefined }
  export type SetStateAction<S> = S | ((prev: S) => S)
  export type Dispatch<A> = (value: A) => void
  export interface MutableRefObject<T> { current: T }
  export interface RefObject<T> { readonly current: T | null }
  export interface SyntheticEvent<T = Element> { currentTarget: T; target: EventTarget & T; preventDefault(): void; stopPropagation(): void }
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {}
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T> { key: string; shiftKey: boolean }
  export interface PointerEvent<T = Element> extends SyntheticEvent<T> { pointerId: number; clientX: number; clientY: number }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T> { clientX: number; clientY: number }
  export type DOMAttributes<T> = {
    children?: ReactNode
    onClick?: (e: MouseEvent<T>) => void
    onChange?: (e: ChangeEvent<T>) => void
    onSubmit?: (e: FormEvent<T>) => void
    onKeyDown?: (e: KeyboardEvent<T>) => void
    onPointerDown?: (e: PointerEvent<T>) => void
    onPointerMove?: (e: PointerEvent<T>) => void
    onPointerUp?: (e: PointerEvent<T>) => void
    onPointerCancel?: (e: PointerEvent<T>) => void
  }
  export type HTMLAttributes<T> = DOMAttributes<T> & { [k: string]: any }
  export type SVGProps<T> = DOMAttributes<T> & { [k: string]: any }
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>]
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void
  export function useMemo<T>(factory: () => T, deps: ReadonlyArray<unknown>): T
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: ReadonlyArray<unknown>): T
  export function useRef<T>(initial: T): MutableRefObject<T>
  export function useRef<T>(initial: T | null): RefObject<T>
  export function useId(): string
  export interface Context<T> { Provider: (props: { value: T; children?: ReactNode }) => ReactElement | null }
  export function createContext<T>(value: T): Context<T>
  export function useContext<T>(context: Context<T>): T
  export const Fragment: unique symbol
  export function createElement(type: any, props?: any, ...children: ReactNode[]): ReactElement
}
declare namespace React {
  type ReactNode = import('react').ReactNode
  type CSSProperties = import('react').CSSProperties
  type HTMLAttributes<T> = import('react').HTMLAttributes<T>
  type ReactElement = import('react').ReactElement
  type Key = import('react').Key
}
declare namespace JSX {
  interface Element extends React.ReactElement {}
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: React.Key }
  interface IntrinsicElements { [elem: string]: React.HTMLAttributes<any> & { ref?: any; key?: React.Key } }
}
