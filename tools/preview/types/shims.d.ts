declare module '*.module.css' { const classes: { readonly [key: string]: string }; export default classes }
declare module '*.css' {}
declare module 'next' {
  export interface Metadata { [k: string]: any }
  export interface Viewport { [k: string]: any }
}
declare module 'next/navigation' {
  export function useRouter(): { push(url: string): void; replace(url: string): void; back(): void }
  export function useParams(): Record<string, string | string[]>
}
declare module 'next/font/google' {
  interface FontOpts { subsets?: string[]; weight?: string[]; variable?: string; display?: string }
  interface FontResult { className: string; variable: string }
  export function Fredoka(o: FontOpts): FontResult
  export function Baloo_2(o: FontOpts): FontResult
  export function Nunito(o: FontOpts): FontResult
}
declare module 'socket.io-client' {
  export interface Socket<S = any, C = any> {
    id: string
    connected: boolean
    on<E extends keyof S>(event: E, listener: S[E]): this
    on(event: 'connect' | 'disconnect', listener: () => void): this
    off<E extends keyof S>(event: E, listener: S[E]): this
    off(event: 'connect' | 'disconnect', listener: () => void): this
    emit<E extends keyof C>(event: E, ...args: C[E] extends (...a: infer A) => any ? A : never): this
    disconnect(): this
  }
  export function io(opts?: any): Socket<any, any>
}
declare module 'next/headers' {
  export function cookies(): { get(name: string): { value: string } | undefined }
  export function headers(): { get(name: string): string | null }
}
