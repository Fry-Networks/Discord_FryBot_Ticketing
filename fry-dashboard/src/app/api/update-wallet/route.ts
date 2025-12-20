import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  const { wallet_address } = await request.json();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch the staff_id from staff_points table
  const { data: userTokenData, error: userTokenError } = await supabase
    .schema('api')
    .from('staff_points')
    .select('staff_id')
    .eq('user_id', user.id)
    .single();

  if (userTokenError || !userTokenData?.staff_id) {
    console.error('API: Could not find staff_id for user:', user.id, userTokenError);
    return NextResponse.json({ error: 'User not found or staff_id missing' }, { status: 404 });
  }

  const discordUserId = userTokenData.staff_id;

  const { error } = await supabase
    .schema('api')
    .from('staff_points')
    .update({ wallet_address })
    .eq('staff_id', discordUserId);

  if (error) {
    console.error('Error updating wallet address:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Wallet address updated successfully' });
}
