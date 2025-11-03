import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { logger } from '@/utils/logger';
import { TablesUpdate } from '@/types/supabase';
import { serviceSupabase } from '@/utils/supabase/serviceRole';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    await logger.error('Failed to update claim: Unauthorized', 'update-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const isStaff = await checkStaffRoleServerSide(user.id);
  if (!isStaff) {
    await logger.warn(`update-claim-api: non-staff user ***${user.id.slice(-6)} attempted to access admin-only endpoint`, 'update-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { data: adminRow, error: adminErr } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (adminErr || !adminRow) {
    await logger.warn(`update-claim-api: staff user ***${user.id.slice(-6)} is not in admin_users`, 'update-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { id, status } = await request.json();

  if (!id || !status) {
    await logger.error('Failed to update claim: Invalid request body', 'update-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'];
  if (!validStatuses.includes(status)) {
    await logger.error(`Failed to update claim: Invalid status value: ${status}`, 'update-claim-api');
    return new NextResponse(JSON.stringify({ error: `Invalid status value: ${status}` }), { status: 400 });
  }

  // If the status is 'processing', we trigger the Edge Function directly.
  // The function itself handles the atomic transition from 'approved' to 'processing'.
  if (status === 'processing') {
    try {
      const { error: invokeError } = await supabase.functions.invoke('on_chain_distribution', {
        body: { claimId: id },
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      await logger.info(`Successfully invoked on_chain_distribution for claim ${id}`, 'update-claim-api');
      return new NextResponse(JSON.stringify({ success: true, message: 'Distribution process initiated' }), { status: 202 });
    } catch (error: any) {
      await logger.error(`Failed to invoke on_chain_distribution for claim ${id}: ${error.message}`, 'update-claim-api');
      // Do not update status here, as the Edge Function's error handling will do it.
      return new NextResponse(JSON.stringify({ error: 'Failed to trigger distribution' }), { status: 500 });
    }
  }

  // For all other status updates, update the database directly.
  const { error } = await supabase
    .schema('api')
    .from('fnode_claims')
    .update({ status })
    .eq('id', id);

  if (error) {
    await logger.error(`Failed to update claim ${id} to status ${status}: ${error.message}`, 'update-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Failed to update claim' }), { status: 500 });
  }

  await logger.info(`Successfully updated claim ${id} to status ${status}`, 'update-claim-api');
  return new NextResponse(JSON.stringify({ success: true }), { status: 200 });
}
