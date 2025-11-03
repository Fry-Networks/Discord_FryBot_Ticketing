import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function POST(req: Request) {
  try {
    const supabaseServer = await createClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()

    if (userError || !user) {
      await logger.warn('Unauthorized attempt to call award-bonus (no user)', 'award_bonus')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Final staff role check
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted to award bonus`, 'award_bonus')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check admin users table for explicit admin membership
    const { data: adminRow, error: adminErr } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminErr || !adminRow) {
      await logger.warn(`403: Non-admin staff ***${user.id.slice(-6)} attempted to award bonus`, 'award_bonus')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { staff_id, points_delta, reason, ticket_id } = body as {
      staff_id?: string
      points_delta?: number
      reason?: string
      ticket_id?: number | null
    }

    // Basic validation
    if (!staff_id || typeof staff_id !== 'string') {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
    }
    if (typeof points_delta !== 'number' || !Number.isFinite(points_delta) || points_delta === 0) {
      return NextResponse.json({ error: 'points_delta must be a non-zero number' }, { status: 400 })
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }
    // Optional safeguard: enforce a per-award limit (configurable later)
    const MAX_ABS_POINTS = 500
    if (Math.abs(points_delta) > MAX_ABS_POINTS) {
      return NextResponse.json({ error: `points_delta absolute value must be <= ${MAX_ABS_POINTS}` }, { status: 400 })
    }

    // Call the DB stored proc (apply_staff_points_adjustment) via service role
    // NOTE: Migration must be applied before this RPC exists.
    try {
      const rpcResult = await supabase.rpc('apply_staff_points_adjustment', {
        p_staff_id: staff_id,
        p_points: points_delta,
        p_reason: reason,
        p_awarded_by: user.id,
        p_awarded_by_username: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.username)) || user.email || null,
        p_ticket_id: ticket_id ?? null
      })

      // If RPC executed but did not return a numeric (varies by driver), fetch the staff row to obtain total
      const { data: staffRow, error: staffErr } = await supabase
        .from('staff_points')
        .select('total_points')
        .eq('staff_id', staff_id)
        .single()

      if (staffErr || !staffRow) {
        await logger.error(`Award bonus succeeded but failed to fetch staff row for ${staff_id}: ${staffErr?.message}`, 'award_bonus')
        return NextResponse.json({ error: 'Adjustment applied but failed to fetch updated total' }, { status: 500 })
      }

      await logger.info(`Admin ***${user.id.slice(-6)} awarded ${points_delta} to ${staff_id}`, 'award_bonus')
      return NextResponse.json({ new_total_points: staffRow.total_points })
    } catch (rpcErr: any) {
      await logger.error(`RPC or DB error in award-bonus: ${rpcErr?.message ?? String(rpcErr)}`, 'award_bonus')
      return NextResponse.json({ error: 'Database error or migration not applied' }, { status: 500 })
    }
  } catch (err: any) {
    await logger.error(`Unexpected server error in award-bonus: ${err.message}`, 'award_bonus')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
