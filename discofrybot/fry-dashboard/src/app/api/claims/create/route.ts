import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { logger } from '@/utils/logger';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    await logger.error('Failed to create claim: Unauthorized', 'create-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Check if user is staff
  const { data: staffRole, error: staffError } = await supabase
    .schema('api')
    .from('staff_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (staffError || !staffRole) {
    await logger.error(`Failed to create claim for user ${user.id}: User is not staff`, 'create-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Not authorized - staff only' }), { status: 403 });
  }

  // Get Discord ID from user_tokens table
  const { data: userToken, error: tokenError } = await supabase
    .schema('api')
    .from('user_tokens')
    .select('discord_user_id')
    .eq('user_id', user.id)
    .single();

  if (tokenError || !userToken?.discord_user_id) {
    await logger.error(`Failed to create claim for user ${user.id}: Discord ID not found`, 'create-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Discord ID not found' }), { status: 400 });
  }

  const { amount, wallet_address } = await request.json();

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    await logger.error(`Failed to create claim for user ${user.id}: Invalid amount provided: ${amount}`, 'create-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Invalid amount' }), { status: 400 });
  }

  if (!wallet_address || typeof wallet_address !== 'string') {
    await logger.error(`Failed to create claim for user ${user.id}: Invalid wallet address provided: ${wallet_address}`, 'create-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Invalid wallet address' }), { status: 400 });
  }

  const { error } = await supabase.schema('api').from('fnode_claims').insert([
    { staff_id: userToken.discord_user_id, amount_claimed: amount, wallet_address: wallet_address },
  ]);

  if (error) {
    await logger.error(`Failed to create claim for user ${user.id} (Discord: ${userToken.discord_user_id}): ${error.message}`, 'create-claim-api');
    return new NextResponse(JSON.stringify({ error: 'Failed to create claim' }), { status: 500 });
  }

  await logger.info(`Successfully created claim for user ${user.id} (Discord: ${userToken.discord_user_id}) of ${amount}`, 'create-claim-api');
  return new NextResponse(JSON.stringify({ success: true }), { status: 200 });
}
