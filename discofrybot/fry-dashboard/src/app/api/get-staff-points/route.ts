import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function GET(req: Request) {
  try {
    // Use server-side Supabase client to get user from cookies/middleware
    const { createClient } = await import('@/utils/supabase/server')
    const supabaseServer = await createClient()
    
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()

    if (userError || !user) {
      await logger.warn('No authenticated user in get-staff-points', 'get_staff_points')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check using Discord token
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted to fetch staff points`, 'get_staff_points')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('staff_points')
      .select('staff_id, total_points, staff_username')
      .order('total_points', { ascending: false })

    if (error) {
      await logger.error(`Failed to fetch staff points: ${error.message}`, 'get_staff_points')
      return NextResponse.json({ error: 'Fetch error' }, { status: 500 })
    }

    await logger.info(`Returning ${data?.length} staff points entries`, 'get_staff_points')

    return NextResponse.json({ staffPoints: data })
  } catch (err: any) {
    await logger.error(`Unexpected error: ${err.message}`, 'get_staff_points')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
