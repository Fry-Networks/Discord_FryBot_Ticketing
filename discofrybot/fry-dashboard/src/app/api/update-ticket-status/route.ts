// src/app/api/update-ticket-status/route.ts

import { NextResponse } from 'next/server';
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole';
import { logger } from '@/utils/logger';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';

export async function POST(req: Request) {
  const { ticketId, newStatus, column = 'status' } = await req.json();

  if (!ticketId || !newStatus) {
    return NextResponse.json({ error: 'Missing ticketId or newStatus' }, { status: 400 });
  }

  // Validate the column name to prevent SQL injection
  if (column !== 'status' && column !== 'program_status') {
      return NextResponse.json({ error: 'Invalid column specified for update' }, { status: 400 });
  }

  try {
    // Auth header must contain access_token
    const authHeader = req.headers.get('authorization');
    const supabaseToken = authHeader?.split(' ')[1];

    if (!supabaseToken) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    // 🔑 Get user from Supabase using the Supabase token
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(supabaseToken);

    if (userError || !user) {
      await logger.warn('Invalid Supabase token in update-ticket-status', 'update_ticket_status');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Final staff role check using Discord token
    const isStaff = await checkStaffRoleServerSide(user.id);
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted ticket status update`, 'update_ticket_status');
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Update the specified column in the 'tickets' table
    const updateData: { [key: string]: any } = {};
    updateData[column] = newStatus;


    // Update the ticket status in the 'tickets' table
    const { data, error } = await supabase
      .schema('api')
      .from('tickets')
      .update(updateData)
      .eq('id', ticketId);

    if (error) {
      await logger.error(`Failed to update ticket ${ticketId} status to ${newStatus}: ${error.message}`, 'update_ticket_status');
      return NextResponse.json({ error: 'Failed to update ticket status' }, { status: 500 });
    }

    await logger.info(`Successfully updated ticket ${ticketId} column ${column} to ${newStatus}`, 'update_ticket_status');
    return NextResponse.json({ success: true });

  } catch (err: any) {
    await logger.error(`Unexpected error updating ticket status: ${err.message}`, 'update_ticket_status');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
