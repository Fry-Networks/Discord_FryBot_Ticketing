// /api/admin/performance-thresholds/route.ts
// This file defines the API route for managing performance thresholds.
import { NextResponse } from 'next/server'
import { serviceSupabase } from '@/utils/supabase/serviceRole'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/utils/logger'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

// Centralized authorization check
const authorize = async (supabase: SupabaseClient<Database>) => {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError || !user) {
    await logger.warn('Unauthorized: No authenticated user found.', 'performance-thresholds-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  const userId = user.id
  const isStaff = await checkStaffRoleServerSide(userId)
  if (!isStaff) {
    await logger.warn(`Unauthorized: User ${userId} is not staff.`, 'performance-thresholds-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  // Use the service role client to check the admin_users table.
  // This is a secure, server-side check to ensure only authorized admins can proceed.
  const { data: adminUser } = await serviceSupabase.from('admin_users').select('user_id').eq('user_id', userId).single()

  if (!adminUser) {
    await logger.warn(`Unauthorized: User ${userId} is not an admin.`, 'performance-thresholds-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  return { user: user, error: null, status: 200 }
}

export async function GET() {
  const supabase = await createClient()
  const { error, status } = await authorize(supabase)
  if (error) {
    return NextResponse.json({ error }, { status })
  }

  try {
    const { data, error: rpcError } = await serviceSupabase.rpc('get_performance_thresholds')

    if (rpcError) {
      await logger.error('Error fetching performance thresholds', 'performance-thresholds-api', { error: rpcError })
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    const error = e as Error
    await logger.error('Unexpected error in GET', 'performance-thresholds-api', { error: error.message })
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { user, error, status } = await authorize(supabase)
  if (error) {
    return NextResponse.json({ error }, { status })
  }

  try {
    const { threshold_name, threshold_value, description } = await req.json()

    if (!threshold_name || threshold_value === undefined || threshold_value === null) {
      return NextResponse.json({ error: 'Missing required fields: threshold_name, threshold_value' }, { status: 400 })
    }

    const { error: rpcError } = await serviceSupabase.rpc('set_performance_threshold', {
      p_threshold_name: threshold_name,
      p_threshold_value: threshold_value,
      p_description: description
    })

    if (rpcError) {
      await logger.error('Error setting performance threshold', 'performance-thresholds-api', {
        error: rpcError,
        user: user?.id
      })
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Performance threshold set successfully' })
  } catch (e) {
    const error = e as Error
    await logger.error('Unexpected error in POST', 'performance-thresholds-api', { error: error.message, user: user?.id })
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
