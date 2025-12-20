import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ticketId = searchParams.get('ticketId')

  if (!ticketId) {
    return NextResponse.json({ error: 'Missing ticketId parameter' }, { status: 400 })
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
      await logger.warn('Invalid Supabase token in get-ticket-staff-points', 'get_ticket_staff_points')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check using Discord token
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted to fetch ticket staff points`, 'get_ticket_staff_points')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('ticket_staff_points')
      .select('ticket_id, staff_id, staff_username, points_awarded_for_ticket, first_reply_points, response_time_points, closer_points, message_contribution_points')
      .eq('ticket_id', ticketId)
      .order('points_awarded_for_ticket', { ascending: false })

    if (error) {
      await logger.error(`Failed to fetch ticket staff points for ticket ${ticketId}: ${error.message}`, 'get_ticket_staff_points')
      return NextResponse.json({ error: 'Fetch error' }, { status: 500 })
    }

    await logger.info(`Returning ${data?.length} ticket staff points entries for ticket ${ticketId}`, 'get_ticket_staff_points')

    return NextResponse.json({ ticketStaffPoints: data })
  } catch (err: any) {
    await logger.error(`Unexpected error: ${err.message}`, 'get_ticket_staff_points')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
