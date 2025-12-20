'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/supabaseClient'
import DeviceList, { Device } from './DeviceList'
import { log } from '@/utils/loggerClient'

export default function DevicesClient() {
  const supabase = createClient()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [registrationStatus, setRegistrationStatus] = useState('')
  const [verificationStatus, setVerificationStatus] = useState('')
  const [currentPage, setCurrentPage] = useState(0)
  const [itemsPerPage] = useState(50)

  useEffect(() => {
    // ✅ Log dashboard access
    const logAccess = async () => {
      await log('info', 'devices_client', 'Staff accessed devices page')
    }
    logAccess()
  }, [])

  useEffect(() => {
    const loadDevices = async () => {
      setLoading(true)

      // First verify user authentication
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        await log('error', 'devices_client', 'No authenticated user found in DevicesClient')
        setDevices([])
        setLoading(false)
        return
      }

      // Get session for access token only after user verification
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession()

      if (sessionError || !session?.access_token) {
        await log('error', 'devices_client', 'No valid session found in DevicesClient')
        setDevices([])
        setLoading(false)
        return
      }
      
      // Store the access token in state
      setAccessToken(session.access_token)
    
      const from = currentPage * itemsPerPage
      const to = from + itemsPerPage - 1

      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          search,
          deviceType,
          registrationStatus,
          verificationStatus,
          from,
          to,
          sortBy: 'created_at',
          sortOrder: 'desc'
        })
      })

      if (!res.ok) {
        const errorText = await res.text()
        await log('error', 'devices_client', `❌ Failed to load devices: ${res.status} ${errorText}`)
        setDevices([])
        setLoading(false)
        return
      }

      const { devices: fetchedDevices, total: totalCount } = await res.json()
      setDevices(fetchedDevices || [])
      setTotal(totalCount || 0)
      await log('info', 'devices_client', `✅ Loaded ${fetchedDevices?.length || 0} devices (${totalCount} total)`)
      setLoading(false)
    }

    loadDevices()
  }, [search, deviceType, registrationStatus, verificationStatus, currentPage, itemsPerPage])

  const handleSearch = (newSearch: string) => {
    setSearch(newSearch)
    setCurrentPage(0) // Reset to first page when searching
  }

  const handleFilters = (filters: {
    deviceType: string
    registrationStatus: string
    verificationStatus: string
  }) => {
    setDeviceType(filters.deviceType)
    setRegistrationStatus(filters.registrationStatus)
    setVerificationStatus(filters.verificationStatus)
    setCurrentPage(0) // Reset to first page when filtering
  }

  return (
    <DeviceList 
      devices={devices}
      total={total}
      currentPage={currentPage}
      itemsPerPage={itemsPerPage}
      onPageChange={setCurrentPage}
      onSearch={handleSearch}
      onFilters={handleFilters}
      search={search}
      deviceType={deviceType}
      registrationStatus={registrationStatus}
      verificationStatus={verificationStatus}
      loading={loading}
      accessToken={accessToken}
    />
  )
}
