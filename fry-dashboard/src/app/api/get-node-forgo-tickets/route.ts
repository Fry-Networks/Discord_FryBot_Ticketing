// src/app/api/get-node-forgo-tickets/route.ts

import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'

export async function POST(req: Request) {
  const { from = 0, to = 9999 } = await req.json()

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
      await logger.warn('Invalid Supabase token in get-node-forgo-tickets', 'get_node_forgo_tickets')
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
      await logger.warn(`Missing Discord token for user ***${user.id.slice(-6)}`, 'get_node_forgo_tickets')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check using Discord token
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted node forgo ticket fetch`, 'get_node_forgo_tickets')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const table = 'tickets' // Node forgo tickets are in the 'tickets' table

    let query = supabase
      .schema('api')
      .from(table)
      .select('id, user_id, discord_username, ticket_type, full_name, email, description, algorand_address, minerkeys, order_number, channel_id, status, created_at, closed_at, claimed_by, scheduled_close_at, is_transcribed, claimed_by_username, original_category_id, transcript_preference, original_message_id, selected_region, bold_sign_signed, sn_picture_confirmed, factory_reset_picture_confirmed, orders_quantities, request_type, registration_waived, validated, validated_by, program_status, coupon_code', { count: 'exact' })
      .eq('ticket_type', 'node_forgo_return') // Filter by ticket type
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      await logger.error(`Failed to fetch node forgo tickets: ${error.message}`, 'get_node_forgo_tickets')
      return NextResponse.json({ error: 'Fetch error' }, { status: 500 })
    }

    // Get counts for forgo and return request types
    const { count: forgoCount, error: forgoError } = await supabase
      .schema('api')
      .from(table)
      .select('id', { count: 'exact' })
      .eq('ticket_type', 'node_forgo_return')
      .eq('request_type', 'forgo');

    if (forgoError) {
      await logger.error(`Failed to count forgo tickets: ${forgoError.message}`, 'get_node_forgo_tickets')
      return NextResponse.json({ error: 'Count error' }, { status: 500 })
    }

    const { count: returnCount, error: returnError } = await supabase
      .schema('api')
      .from(table)
      .select('id', { count: 'exact' })
      .eq('ticket_type', 'node_forgo_return')
      .eq('request_type', 'return');

    if (returnError) {
      await logger.error(`Failed to count return tickets: ${returnError.message}`, 'get_node_forgo_tickets')
      return NextResponse.json({ error: 'Count error' }, { status: 500 })
    }

    const result = (data || []).map((t: any) => ({
      id: t.id,
      created_at: t.created_at ?? null,
      closed_at: t.closed_at ?? null,
      claimed_by: t.claimed_by ?? null,
      claimed_by_username: t.claimed_by_username ?? null,
      closed_by: t.closed_by ?? null,
      closed_by_username: t.closed_by_username ?? null,
      close_reason: t.close_reason ?? null,
      description: t.description ?? null,
      status: t.status ?? null,
      program_status: t.program_status ?? null, // Include program_status
      ticket_type: t.ticket_type ?? null,
      discord_username: t.discord_username ?? 'Unknown',
      full_name: t.full_name ?? null,
      email: t.email ?? null,
      order_number: t.order_number ?? null,
      algorand_address: t.algorand_address ?? null,
      minerkeys: t.minerkeys ?? null,
      user_id: t.user_id ?? null,
      transcriptSource: 'live', // Assuming node forgo tickets are live tickets
      channel_id: t.channel_id ?? null,
      scheduled_close_at: t.scheduled_close_at ?? null,
      is_transcribed: t.is_transcribed ?? null,
      original_category_id: t.original_category_id ?? null,
      transcript_preference: t.transcript_preference ?? null,
      original_message_id: t.original_message_id ?? null,
      selected_region: t.selected_region ?? null,
      bold_sign_signed: t.bold_sign_signed ?? null,
      sn_picture_confirmed: t.sn_picture_confirmed ?? null,
      factory_reset_picture_confirmed: t.factory_reset_picture_confirmed ?? null,
      orders_quantities: t.orders_quantities ?? null,
      request_type: t.request_type ?? null,
      registration_waived: t.registration_waived ?? null,
      validated: t.validated ?? null,
      validated_by: t.validated_by ?? null,
      coupon_code: t.coupon_code ?? null,
    }))
    await logger.info(`Returning ${data?.length} node forgo tickets`, 'get_node_forgo_tickets')

    return NextResponse.json({ tickets: result, total: count || 0, forgoCount: forgoCount || 0, returnCount: returnCount || 0 }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      }
    })
  } catch (err: any) {
    await logger.error(`Unexpected error: ${err.message}`, 'get_node_forgo_tickets')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
