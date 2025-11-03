import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { logger } from '@/utils/logger';
import { serviceSupabase } from '@/utils/supabase/serviceRole';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    await logger.error('Failed to list claims: Unauthorized', 'list-claims-api');
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // This endpoint is for admins, so we should check for admin privileges here.
  // We'll rely on RLS for the actual data fetching, but it's good practice to have a check here too.
  const isStaff = await checkStaffRoleServerSide(user.id);
  if (!isStaff) {
    await logger.warn(`list-claims-api: non-staff user ***${user.id.slice(-6)} attempted to access admin-only endpoint`, 'list-claims-api');
    return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { data: adminRow, error: adminErr } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (adminErr || !adminRow) {
    await logger.warn(`list-claims-api: staff user ***${user.id.slice(-6)} is not in admin_users`, 'list-claims-api');
    return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { data, error } = await supabase.schema('api').from('fnode_claims').select('*');

  if (error) {
    await logger.error(`Failed to list claims: ${error.message}`, 'list-claims-api');
    return new NextResponse(JSON.stringify({ error: 'Failed to list claims' }), { status: 500 });
  }

  return new NextResponse(JSON.stringify(data), { status: 200 });
}
