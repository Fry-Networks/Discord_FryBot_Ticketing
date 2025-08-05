import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function POST(req: Request) {
  const { ticket_id } = await req.json()

  if (!ticket_id) {
    return NextResponse.json({ error: 'Missing ticket_id' }, { status: 400 })
  }

  try {
    // Auth header must contain access_token
    const authHeader = req.headers.get('authorization')
    const supabaseToken = authHeader?.split(' ')[1]

    if (!supabaseToken) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    // 🔑 Get user from Supabase using the Supabase token
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(supabaseToken)

    if (userError || !user) {
      await logger.warn('Invalid Supabase token in get-live-ticket-messages', 'get_live_ticket_messages')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check using Discord token
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted live ticket message fetch`, 'get_live_ticket_messages')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { data: messages, error } = await supabase
      .schema('api')
      .from('ticket_messages')
      .select('user_id, discord_username, message, created_at, role')
      .eq('ticket_id', ticket_id)
      .order('created_at', { ascending: true })

    if (error) {
      await logger.error(`Failed to fetch live ticket messages for ticket ${ticket_id}: ${error.message}`, 'get_live_ticket_messages')
      return NextResponse.json({ error: 'Fetch error' }, { status: 500 })
    }

    // Map the data to match the TranscriptMessage interface structure
    const formattedMessages = messages.map(msg => ({
      user_id: msg.user_id,
      username: msg.discord_username || 'Unknown', // Use discord_username for username
      role: msg.role, // Use the role from the database
      message: msg.message,
      created_at: msg.created_at,
    }));


    await logger.info(`Returning ${formattedMessages?.length} live ticket messages for ticket ${ticket_id}`, 'get_live_ticket_messages')

    return NextResponse.json({ messages: formattedMessages })
  } catch (err: any) {
    await logger.error(`Unexpected error: ${err.message}`, 'get_live_ticket_messages')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
