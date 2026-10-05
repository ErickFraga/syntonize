import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Syntonize',
        short_name: 'Syntonize',
        description: 'Sintonia online: descubra o que o outro está pensando, no celular.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#271A3A',
        theme_color: '#271A3A',
        icons: [
            { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-icon/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    }
}
