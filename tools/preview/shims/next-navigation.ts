export function useRouter() { return { push() {}, replace() {}, back() {} } }
export function useParams() { return (globalThis as any).__params || {} }
export function usePathname() { return '/' }
