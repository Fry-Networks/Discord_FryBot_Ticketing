// /api/get-reward-settings/route.ts
// This file defines the API route for fetching reward settings.

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
    await logger.warn('Unauthorized: No authenticated user found.', 'get-reward-settings-api')
    return { error: 'Unauthorized', status: 401, user: null }
  }

  const userId = user.id
  const isStaff = await checkStaffRoleServerSide(userId)
  if (!isStaff) {
    await logger.warn(`Unauthorized: User ${userId} is not staff.`, 'get-reward-settings-api')
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
    const { data, error: dbError } = await serviceSupabase.from('reward_settings').select('*');

    if (dbError) {
      await logger.error('Error fetching reward settings', 'get-reward-settings-api', { error: dbError })
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    const error = e as Error
    await logger.error('Unexpected error in GET', 'get-reward-settings-api', { error: error.message })
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
