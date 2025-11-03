import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { serviceSupabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

const GUILD_ID = process.env.GUILD_ID!
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID!
const INTERN_ROLE_ID = process.env.INTERN_ROLE_ID!

export async function GET(req: Request) {
  try {
    const supabaseServer = await createClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()

    if (userError || !user) {
      await logger.warn('Unauthorized attempt to call get-staff (no user)', 'get_staff')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Final staff role check
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted to get staff list`, 'get_staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check admin users table for explicit admin membership
    const { data: adminRow, error: adminErr } = await serviceSupabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminErr || !adminRow) {
      await logger.warn(`403: Non-admin staff ***${user.id.slice(-6)} attempted to get staff list`, 'get_staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: staff, error } = await serviceSupabase
      .from('users')
      .select('id, username')
      .eq('is_staff', true)

    if (error) {
      await logger.error(`Error fetching staff from users table: ${error.message}`, 'get_staff')
      return NextResponse.json({ error: 'Error fetching staff' }, { status: 500 })
    }

    return NextResponse.json(staff)
  } catch (err: any) {
    await logger.error(`Unexpected server error in get-staff: ${err.message}`, 'get_staff')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
