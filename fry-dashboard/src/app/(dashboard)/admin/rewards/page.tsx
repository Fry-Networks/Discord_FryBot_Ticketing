import AdminRewardsClient from '@/components/AdminRewardsClient';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server'; // Import server-side Supabase client
import { serviceSupabase } from '@/utils/supabase/serviceRole';

export default async function AdminRewardsPage() {
  const supabase = await createClient(); // Create server-side Supabase client
  const { data: { user } } = await supabase.auth.getUser(); // Get the user

  if (!user) {
    redirect('/unauthorized'); // Redirect if no user is logged in
  }

  const isStaff = await checkStaffRoleServerSide(user.id); // Pass user.id to checkStaffRoleServerSide

  if (!isStaff) {
    redirect('/unauthorized'); // Redirect if user is not staff
  }

  // Only allow explicit admin_users entries to access this page
const { data: adminUser, error: adminError } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (!adminUser) {
    redirect('/unauthorized');
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin - Manage Rewards</h1>
      <AdminRewardsClient />
    </div>
  );
}
