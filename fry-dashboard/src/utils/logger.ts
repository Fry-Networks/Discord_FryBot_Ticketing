import { serviceSupabase } from '@/utils/supabase/serviceRole'

const MAX_LENGTH = 800

// Reason: redact sensitive metadata keys before writing to shared log storage.
const SENSITIVE_META_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /set-cookie/i,
  /refresh[_-]?token/i,
  /client[_-]?secret/i,
  /service[_-]?role/i,
  /supabase/i,
  /mongo/i
]
const REDACTED_VALUE = '[REDACTED]'
const MAX_META_DEPTH = 4

// Reason: prevent accidental leakage of resolved secrets in metadata objects.
function redactMeta(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_META_DEPTH) return '[TRUNCATED]'
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (seen.has(value as object)) return '[CIRCULAR]'
  seen.add(value as object)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    }
  }

  if (Array.isArray(value)) {
    return value.map(item => redactMeta(item, depth + 1, seen))
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_META_KEY_PATTERNS.some(pattern => pattern.test(key))) {
      sanitized[key] = REDACTED_VALUE
      continue
    }
    sanitized[key] = redactMeta(fieldValue, depth + 1, seen)
  }
  return sanitized
}

export const logger = {
  async info(message: string, scope: string = 'dashboard', meta?: Record<string, unknown>) {
    await insertLog('info', message, scope, meta)
  },
  async warn(message: string, scope: string = 'dashboard', meta?: Record<string, unknown>) {
    await insertLog('warn', message, scope, meta)
  },
  async error(message: string, scope: string = 'dashboard', meta?: Record<string, unknown>) {
    await insertLog('error', message, scope, meta)
  }
}

async function insertLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  scope: string,
  metadata?: Record<string, unknown>
) {
  // Reason: sanitize metadata before it gets stringified into the log message.
  const safeMeta = metadata ? (redactMeta(metadata) as Record<string, unknown>) : undefined
  const fullMessage = safeMeta ? `${message} | ${JSON.stringify(safeMeta)}` : message
  const trimmedMessage =
    fullMessage.length > MAX_LENGTH
      ? fullMessage.slice(0, MAX_LENGTH) + '... [TRIMMED]'
      : fullMessage

  const { error } = await serviceSupabase
    .from('bot_logs')
    .insert({
      timestamp: new Date().toISOString(),
      level,
      scope,
      message: trimmedMessage
    })

  if (error) {
    console.error(`[logger.ts] Failed to insert log (${level}) in scope "${scope}":`, error.message)
  }
}
