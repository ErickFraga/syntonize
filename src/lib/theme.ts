'use client'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'syntonize:theme'

/**
 * Runs before React hydrates (inlined in the layout) so the first paint
 * already has the right theme and there is no flash.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`

export function getTheme(): Theme {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: Theme): void {
    if (typeof document === 'undefined') return
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
    try {
        localStorage.setItem(THEME_KEY, theme)
    } catch {
        /* storage unavailable */
    }
}

export function toggleTheme(): Theme {
    const next: Theme = getTheme() === 'light' ? 'dark' : 'light'
    setTheme(next)
    return next
}
