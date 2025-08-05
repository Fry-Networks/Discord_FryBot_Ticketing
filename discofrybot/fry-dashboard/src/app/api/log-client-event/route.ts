import { NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { createClient } from '@/utils/supabase/server'
import { type Database } from '@/types/supabase'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function POST(req: Request) {
  const { level, message, scope } = await req.json()

  if (!level || !message || !scope) {
    return NextResponse.json({ error: 'Missing log fields' }, { status: 400 })
  }

  // Trim excessively long log messages
  const safeMessage = typeof message === 'string' ? message.slice(0, 1000) : String(message).slice(0, 1000)

  switch (level) {
    case 'info':
      await logger.info(safeMessage, scope)
      break
    case 'warn':
      await logger.warn(safeMessage, scope)
      break
    case 'error':
      await logger.error(safeMessage, scope)
      break
    default:
      return NextResponse.json({ error: 'Invalid log level' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = parseInt(searchParams.get('from') || '0', 10)
  const to = parseInt(searchParams.get('to') || '49', 10)
  const level = searchParams.get('level') || ''
  const scope = searchParams.get('scope') || ''
  const search = searchParams.get('search')?.trim()
  const order = searchParams.get('order') === 'asc' ? true : false

  const supabase = await createClient<Database>()
  let query = supabase
    .schema('api')
    .from('bot_logs')
    .select('*', { count: 'exact' })
    .order('timestamp', { ascending: order })

  // Always apply pagination range
  query = query.range(from, to)
  
  if (level) query.eq('level', level)
  if (scope) query.eq('scope', scope)
    if (search) {
      query = query.or(
        `message.ilike.%${search}%,scope.ilike.%${search}%,level.ilike.%${search}%`
      )
    }
  const { data, count, error } = await query

  if (error) {
    await logger.error(`Failed to fetch logs via API: ${error.message}`, 'log_api')
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }

  return NextResponse.json({
    logs: data || [],
    count: count || 0
  })
}