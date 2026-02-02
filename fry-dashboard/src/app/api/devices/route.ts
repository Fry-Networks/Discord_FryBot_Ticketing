// src/app/api/devices/route.ts

import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'
import { buildMongoClient } from '@/utils/mongoClient'

export async function POST(req: Request) {
  const { 
    search = '', 
    deviceType = '', 
    registrationStatus = '', 
    verificationStatus = '',
    from = 0, 
    to = 49,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = await req.json()

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
      await logger.warn('Invalid Supabase token in get-devices', 'get_devices')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted devices fetch`, 'get_devices')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Build MongoDB filter
    let filter: any = {}
    
    // Search functionality - search across multiple fields
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i')
      filter.$or = [
        { miner_key: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { order: { $regex: searchRegex } },
        { address: { $regex: searchRegex } },
        { reward_wallet: { $regex: searchRegex } },
        { nickname: { $regex: searchRegex } },
        { 'names.first_name': { $regex: searchRegex } },
        { 'names.last_name': { $regex: searchRegex } }
      ]
    }

    // Device type filter
    if (deviceType) {
      filter.miner_key = { $regex: `^${deviceType}-`, $options: 'i' }
    }

    // Registration status filter
    if (registrationStatus === 'registered') {
      filter.is_registered = true
    } else if (registrationStatus === 'unregistered') {
      filter.is_registered = false
    }

    // Verification status filter
    if (verificationStatus === 'verified') {
      filter.verified = true
    } else if (verificationStatus === 'unverified') {
      filter.verified = false
    }

    // Build sort object
    const sortObj: any = {}
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1

    // Query devices collection using MongoDB
    const mongoUri = process.env.MONGO_DASH_URI
    const mongoCaPath = process.env.MONGO_CA_CERT_PATH
    if (!mongoUri) {
      await logger.error('MONGO_DASH_URI environment variable not set', 'get_devices')
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }
    if (!mongoCaPath) {
      await logger.warn('MONGO_CA_CERT_PATH not set; TLS CA bundle may be missing for MongoDB', 'get_devices')
    }

    let client: ReturnType<typeof buildMongoClient> | null = null
    try {
      // Connect to MongoDB
      client = buildMongoClient(mongoUri)
      await client.connect()
      
      const db = client.db('main')
      const devicesCollection = db.collection('devices')
      
      // Get total count for pagination
      const totalCount = await devicesCollection.countDocuments(filter)
      
      // Query the devices collection with filtering, sorting, and pagination
      const devices = await devicesCollection
        .find(filter)
        .sort(sortObj)
        .skip(from)
        .limit(to - from + 1)
        .toArray()

      // Transform MongoDB documents to our expected format
      const transformedDevices = devices.map(device => ({
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
        byod: device.byod || null,
        registration: device.registration || null,
        node: device.node || null,
        staked: device.staked || null
      }))

      await logger.info(`Returning ${transformedDevices.length} devices (${totalCount} total)`, 'get_devices')

      return NextResponse.json({ 
        devices: transformedDevices, 
        total: totalCount,
        hasMore: from + transformedDevices.length < totalCount
      })
      
    } catch (mongoError: any) {
      await logger.error(`MongoDB query error for devices: ${mongoError.message}`, 'get_devices')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } finally {
      if (client) {
        await client.close()
      }
    }

  } catch (err: any) {
    await logger.error(`Unexpected error in get-devices: ${err.message}`, 'get_devices')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
