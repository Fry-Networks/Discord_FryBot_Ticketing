'use client';

import { useEffect, useState } from 'react';
import { Database } from '@/types/supabase';
import { createClient } from '@/utils/supabase/supabaseClient';

type FnodeReward = Database['api']['Tables']['fnode_rewards']['Row'];

export default function RewardsClient() {
  const [reward, setReward] = useState<FnodeReward | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchReward = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch the discord_user_id from user_tokens table
      const { data: userTokenData, error: userTokenError } = await supabase
        .schema('api')
        .from('user_tokens')
        .select('discord_user_id')
        .eq('user_id', user.id)
        .single();

      if (userTokenError || !userTokenData?.discord_user_id) {
        console.error('RewardsClient: Could not find discord_user_id for user:', user.id, userTokenError);
        setLoading(false);
        return;
      }

      const discordUserId = userTokenData.discord_user_id;
      console.log('RewardsClient: Found Discord User ID:', discordUserId);

      const res = await fetch(`/api/get-fnode-rewards?user_id=${discordUserId}`);
      const data = await res.json();
      console.log('RewardsClient: Received data from API:', data);
      setReward(data);
      setLoading(false);
    };

    fetchReward();
  }, [supabase]);

  console.log('RewardsClient: Current reward state:', reward);

  const handleClaim = async () => {
    // Placeholder for claim logic
    alert('Claim functionality not yet implemented.');
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!reward) {
    return <div>No rewards found.</div>;
  }

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-bold">Your Rewards</h2>
      <p>fNODE Earned: {reward.fnode_earned}</p>
      <p>fNODE Claimed: {reward.fnode_claimed}</p>
      <button
        onClick={handleClaim}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Claim Rewards
      </button>
    </div>
  );
}
