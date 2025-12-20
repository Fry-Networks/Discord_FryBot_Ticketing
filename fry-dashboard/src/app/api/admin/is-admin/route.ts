import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { serviceSupabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function GET() {
  try {
    const supabaseServer = await createClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()

    if (userError || !user) {
      await logger.info('is-admin: unauthenticated request', 'is_admin')
      return NextResponse.json({ isAdmin: false })
    }

    // Ensure user is staff
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`is-admin: non-staff user ***${user.id.slice(-6)} checked is-admin`, 'is_admin')
      return NextResponse.json({ isAdmin: false })
    }

    // Check explicit admin_users membership
    const { data: adminRow, error: adminErr } = await serviceSupabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminErr || !adminRow) {
      await logger.info(`is-admin: staff user ***${user.id.slice(-6)} is not in admin_users`, 'is_admin')
      return NextResponse.json({ isAdmin: false })
    }

    return NextResponse.json({ isAdmin: true })
  } catch (err: any) {
    await logger.error(`Unexpected server error in is-admin: ${err?.message ?? String(err)}`, 'is_admin')
    return NextResponse.json({ isAdmin: false })
  }
}
