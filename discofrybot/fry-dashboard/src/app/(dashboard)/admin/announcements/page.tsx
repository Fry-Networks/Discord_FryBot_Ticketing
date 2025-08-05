import AnnouncementsClient from '@/components/AnnouncementsClient';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { serviceSupabase } from '@/utils/supabase/serviceRole';

export default async function AdminAnnouncementsPage() {
  /*if (process.env.NODE_ENV === 'development') {
    // Bypass staff role check in development
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Admin - Announcements (Development Mode)</h1>
        <AnnouncementsClient />
      </div>
    );
  }*/

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/unauthorized');
  }

  const isStaff = await checkStaffRoleServerSide(user.id);

  if (!isStaff) {
    redirect('/unauthorized');
  }

  const { data: adminUser } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (!adminUser) {
    redirect('/unauthorized');
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin - Announcements</h1>
      <AnnouncementsClient />
    </div>
  );
}
