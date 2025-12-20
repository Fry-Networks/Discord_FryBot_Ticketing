// /api/get-fnode-rewards/route.ts
// This file defines the API route for fetching Fnode rewards for a specific user.

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
    await logger.warn('Unauthorized: No authenticated user found.', 'get-fnode-rewards-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  const userId = user.id
  const isStaff = await checkStaffRoleServerSide(userId)
  if (!isStaff) {
    await logger.warn(`Unauthorized: User ${userId} is not staff.`, 'get-fnode-rewards-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  return { user: user, error: null, status: 200 }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { error, status } = await authorize(supabase)
  if (error) {
    return NextResponse.json({ error }, { status })
  }

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  try {
    const { data, error: dbError } = await serviceSupabase
      .from('fnode_rewards')
      .select('*')
      .eq('staff_id', userId)
      .single()

    if (dbError) {
      // It's common for a user to not have rewards yet, so we don't log this as an error.
      if (dbError.code === 'PGRST116') {
        return NextResponse.json(null)
      }
      await logger.error(`Error fetching fnode rewards for user ${userId}`, 'get-fnode-rewards-api', { error: dbError })
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    const err = e as Error
    await logger.error(`Unexpected error in GET for user ${userId}`, 'get-fnode-rewards-api', { error: err.message })
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
