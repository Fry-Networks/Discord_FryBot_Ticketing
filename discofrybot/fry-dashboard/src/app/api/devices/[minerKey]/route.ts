// src/app/api/devices/[minerKey]/route.ts

import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'
import { MongoClient } from 'mongodb'

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
      await logger.warn('Invalid Supabase token in get-device-details', 'get_device_details')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted device details fetch`, 'get_device_details')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Query device collection using MongoDB
    const mongoUri = process.env.MONGO_URI
    if (!mongoUri) {
      await logger.error('MONGO_URI environment variable not set', 'get_device_details')
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    let client: MongoClient | null = null
    try {
      // Connect to MongoDB
      client = new MongoClient(mongoUri)
      await client.connect()
      
      const db = client.db('main')
      const devicesCollection = db.collection('devices')
      
      // Query the specific device
      const device = await devicesCollection.findOne({ miner_key: minerKey })
      
      if (!device) {
        await logger.info(`Device not found: ${minerKey}`, 'get_device_details')
        return NextResponse.json({ error: 'Device not found' }, { status: 404 })
      }

      // Transform MongoDB document to our expected format
      const transformedDevice = {
        _id: device._id.toString(),
        miner_key: device.miner_key,
        name: device.name,
        order: device.order,
        email: device.email,
        created_at: device.created_at,
        is_registered: device.is_registered,
        names: device.names || { first_name: '', last_name: '' },
        nickname: device.nickname || '',
        address: device.address,
        reward_wallet: device.reward_wallet,
        verified: device.verified,
        registration: device.registration || null,
        node: device.node || null,
        staked: device.staked || null
      }

      await logger.info(`Returning device details for ${minerKey}`, 'get_device_details')
      return NextResponse.json({ device: transformedDevice })
      
    } catch (mongoError: any) {
      await logger.error(`MongoDB query error for device details: ${mongoError.message}`, 'get_device_details')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } finally {
      if (client) {
        await client.close()
      }
    }

  } catch (err: any) {
    await logger.error(`Unexpected error in get-device-details: ${err.message}`, 'get_device_details')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
