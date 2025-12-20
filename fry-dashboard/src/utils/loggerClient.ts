export async function log(
    level: 'info' | 'warn' | 'error',
    scope: string,
    message: string
  ) {
    try {
      await fetch('/api/log-client-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, scope, message })
      })
    } catch (err) {
      console.warn(`[log-client-event] Failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  