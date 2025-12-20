import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'

export async function POST(req: Request) {
  const { ticket_id } = await req.json()

  if (!ticket_id) {
    return NextResponse.json({ error: 'Missing ticket_id' }, { status: 400 })
  }

  console.log('TICKET_ID from frontend:', ticket_id)
  await logger.info(`Looking up TicketTool ticket_number = ${ticket_id}`, 'get_tickettool_msgs')

  try {
    // Step 1: lookup internal ID from ticket_number
    const { data: ticketRows, error: ticketLookupError } = await supabase
      .schema('api')
      .from('tickets_tickettool')
      .select('id')
      .eq('ticket_number', ticket_id) // ← string comparison now
      .limit(1)

    const ticketRow = ticketRows?.[0]

    if (ticketLookupError || !ticketRow) {
      await logger.warn(`TicketTool ticket_number ${ticket_id} not found`, 'get_tickettool_msgs')
      return NextResponse.json({ messages: [] })
    }

    await logger.info(`Resolved ticket_number ${ticket_id} to tickettool_id ${ticketRow.id}`, 'get_tickettool_msgs')

    // Step 2: fetch messages using tickettool_id
    const { data, error } = await supabase
      .schema('api')
      .from('tickettool_messages')
      .select('user_id, username, role, message, created_at')
      .eq('tickettool_id', ticketRow.id)
      .order('created_at', { ascending: true })
      .range(0, 9999)

    if (error) {
      await logger.error(`Error loading tickettool_messages for ${ticket_id}: ${error.message}`, 'get_tickettool_msgs')
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
    }

    await logger.info(`Fetched ${data?.length || 0} messages for tickettool_id ${ticketRow.id}`, 'get_tickettool_msgs')

    return NextResponse.json({ messages: data || [] })
  } catch (err: any) {
    await logger.error(`Unhandled error: ${err.message}`, 'get_tickettool_msgs')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
