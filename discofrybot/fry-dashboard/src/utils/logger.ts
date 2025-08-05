import { serviceSupabase } from '@/utils/supabase/serviceRole'

const MAX_LENGTH = 800

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
  const fullMessage = metadata ? `${message} | ${JSON.stringify(metadata)}` : message
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
