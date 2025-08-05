import { NextResponse } from 'next/server';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';
import { createClient } from '@/utils/supabase/server';
import { serviceSupabase } from '@/utils/supabase/serviceRole';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isStaff = await checkStaffRoleServerSide(user.id);
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: adminUser } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, error } = await serviceSupabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error fetching announcements' }, { status: 500 });
  }
}
