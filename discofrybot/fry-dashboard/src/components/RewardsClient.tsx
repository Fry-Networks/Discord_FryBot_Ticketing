'use client';

import { useEffect, useState, useCallback } from 'react';
import { Database } from '@/types/supabase';
import { createClient } from '@/utils/supabase/supabaseClient';
import { useWallet } from './WalletProvider';

type FnodeReward = Database['api']['Tables']['fnode_rewards']['Row'];

export default function RewardsClient() {
  const [reward, setReward] = useState<FnodeReward | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const { accountAddress, connect, disconnect } = useWallet();

  const updateWalletAddress = useCallback(async (address: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Fetch the discord_user_id from user_tokens table
      const { data: userTokenData, error: userTokenError } = await supabase
        .schema('api')
        .from('staff_points')
        .select('staff_id')
        .eq('user_id', user.id)
        .single();

      if (userTokenError || !userTokenData?.staff_id) {
        console.error('RewardsClient: Could not find staff_id for user:', user.id, userTokenError);
        return;
      }

      const discordUserId = userTokenData.staff_id;

      const { error } = await supabase
        .schema('api')
        .from('staff_points')
        .update({ wallet_address: address })
        .eq('staff_id', discordUserId); // Use discordUserId as staff_id
      if (error) {
        console.error('Failed to update wallet address in staff_points', error);
      } else {
        console.log('Wallet address updated successfully for staff_id:', discordUserId);
      }
    }
  }, [supabase]);

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

  useEffect(() => {
    if (accountAddress) {
      updateWalletAddress(accountAddress);
    }
  }, [accountAddress, updateWalletAddress]);

  console.log('RewardsClient: Current reward state:', reward);

  const handleClaim = async () => {
    if (!reward || !reward.fnode_earned || reward.fnode_earned <= 0) {
      alert('No rewards to claim.');
      return;
    }

    if (!accountAddress) {
      alert('Please connect your Algorand wallet before claiming rewards.');
      return;
    }

    const res = await fetch('/api/claims/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: reward.fnode_earned, wallet_address: accountAddress }),
    });

    if (res.ok) {
      alert('Claim submitted successfully!');
    } else {
      alert('Failed to submit claim.');
    }
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
      {accountAddress ? (
        <p>Connected Wallet: {accountAddress}</p>
      ) : (
        <button
          onClick={connect}
          className="mt-4 px-4 py-2 bg-green-500 text-white rounded"
        >
          Connect Algorand Wallet
        </button>
      )}
      <button
        onClick={handleClaim}
        className={`mt-4 px-4 py-2 ${accountAddress ? 'bg-blue-500' : 'bg-gray-400 cursor-not-allowed'} text-white rounded`}
        disabled={!accountAddress}
      >
        Claim Rewards
      </button>
      {accountAddress && (
        <button
          onClick={disconnect}
          className="mt-2 ml-2 px-4 py-2 bg-red-500 text-white rounded"
        >
          Disconnect Wallet
        </button>
      )}
    </div>
  );
}
