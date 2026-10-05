// Service worker do Syntonize. O jogo é todo em tempo real (Socket.io), então
// só guardamos o que não muda: arquivos estáticos do build, fontes, ícones e
// uma página offline. Navegação sempre tenta a rede primeiro.
const CACHE = 'syntonize-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE_URL)))
    self.skipWaiting()
})

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim()),
    )
})

self.addEventListener('fetch', event => {
    const { request } = event
    if (request.method !== 'GET') return
    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return
    if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api/')) return

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
        return
    }

    const immutable =
        url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/pwa-icon/') ||
        url.pathname.startsWith('/audio/')
    if (!immutable) return

    event.respondWith(
        caches.match(request).then(
            hit =>
                hit ||
                fetch(request).then(response => {
                    if (response.ok) {
                        const copy = response.clone()
                        caches.open(CACHE).then(cache => cache.put(request, copy))
                    }
                    return response
                }),
        ),
    )
})
