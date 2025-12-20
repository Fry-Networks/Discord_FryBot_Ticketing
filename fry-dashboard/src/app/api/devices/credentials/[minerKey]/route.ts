// src/app/api/devices/credentials/[minerKey]/route.ts

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
      await logger.warn('Invalid Supabase token in get-device-credentials', 'get_device_credentials')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ✅ Final staff role check
    const isStaff = await checkStaffRoleServerSide(user.id)
    if (!isStaff) {
      await logger.warn(`403: Non-staff user ***${user.id.slice(-6)} attempted device credentials fetch`, 'get_device_credentials')
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Query device credentials from creds database using MongoDB
    const mongoUri = process.env.MONGO_DASH_URI
    if (!mongoUri) {
      await logger.error('MONGO_DASH_URI environment variable not set', 'get_device_credentials')
      return NextResponse.json({ error: 'Database configuration error' }, { status: 500 })
    }

    let client: MongoClient | null = null
    try {
      // Connect to MongoDB
      client = new MongoClient(mongoUri)
      await client.connect()
      
      const credsDb = client.db('creds')
      
      // Collections to search in according to the plan
      const collections = ['hardware', 'camera', 'energy', 'weather', 'water', 'air', 'radiation']
      const credentials: any = {}

      // Search each collection for this miner_key
      for (const collectionName of collections) {
        try {
          const collection = credsDb.collection(collectionName)
          const credDoc = await collection.findOne({ miner_key: minerKey })
          
          if (credDoc) {
            // Transform the document to include relevant fields
            credentials[collectionName] = {
              _id: credDoc._id.toString(),
              miner_key: credDoc.miner_key,
              address: credDoc.address,
              miner_type: credDoc.miner_type || null,
              api_type: credDoc.api_type || null,
              credentials: credDoc.credentials || {},
              credentials_saved_at: credDoc.credentials_saved_at || null,
              position: credDoc.position || null,
              position_saved_at: credDoc.position_saved_at || null
            }
          }
        } catch (err: any) {
          await logger.warn(`Error querying ${collectionName} collection: ${err.message}`, 'get_device_credentials')
        }
      }

      await logger.info(`Returning device credentials for ${minerKey} (found in ${Object.keys(credentials).length} collections)`, 'get_device_credentials')
      return NextResponse.json({ 
        miner_key: minerKey,
        credentials: credentials,
        collections_found: Object.keys(credentials)
      })
      
    } catch (mongoError: any) {
      await logger.error(`MongoDB query error for device credentials: ${mongoError.message}`, 'get_device_credentials')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    } finally {
      if (client) {
        await client.close()
      }
    }

  } catch (err: any) {
    await logger.error(`Unexpected error in get-device-credentials: ${err.message}`, 'get_device_credentials')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
