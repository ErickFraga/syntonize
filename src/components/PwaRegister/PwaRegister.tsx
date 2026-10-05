'use client'

import { useEffect } from 'react'

/** Registers the service worker (production only, so dev hot reload isn't cached). */
export default function PwaRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
        navigator.serviceWorker.register('/sw.js').catch(() => {})
    }, [])
    return null
}
