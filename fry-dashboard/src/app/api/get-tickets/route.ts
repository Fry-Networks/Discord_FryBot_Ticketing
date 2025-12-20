// src/app/api/get-tickets/route.ts

import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function POST(req: Request) {
  const { source, from = 0, to = 9999 } = await req.json()

  // Validate source type
  if (!['live', 'ticketsbot', 'tickettool'].includes(source)) {
    return NextResponse.json({ error: 'Invalid ticket source.' }, { status: 400 })
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
      await logger.warn('Invalid Supabase token in get-tickets', 'get_tickets')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 🎟 Get Discord access token for the user
    const { data: tokenRow, error: tokenError } = await supabase
      .schema('api')
      .from('user_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (tokenError || !tokenRow?.access_token) {
      await logger.warn(`Missing Discord token for user ***${user.id.slice(-6)}`, 'get_tickets')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check using Discord token
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted ticket fetch`, 'get_tickets')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }


    const table =
      source === 'live'
        ? 'tickets'
        : source === 'ticketsbot'
        ? 'tickets_ticketsbot'
        : 'tickets_tickettool'

    let query = supabase
    .schema('api')
    .from(table)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    
    let data: any[] = []
    let error = null
    let count = 0
    
    if (table === 'tickets_ticketsbot') {
      const chunkSize = 1000
      for (let start = from; start <= to; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, to)
        const { data: chunk, count: chunkCount, error: chunkError } = await supabase
          .schema('api')
          .from(table)
          .select('id, created_at, closed_at, claimed_by, description, status, ticket_type, discord_username, close_reason, closed_by, claimed_by_username, user_id, closed_by_username, full_name, email, order_number, algorand_address, minerkeys', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(start, end)
    
        if (chunkError) {
          error = chunkError
          break
        }
    
        if (chunk) data = data.concat(chunk)
        if (start === from && chunkCount) count = chunkCount
      }
    } else {
      let response;
      if (table === 'tickets') {
        // Select all columns present in the 'tickets' table
        response = await supabase
          .schema('api')
          .from(table)
          .select('id, user_id, discord_username, ticket_type, full_name, email, description, algorand_address, minerkeys, order_number, channel_id, status, created_at, closed_at, claimed_by, scheduled_close_at, is_transcribed, claimed_by_username, original_category_id, transcript_preference, original_message_id, selected_region, bold_sign_signed, sn_picture_confirmed, factory_reset_picture_confirmed, orders_quantities, request_type, closed_by_username, closed_by_id', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);
      } else if (table === 'tickets_tickettool') {
        // Select only columns present in the 'tickets_tickettool' table
        response = await supabase
          .schema('api')
          .from(table)
          .select('id, ticket_number, created_at, closed_at, claimed_by, description, status, ticket_type, discord_username, full_name, email, order_number, user_id, minerkeys, algorand_address, closed_by, claimed_by_username, closed_by_username', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);
      } else {
        // Fallback or error handling if a new table type is added without a select statement
        error = new Error(`Unknown table type: ${table}`);
        data = [];
        count = 0;
      }

      data = response?.data || [];
      error = response?.error || null;
      count = response?.count || 0;
    }

    if (error) {
      await logger.error(`Failed to fetch ${source} tickets: ${error.message}`, 'get_tickets')
      return NextResponse.json({ error: 'Fetch error' }, { status: 500 })
    }

    const result = (data || []).map((t: any) => ({
      id: source === 'tickettool' ? t.ticket_number : t.id,
      ticket_number: source === 'tickettool' ? t.ticket_number : null,      
      created_at: t.created_at ?? null,
      closed_at: t.closed_at ?? null,
      claimed_by: t.claimed_by ?? null,
      claimed_by_username: t.claimed_by_username ?? null,
      closed_by: t.closed_by ?? null,
      closed_by_username: t.closed_by_username ?? null,
      close_reason: t.close_reason ?? null,
      description: t.description ?? null,
      status: t.status ?? 'unclaimed',
      orders_quantities: t.orders_quantities ?? null,
      request_type: t.request_type ?? null,
      ticket_type: t.ticket_type ?? null,
      discord_username: t.discord_username ?? 'Unknown',
      full_name: t.full_name ?? null,
      email: t.email ?? null,
      order_number: t.order_number ?? null,
      algorand_address: t.algorand_address ?? null,
      minerkeys: t.minerkeys ?? null,
      user_id: t.user_id ?? null,
      transcriptSource: source,
    }))
    await logger.info(`Returning ${data?.length} ${source} tickets`, 'get_tickets')

    return NextResponse.json({ tickets: result, total: count || 0 })
  } catch (err: any) {
    await logger.error(`Unexpected error: ${err.message}`, 'get_tickets')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
