'use client';

import { useEffect, useState } from 'react';
import { Database } from '@/types/supabase';
import AdminAwardBonus from './AdminAwardBonus';

type FnodeReward = Database['api']['Tables']['fnode_rewards']['Row'];
type RewardSetting = Database['api']['Tables']['reward_settings']['Row'];
type PerformanceThreshold = Database['api']['Tables']['performance_thresholds']['Row'];
type FnodeClaim = Database['api']['Tables']['fnode_claims']['Row'];

export default function AdminRewardsClient() {
  const [rewards, setRewards] = useState<FnodeReward[]>([]);
  const [settings, setSettings] = useState<RewardSetting[]>([]);
  const [performanceThresholds, setPerformanceThresholds] = useState<PerformanceThreshold[]>([]);
  const [claims, setClaims] = useState<FnodeClaim[]>([]);  
  const [loading, setLoading] = useState(true);
  const [newThresholdName, setNewThresholdName] = useState('');
  const [newThresholdValue, setNewThresholdValue] = useState<number | ''>('');
  const [newThresholdDescription, setNewThresholdDescription] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(true);

  useEffect(() => {
    const fetchRewards = async () => {
      try {
        const res = await fetch('/api/get-all-fnode-rewards');
        if (!res.ok) {
          console.error('Failed to fetch rewards:', res.statusText);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setRewards(data);
        } else {
          console.error('Fetched rewards data is not an array:', data);
        }
      } catch (error) {
        console.error('Error fetching rewards:', error);
      }
    };

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/get-reward-settings');
        if (!res.ok) {
          console.error('Failed to fetch settings:', res.statusText);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setSettings(data);
        } else {
          console.error('Fetched settings data is not an array:', data);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    const fetchPerformanceThresholds = async () => {
      try {
        const res = await fetch('/api/admin/performance-thresholds');
        if (!res.ok) {
          console.error('Failed to fetch performance thresholds:', res.statusText);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setPerformanceThresholds(data);
        } else {
          console.error('Fetched performance thresholds data is not an array:', data);
        }
      } catch (error) {
        console.error('Error fetching performance thresholds:', error);
      }
    };

    const fetchClaims = async () => { // New function to fetch claims
      try {
        const res = await fetch('/api/admin/claims/list');
        if (!res.ok) {
          console.error('Failed to fetch claims:', res.statusText);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setClaims(data);
        } else {
          console.error('Fetched claims data is not an array:', data);
        }
      } catch (error) {
        console.error('Error fetching claims:', error);
      }
    };

    const fetchAllData = async () => {
      await Promise.all([fetchRewards(), fetchSettings(), fetchPerformanceThresholds(), fetchClaims()]); // Include fetchClaims
      setLoading(false);
    };

    fetchAllData();

    // Check admin status for rendering admin-only UI
    const checkAdmin = async () => {
      try {
        const res = await fetch('/api/admin/is-admin', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setIsAdmin(Boolean(json.isAdmin));
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        setIsAdmin(false);
      } finally {
        setAdminCheckLoading(false);
      }
    }
    checkAdmin();
  }, []);

  const handleAddOrUpdateThreshold = async () => {
    if (!newThresholdName || newThresholdValue === '') {
      alert('Threshold Name and Value are required.');
      return;
    }

    try {
      const res = await fetch('/api/admin/performance-thresholds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threshold_name: newThresholdName,
          threshold_value: newThresholdValue,
          description: newThresholdDescription,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Failed to add/update threshold:', errorData.error);
        alert(`Failed to add/update threshold: ${errorData.error}`);
        return;
      }

      alert('Threshold added/updated successfully!');
      // Re-fetch thresholds to update the UI
      const updatedRes = await fetch('/api/admin/performance-thresholds');
      const updatedData = await updatedRes.json();
      if (Array.isArray(updatedData)) {
        setPerformanceThresholds(updatedData);
      }
      setNewThresholdName('');
      setNewThresholdValue('');
      setNewThresholdDescription('');
    } catch (error) {
      console.error('Error adding/updating threshold:', error);
      alert('Error adding/updating threshold.');
    }
  };

  const handleUpdateClaimStatus = async (claimId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/admin/claims/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: claimId,
          status: newStatus,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Failed to update claim status:', errorData.error);
        alert(`Failed to update claim status: ${errorData.error}`);
        return;
      }

      alert('Claim status updated successfully!');
      // Re-fetch claims to update the UI
      const updatedRes = await fetch('/api/admin/claims/list');
      const updatedData = await updatedRes.json();
      if (Array.isArray(updatedData)) {
        setClaims(updatedData);
      }
    } catch (error) {
      console.error('Error updating claim status:', error);
      alert('Error updating claim status.');
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">All Rewards</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.map((reward) => (
          <div key={reward.id} className="p-4 border rounded-lg">
            <p>
              <strong>User:</strong> {reward.staff_username}
            </p>
            <p>
              <strong>fNODE Earned:</strong> {reward.fnode_earned}
            </p>
            <p>
              <strong>fNODE Claimed:</strong> {reward.fnode_claimed}
            </p>
          </div>
        ))}
      </div>
      <h2 className="text-xl font-bold mt-8 mb-4">Reward Settings</h2>
      {settings.map((setting) => (
        <div key={setting.id} className="p-4 border rounded-lg">
          <p>
            <strong>Setting:</strong> {setting.setting_name}
          </p>
          <p>
            <strong>Value:</strong> {setting.setting_value}
          </p>
        </div>
      ))}

      <h2 className="text-xl font-bold mt-8 mb-4">Performance Thresholds</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {performanceThresholds.map((threshold) => (
          <div key={threshold.id} className="p-4 border rounded-lg">
            <p>
              <strong>Name:</strong> {threshold.threshold_name}
            </p>
            <p>
              <strong>Value:</strong> {threshold.threshold_value}
            </p>
            {threshold.description && (
              <p>
                <strong>Description:</strong> {threshold.description}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 border rounded-lg">
        <h3 className="text-lg font-bold mb-4">Add/Update Performance Threshold</h3>
        <div className="mb-4">
          <label htmlFor="thresholdName" className="block text-sm font-medium text-gray-700">
            Threshold Name:
          </label>
          <input
            type="text"
            id="thresholdName"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={newThresholdName}
            onChange={(e) => setNewThresholdName(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="thresholdValue" className="block text-sm font-medium text-gray-700">
            Threshold Value:
          </label>
          <input
            type="number"
            id="thresholdValue"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={newThresholdValue}
            onChange={(e) => setNewThresholdValue(parseFloat(e.target.value))}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="thresholdDescription" className="block text-sm font-medium text-gray-700">
            Description (Optional):
          </label>
          <textarea
            id="thresholdDescription"
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={newThresholdDescription}
            onChange={(e) => setNewThresholdDescription(e.target.value)}
          ></textarea>
        </div>
        <button
          onClick={handleAddOrUpdateThreshold}
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Add/Update Threshold
        </button>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4">fNODE Claims</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {claims.map((claim) => (
          <div key={claim.id} className="p-4 border rounded-lg">
            <p>
              <strong>ID:</strong> {claim.id}
            </p>
            <p>
              <strong>Staff ID:</strong> {claim.staff_id}
            </p>
            <p>
              <strong>Amount:</strong> {claim.amount_claimed}
            </p>
            <p>
              <strong>Status:</strong> {claim.status}
            </p>
            <p>
              <strong>Created At:</strong> {new Date(claim.created_at).toLocaleString()}
            </p>
            <div className="mt-4">
              <select
                onChange={(e) => handleUpdateClaimStatus(claim.id, e.target.value)}
                value={claim.status}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        ))}
      </div>
      
      {/* Admin-only Award Bonus UI */}
      {!adminCheckLoading && isAdmin ? (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2 text-white">Admin: Award Bonus Points</h2>
          <div className="rounded-xl bg-white/5 p-6 shadow border">
            <div>
              <AdminAwardBonus />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
