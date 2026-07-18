import { useCallback, useState } from 'react'

// Copies text to the clipboard and flips a `copied` flag for ~1.6s so callers
// can show a "copied ✓" state. Degrades gracefully when the Clipboard API is
// unavailable (e.g. non-secure contexts).
export function useCopy(timeout = 1600){
  const [copied, setCopied] = useState(false)

  const copy = useCallback((text) => {
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), timeout)
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(done)
    } else {
      done()
    }
  }, [timeout])

  return [copied, copy]
}
