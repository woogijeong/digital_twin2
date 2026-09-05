import { useEffect, useState } from 'react'
import type { ViewportTheme } from '../theme'

const STORAGE_KEY = 'twin-viewport-theme'

function initialViewportTheme(): ViewportTheme {
  return localStorage.getItem(STORAGE_KEY) === 'gray' ? 'gray' : 'black'
}

/** Persists the chosen 3D-viewport background (black / gray) independently of
 *  the page's light/dark theme -- the viewport itself stays dark-always. */
export function useViewportTheme() {
  const [viewportTheme, setViewportTheme] = useState<ViewportTheme>(initialViewportTheme)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, viewportTheme)
  }, [viewportTheme])

  const toggleViewportTheme = () => setViewportTheme((t) => (t === 'black' ? 'gray' : 'black'))
  return { viewportTheme, toggleViewportTheme }
}
