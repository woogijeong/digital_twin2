import { useEffect, useState } from 'react'

const STORAGE_KEY = 'twin-show-pallet'

function initial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Persists whether the reference pallet model is shown in the 3D viewport.
 *  Defaults on. */
export function usePalletVisible() {
  const [palletVisible, setPalletVisible] = useState<boolean>(initial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, palletVisible ? 'on' : 'off')
    } catch {
      /* storage unavailable — the toggle still works for this session */
    }
  }, [palletVisible])

  const togglePallet = () => setPalletVisible((v) => !v)
  return { palletVisible, togglePallet }
}
