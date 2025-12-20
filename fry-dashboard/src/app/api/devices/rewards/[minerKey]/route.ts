// src/app/api/devices/rewards/[minerKey]/route.ts

import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'
import { MongoClient } from 'mongodb'

// Define proper TypeScript interfaces for reward structures
interface DailyReward {
  date: string
  amount: number
  status: string
  asset_id: string
  created_at: string | Date
  claimed_at?: string | Date | null
  tx_id?: string | null
}

interface WeeklyReward {
  week_start: string | Date
  week_end: string | Date
  amount: number
  status: string
  asset_id: string
  unlock_at: string | Date
  claimed_at?: string | Date | null
  tx_id?: string | null
}

interface ProcessedDailyReward {
  date: string
  amount: number
  status: string
  asset_id: string
  created_at: string | Date
  claimed_at: string | Date | null
  tx_id: string | null
}

interface ProcessedWeeklyReward {
  week_start: string | Date
  week_end: string | Date
  amount: number
  status: string
  asset_id: string
  unlock_at: string | Date
  claimed_at: string | Date | null
  tx_id: string | null
}

export async function GET(req: Request, { params }: { params: Promise<{ minerKey: string }> }) {
  const { minerKey } = await params

  try {
    // Auth header must contain access_token
    const authHeader = req.headers.get('authorization')
    const supabaseToken = authHeader?.split(' ')[1]

    if (!supabaseToken) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    // 🔑 Get user from Supabase using the Supabase token
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser(supabaseToken)

    if (userError || !user) {
      await logger.warn('Invalid Supabase token in get-device-rewards', 'get_device_rewards')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted device rewards fetch`, 'get_device_rewards')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Query device-rewards collection using MongoDB
    const mongoUri = process.env.MONGO_DASH_URI
    if (!mongoUri) {
      await logger.error('MONGO_DASH_URI environment variable not set', 'get_device_rewards')
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    let client: MongoClient | null = null
    try {
      // Connect to MongoDB
      client = new MongoClient(mongoUri)
      await client.connect()
      
      const db = client.db('main')
      const deviceRewardsCollection = db.collection('device-rewards')
      
      // Query the device-rewards collection for this miner_key
      const rewardsDoc = await deviceRewardsCollection.findOne({ miner_key: minerKey })
      
      if (!rewardsDoc) {
        await logger.info(`No rewards found for device ${minerKey}`, 'get_device_rewards')
        return NextResponse.json({ rewards: null })
      }

      // Return complete reward history instead of just latest
      const rewardsData = {
        miner_key: rewardsDoc.miner_key,
        last_updated: rewardsDoc.last_updated,
        total_claimed: rewardsDoc.total_claimed || 0,
        total_pending: rewardsDoc.total_pending || 0,
        reward_count: rewardsDoc.reward_count || 0,
        weekly_reward_count: rewardsDoc.weekly_reward_count || 0,
        // Legacy FRY fields
        legacy_fry_aggregated: rewardsDoc.legacy_fry_aggregated || 0,
        legacy_fry_claimable: rewardsDoc.legacy_fry_claimable || 0,
        legacy_fry_claimed: rewardsDoc.legacy_fry_claimed || 0,
        legacy_fry_claimed_snapshot: rewardsDoc.legacy_fry_claimed_snapshot || 0,
        legacy_fry_pending: rewardsDoc.legacy_fry_pending || 0,
        legacy_fry_total: rewardsDoc.legacy_fry_total || 0,
        legacy_fry_claimed_converted: rewardsDoc.legacy_fry_claimed_converted || false,
        // tFRY fields
        tfry_aggregated: rewardsDoc.tfry_aggregated || 0,
        tfry_claimable: rewardsDoc.tfry_claimable || 0,
        tfry_claimed: rewardsDoc.tfry_claimed || 0,
        tfry_pending: rewardsDoc.tfry_pending || 0,
        tfry_total: rewardsDoc.tfry_total || 0,
        // Return full arrays of all rewards (sorted by most recent first)
        daily_rewards: (rewardsDoc.daily_rewards || [])
          .map((reward: DailyReward): ProcessedDailyReward => ({
            date: reward.date,
            amount: reward.amount,
            status: reward.status,
            asset_id: reward.asset_id,
            created_at: reward.created_at,
            claimed_at: reward.claimed_at || null,
            tx_id: reward.tx_id || null
          }))
          .sort((a: ProcessedDailyReward, b: ProcessedDailyReward) => 
            new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime()
          ),
        weekly_rewards: (rewardsDoc.weekly_rewards || [])
          .map((reward: WeeklyReward): ProcessedWeeklyReward => ({
            week_start: reward.week_start,
            week_end: reward.week_end,
            amount: reward.amount,
            status: reward.status,
            asset_id: reward.asset_id,
            unlock_at: reward.unlock_at,
            claimed_at: reward.claimed_at || null,
            tx_id: reward.tx_id || null
          }))
          .sort((a: ProcessedWeeklyReward, b: ProcessedWeeklyReward) => 
            new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
          )
      }

      await logger.info(`Returning device rewards for ${minerKey}`, 'get_device_rewards')
      return NextResponse.json({ rewards: rewardsData })
      
    } catch (mongoError: any) {
      await logger.error(`MongoDB query error for device rewards: ${mongoError.message}`, 'get_device_rewards')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } finally {
      if (client) {
        await client.close()
      }
    }

  } catch (err: any) {
    await logger.error(`Unexpected error in get-device-rewards: ${err.message}`, 'get_device_rewards')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
