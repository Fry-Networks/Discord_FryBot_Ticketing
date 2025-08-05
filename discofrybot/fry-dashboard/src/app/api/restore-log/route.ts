import { NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { createClient } from '@/utils/supabase/server'
import { type Database } from '@/types/supabase'

export async function POST(req: Request) {
  const body = await req.json()

  const id = body.id?.toString()?.trim()
  const timestampRaw = body.timestamp?.toString()?.trim()
  const level = body.level?.toString()?.trim()
  const scope = body.scope?.toString()?.trim()
  const message = body.message?.toString()?.trim()

  // Basic validation
  if (!id || !timestampRaw || !level || !scope || !message) {
    return NextResponse.json({ error: 'Missing required log fields' }, { status: 400 })
  }

  // Try to convert timestamp to a valid ISO string
  const parsedTimestamp = new Date(timestampRaw)
  if (isNaN(parsedTimestamp.getTime())) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 })
  }

  const timestamp = parsedTimestamp.toISOString()

  const supabase = await createClient<Database>()
  const { error } = await supabase
    .schema('api')
    .from('bot_logs')
    .insert([{ id, timestamp, level, scope, message }])

  if (error) {
    await logger.error(`Failed to restore log ${id}: ${error.message}`, 'restore_log')
    return NextResponse.json({ error: 'Failed to restore log' }, { status: 500 })
  }

  await logger.info(`Restored archived log ${id}`, 'restore_log')
  return NextResponse.json({ success: true })
}