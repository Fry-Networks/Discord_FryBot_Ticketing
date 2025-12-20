// src/app/api/devices/export/route.ts

import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'
import { logger } from '@/utils/logger'
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole'
import { MongoClient } from 'mongodb'

// Token mapping for CSV export
const TOKEN_NAMES: Record<string, string> = {
  '924268058': 'Fry 1.0',
  '2485314946': 'FRY 2.0',
  '2485202024': 'fNODE',
  '2485198745': 'fVPN',
  '2681521901': 'tFRY'
}

export async function POST(req: Request) {
  const { 
    search = '', 
    deviceType = '', 
    registrationStatus = '', 
    verificationStatus = ''
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
      await logger.warn('Invalid Supabase token in export-devices', 'export_devices')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted devices export`, 'export_devices')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Build MongoDB filter (same as main devices endpoint)
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

    // Query devices collection using MongoDB
    const mongoUri = process.env.MONGO_DASH_URI
    if (!mongoUri) {
      await logger.error('MONGO_DASH_URI environment variable not set', 'export_devices')
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    let client: MongoClient | null = null
    try {
      // Connect to MongoDB
      client = new MongoClient(mongoUri)
      await client.connect()
      
      const db = client.db('main')
      const devicesCollection = db.collection('devices')
      
      // Query all matching devices (no pagination for export)
      const devices = await devicesCollection
        .find(filter)
        .sort({ created_at: -1 })
        .toArray()

      // Helper function to format token amounts
      const formatTokenAmount = (amount: number, assetId: string) => {
        const tokenName = TOKEN_NAMES[assetId] || assetId
        return `${amount} ${tokenName}`
      }

      // Generate CSV headers
      const headers = [
        'Miner Key',
        'Device Type',
        'Order Number',
        'Owner First Name',
        'Owner Last Name',
        'Email',
        'Nickname',
        'Main Wallet',
        'Reward Wallet',
        'Created Date',
        'Registration Status',
        'Verification Status',
        'Verification Type',
        'Registration Amount',
        'Registration Token',
        'Registration Date',
        'Registration TX ID',
        'Node Amount',
        'Node Token', 
        'Node Date',
        'Node TX ID',
        'Verification Amount',
        'Verification Token',
        'Verification Date',
        'Verification TX ID'
      ]

      // Generate CSV rows
      const rows = devices.map(device => {
        const deviceType = device.miner_key.split('-')[0]
        const verificationMultiplier = device.staked?.type === 'one' ? '1.5x' : device.staked?.type === 'two' ? '3x' : ''
        
        return [
          device.miner_key || '',
          deviceType || '',
          device.order || '',
          device.names?.first_name || '',
          device.names?.last_name || '',
          device.email || '',
          device.nickname || '',
          device.address || '',
          device.reward_wallet || '',
          device.created_at ? new Date(device.created_at).toISOString().split('T')[0] : '',
          device.is_registered ? 'Registered' : 'Unregistered',
          device.verified ? `Verified ${verificationMultiplier}` : 'Unverified',
          device.staked?.type || '',
          device.registration?.amount || '',
          device.registration?.asset_id ? TOKEN_NAMES[device.registration.asset_id] || device.registration.asset_id : '',
          device.registration?.time ? new Date(device.registration.time).toISOString().split('T')[0] : '',
          device.registration?.txId || '',
          device.node?.amount || '',
          device.node?.asset_id ? TOKEN_NAMES[device.node.asset_id] || device.node.asset_id : '',
          device.node?.time ? new Date(device.node.time).toISOString().split('T')[0] : '',
          device.node?.txId || '',
          device.staked?.amount || '',
          device.staked?.asset_id ? TOKEN_NAMES[device.staked.asset_id] || device.staked.asset_id : '',
          device.staked?.time ? new Date(device.staked.time).toISOString().split('T')[0] : '',
          device.staked?.txId || ''
        ]
      })

      // Convert to CSV format
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n')

      await logger.info(`Exported ${devices.length} devices to CSV`, 'export_devices')

      // Return CSV content
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="devices-export-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
      
    } catch (mongoError: any) {
      await logger.error(`MongoDB query error for devices export: ${mongoError.message}`, 'export_devices')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } finally {
      if (client) {
        await client.close()
      }
    }

  } catch (err: any) {
    await logger.error(`Unexpected error in export-devices: ${err.message}`, 'export_devices')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
