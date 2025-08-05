import RewardsClient from '@/components/RewardsClient';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server'; // Import server-side Supabase client

export default async function RewardsPage() {
  const supabase = await createClient(); // Create server-side Supabase client
  const { data: { user } } = await supabase.auth.getUser(); // Get the user

  if (!user) {
    redirect('/unauthorized'); // Redirect if no user is logged in
  }

  const isStaff = await checkStaffRoleServerSide(user.id); // Pass user.id to checkStaffRoleServerSide

  if (!isStaff) {
    redirect('/unauthorized'); // Redirect if user is not staff
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Ticket Node - fNODE Rewards</h1>
      <RewardsClient />
    </div>
  );
}
