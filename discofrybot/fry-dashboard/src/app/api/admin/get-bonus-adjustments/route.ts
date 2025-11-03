import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { serviceSupabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function GET(req: Request) {
  try {
    const supabaseServer = await createClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()

    if (userError || !user) {
      await logger.warn('Unauthorized attempt to call get-bonus-adjustments (no user)', 'get_bonus_adjustments')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted to get bonus adjustments`, 'get_bonus_adjustments')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: adminRow, error: adminErr } = await serviceSupabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminErr || !adminRow) {
      await logger.warn(`403: Non-admin staff ***${user.id.slice(-6)} attempted to get bonus adjustments`, 'get_bonus_adjustments')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await serviceSupabase
      .from('staff_points_adjustments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      await logger.error(`Error fetching bonus adjustments: ${error.message}`, 'get_bonus_adjustments')
      return NextResponse.json({ error: 'Error fetching bonus adjustments' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    await logger.error(`Unexpected server error in get-bonus-adjustments: ${err.message}`, 'get_bonus_adjustments')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
