'use client'

import { useState, useEffect, Fragment } from 'react'
import Pagination from '@/components/Pagination'

export interface Device {
  _id: string
  miner_key: string
  name: string
  order: string
  email: string
  created_at: string
  is_registered: boolean
  names: {
    first_name: string
    last_name: string
  }
  nickname?: string
  address: string
  reward_wallet: string
  verified: boolean
  byod?: string
  registration?: {
    amount: number
    asset_id: string
    time: string
    txId: string
  }
  node?: {
    amount: number
    asset_id: string
    time: string
    txId: string
  }
  staked?: {
    amount: number
    asset_id: string
    time: string
    txId: string
    type: 'one' | 'two'
    rewarded_time?: string
  }
}

interface DeviceListProps {
  devices: Device[]
  total: number
  currentPage: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onSearch: (search: string) => void
  onFilters: (filters: {
    deviceType: string
    registrationStatus: string
    verificationStatus: string
  }) => void
  search: string
  deviceType: string
  registrationStatus: string
  verificationStatus: string
  loading: boolean
  accessToken?: string | null
}

// Device type mapping
const DEVICE_TYPES = [
  { key: 'AEM', label: 'AI Edge Miner', category: 'ai', color: 'bg-purple-600' },
  { key: 'RDN', label: 'Reward Decentralization Node', category: 'node', color: 'bg-blue-600' },
  { key: 'SVN', label: 'Storage Validator Node', category: 'node', color: 'bg-blue-600' },
  { key: 'SDN', label: 'Storage Decentralization Node', category: 'node', color: 'bg-blue-600' },
  { key: 'CN', label: 'Contributor Node', category: 'node', color: 'bg-blue-600' },
  { key: 'HWM', label: 'High-End Weather Miner', category: 'weather', color: 'bg-green-600' },
  { key: 'LWM', label: 'Low-End Weather Miner', category: 'weather', color: 'bg-green-600' },
  { key: 'OLWQM', label: 'Outdoor Low-End Water Quality', category: 'water', color: 'bg-cyan-600' },
  { key: 'OHWQM', label: 'Outdoor High-End Water Quality', category: 'water', color: 'bg-cyan-600' },
  { key: 'ILAQM', label: 'Indoor Low-End Air Quality', category: 'air', color: 'bg-orange-600' },
  { key: 'IMAQM', label: 'Indoor Mid-End Air Quality', category: 'air', color: 'bg-orange-600' },
  { key: 'IHAQM', label: 'Indoor High-End Air Quality', category: 'air', color: 'bg-orange-600' },
  { key: 'OMAQM', label: 'Outdoor Mid-End Air Quality', category: 'air', color: 'bg-orange-600' },
  { key: 'OHAQM', label: 'Outdoor High-End Air Quality', category: 'air', color: 'bg-orange-600' },
  { key: 'EM', label: 'Energy Miner', category: 'energy', color: 'bg-yellow-600' },
  { key: 'BM', label: 'Bandwidth Miner', category: 'bandwidth', color: 'bg-pink-600' },
  { key: 'IRM', label: 'Indoor Radiation Miner', category: 'radiation', color: 'bg-red-600' },
  { key: 'IDM', label: 'Indoor Decibel Miner', category: 'sound', color: 'bg-indigo-600' },
  { key: 'ODM', label: 'Outdoor Decibel Miner', category: 'sound', color: 'bg-indigo-600' },
  { key: 'OSM', label: 'Outdoor Satellite Miner', category: 'satellite', color: 'bg-gray-600' },
  { key: 'ISM', label: 'Indoor Satellite Miner', category: 'satellite', color: 'bg-gray-600' },
]

// Token mapping
const TOKEN_NAMES: Record<string, string> = {
  '924268058': 'Fry 1.0',
  '2485314946': 'FRY 2.0',
  '2485202024': 'fNODE',
  '2485198745': 'fVPN',
  '2681521901': 'tFRY'
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const formatNumber = (value: unknown, fallback = '0') => {
  const numeric = toNumber(value)
  return numeric === null ? fallback : numeric.toLocaleString()
}

const formatTokenAmount = (amount: unknown, assetId?: string | null) => {
  const numeric = toNumber(amount)
  if (numeric === null) return 'N/A'
  const tokenName = assetId ? (TOKEN_NAMES[assetId] || assetId) : ''
  const amountText = numeric.toLocaleString()
  return tokenName ? `${amountText} ${tokenName}` : amountText
}

const formatDate = (value: string | Date | null | undefined, fallback = 'N/A') => {
  if (!value) return fallback
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString()
}

const formatDateTime = (value: string | Date | null | undefined, fallback = 'N/A') => {
  if (!value) return fallback
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString()
}

const formatTxSnippet = (value: string | null | undefined, length = 20, fallback = 'N/A') => {
  if (!value) return fallback
  return value.length > length ? `${value.slice(0, length)}...` : value
}

export default function DeviceList({
  devices,
  total,
  currentPage,
  itemsPerPage,
  onPageChange,
  onSearch,
  onFilters,
  search: searchValue,
  deviceType: deviceTypeValue,
  registrationStatus: registrationStatusValue,
  verificationStatus: verificationStatusValue,
  loading,
  accessToken
}: DeviceListProps) {
  const [searchInput, setSearchInput] = useState(searchValue)
  const [deviceTypeFilter, setDeviceTypeFilter] = useState(deviceTypeValue)
  const [registrationFilter, setRegistrationFilter] = useState(registrationStatusValue)
  const [verificationFilter, setVerificationFilter] = useState(verificationStatusValue)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deviceRewards, setDeviceRewards] = useState<Record<string, any>>({})
  const [loadingRewards, setLoadingRewards] = useState<Record<string, boolean>>({})
  const [deviceCredentials, setDeviceCredentials] = useState<Record<string, any>>({})
  const [loadingCredentials, setLoadingCredentials] = useState<Record<string, boolean>>({})
  const [exportingCSV, setExportingCSV] = useState(false)

  const totalPages = Math.ceil(total / itemsPerPage)

  useEffect(() => {
    setSearchInput(searchValue)
  }, [searchValue])

  useEffect(() => {
    const trimmedInput = searchInput.trim()
    const trimmedPropValue = searchValue.trim()

    if (trimmedInput === trimmedPropValue) {
      return
    }

    const handle = setTimeout(() => {
      onSearch(trimmedInput)
    }, 250)

    return () => clearTimeout(handle)
  }, [searchInput, searchValue, onSearch])

  useEffect(() => {
    setDeviceTypeFilter(deviceTypeValue)
  }, [deviceTypeValue])

  useEffect(() => {
    setRegistrationFilter(registrationStatusValue)
  }, [registrationStatusValue])

  useEffect(() => {
    setVerificationFilter(verificationStatusValue)
  }, [verificationStatusValue])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleDeviceTypeChange = (value: string) => {
    setDeviceTypeFilter(value)
    onFilters({
      deviceType: value,
      registrationStatus: registrationFilter,
      verificationStatus: verificationFilter
    })
  }

  const handleRegistrationChange = (value: string) => {
    setRegistrationFilter(value)
    onFilters({
      deviceType: deviceTypeFilter,
      registrationStatus: value,
      verificationStatus: verificationFilter
    })
  }

  const handleVerificationChange = (value: string) => {
    setVerificationFilter(value)
    onFilters({
      deviceType: deviceTypeFilter,
      registrationStatus: registrationFilter,
      verificationStatus: value
    })
  }

  const getDeviceType = (minerKey: string) => {
    const prefix = minerKey.split('-')[0]
    return DEVICE_TYPES.find(type => type.key === prefix)
  }

  // Helper function to determine correct reward token based on device type
  const getRewardTokenForDevice = (minerKey: string) => {
    const prefix = minerKey.split('-')[0]
    // AEM and Nodes earn fNODE, all other miners earn tFRY
    if (prefix === 'AEM' || prefix === 'RDN' || prefix === 'SVN' || prefix === 'SDN' || prefix === 'CN') {
      return '2485202024' // fNODE
    }
    return '2681521901' // tFRY
  }

  // Fetch device rewards from device-rewards collection
  const fetchDeviceRewards = async (minerKey: string) => {
    if (!accessToken) return

    if (Object.prototype.hasOwnProperty.call(deviceRewards, minerKey) || loadingRewards[minerKey]) return

    setLoadingRewards(prev => ({ ...prev, [minerKey]: true }))

    try {
      const res = await fetch(`/api/devices/rewards/${encodeURIComponent(minerKey)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (res.ok) {
        const { rewards } = await res.json()
        setDeviceRewards(prev => ({ ...prev, [minerKey]: rewards ?? null }))
      }
    } catch (err) {
      console.error(`Failed to fetch rewards for ${minerKey}:`, err)
    } finally {
      setLoadingRewards(prev => ({ ...prev, [minerKey]: false }))
    }
  }

  // Export devices to CSV
  const handleExportCSV = async () => {
    if (!accessToken) return

    setExportingCSV(true)

    try {
      const res = await fetch('/api/devices/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          search: searchInput,
          deviceType: deviceTypeFilter,
          registrationStatus: registrationFilter,
          verificationStatus: verificationFilter
        })
      })

      if (res.ok) {
        // Download the CSV file
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `devices-export-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        console.error('Failed to export CSV')
      }
    } catch (err) {
      console.error('Error exporting CSV:', err)
    } finally {
      setExportingCSV(false)
    }
  }

  // Fetch device credentials from creds database
  const fetchDeviceCredentials = async (minerKey: string) => {
    if (!accessToken) return

    if (Object.prototype.hasOwnProperty.call(deviceCredentials, minerKey) || loadingCredentials[minerKey]) return

    setLoadingCredentials(prev => ({ ...prev, [minerKey]: true }))

    try {
      const res = await fetch(`/api/devices/credentials/${encodeURIComponent(minerKey)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (res.ok) {
        const { credentials: credentialPayload } = await res.json()
        setDeviceCredentials(prev => ({ ...prev, [minerKey]: credentialPayload ?? null }))
      }
    } catch (err) {
      console.error(`Failed to fetch credentials for ${minerKey}:`, err)
    } finally {
      setLoadingCredentials(prev => ({ ...prev, [minerKey]: false }))
    }
  }

  // Handle device expansion and fetch rewards + credentials
  const handleDeviceExpand = (deviceId: string, minerKey: string) => {
    const newExpandedId = expandedId === deviceId ? null : deviceId
    setExpandedId(newExpandedId)
    
    // Fetch rewards and credentials when expanding
    if (newExpandedId === deviceId) {
      fetchDeviceRewards(minerKey)
      fetchDeviceCredentials(minerKey)
    }
  }

  const CopyButton = ({ value, label }: { value?: string | null; label: string }) => {
    const [copied, setCopied] = useState(false)

    if (!value) return null

    const handleCopy = async () => {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    }

    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleCopy()
        }}
        className="ml-2 text-gray-300 hover:text-white transition"
        title={`Copy ${label}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 4h8m-4-2v2m0 0a2 2 0 002 2h4a2 2 0 012 2v10a2 2 0 01-2 2h-4a2 2 0 00-2 2v2m-4-2a2 2 0 01-2-2H4a2 2 0 01-2-2V8a2 2 0 012-2h4a2 2 0 002-2"
          />
        </svg>
        {copied && (
          <span className="absolute bg-black text-white text-xs px-2 py-1 rounded ml-2">
            Copied!
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="sticky top-2 z-30 rounded-2xl border border-white/10 bg-black/30 backdrop-blur px-4 py-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-white">Devices</h2>
            <span className="text-gray-400 text-sm">
              Showing {devices.length} of {total} device{total !== 1 ? 's' : ''}
            </span>
            {loading && (
              <span className="text-xs uppercase tracking-wide text-blue-300">
                Refreshing...
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by miner key, email, order, wallet..."
              className="w-full min-w-[220px] rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 lg:w-80"
            />

            <div className="flex flex-wrap gap-3">
              <select
                value={deviceTypeFilter}
                onChange={(e) => handleDeviceTypeChange(e.target.value)}
                className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="">All Device Types</option>
                {DEVICE_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.key} - {type.label}
                  </option>
                ))}
              </select>

              <select
                value={registrationFilter}
                onChange={(e) => handleRegistrationChange(e.target.value)}
                className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="">All Registration</option>
                <option value="registered">Registered</option>
                <option value="unregistered">Unregistered</option>
              </select>

              <select
                value={verificationFilter}
                onChange={(e) => handleVerificationChange(e.target.value)}
                className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="">All Verification</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
              </select>

              <button
                onClick={handleExportCSV}
                disabled={exportingCSV}
                className="rounded border border-green-500 bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                {exportingCSV ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-gray-200">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Miner</th>
                <th className="px-4 py-3 text-left font-semibold">Owner</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Registration</th>
                <th className="px-4 py-3 text-left font-semibold">Verification</th>
                <th className="px-4 py-3 text-left font-semibold">Created</th>
                <th className="px-4 py-3 text-right font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                    {loading ? 'Loading devices...' : 'No devices match the current filters.'}
                  </td>
                </tr>
              ) : (
                devices.map((device) => {
                  const deviceTypeInfo = getDeviceType(device.miner_key)
                  const isExpanded = expandedId === device._id
                  const rewards = deviceRewards[device.miner_key] ?? null
                  const credentials = deviceCredentials[device.miner_key] ?? null
                  const rewardsLoading = Boolean(loadingRewards[device.miner_key])
                  const credentialsLoading = Boolean(loadingCredentials[device.miner_key])
                  const ownerFirst = device.names?.first_name ?? ''
                  const ownerLast = device.names?.last_name ?? ''
                  const ownerDisplay = [ownerFirst, ownerLast].filter(Boolean).join(' ') || 'Unknown'
                  const emailDisplay = device.email || ''
                  const orderDisplay = device.order || 'N/A'
                  const nicknameDisplay = device.nickname || ''
                  const mainWallet = device.address || ''
                  const rewardWallet = device.reward_wallet || ''
                  const byodKey = device.byod || ''
                  const createdDate = formatDate(device.created_at)
                  const rewardTokenId = getRewardTokenForDevice(device.miner_key)
                  const hasLegacyRewards = (toNumber(rewards?.legacy_fry_total) ?? 0) > 0
                  const hasTfryRewards = (toNumber(rewards?.tfry_total) ?? 0) > 0
                  const dailyRewards = Array.isArray(rewards?.daily_rewards) ? rewards.daily_rewards : []
                  const weeklyRewards = Array.isArray(rewards?.weekly_rewards) ? rewards.weekly_rewards : []
                  const hasCredentials = credentials && typeof credentials === 'object' && Object.keys(credentials).length > 0

                  return (
                    <Fragment key={device._id}>
                      <tr className={`transition-colors ${isExpanded ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            {deviceTypeInfo && (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${deviceTypeInfo.color}`}>
                                {deviceTypeInfo.key}
                              </span>
                            )}
                            <div>
                              <div className="font-semibold text-white break-all">{device.miner_key}</div>
                              {nicknameDisplay && (
                                <div className="text-xs text-gray-400">Nickname: {nicknameDisplay}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-gray-100">{ownerDisplay}</div>
                          <div className="text-xs text-gray-400">Order: {orderDisplay}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2">
                            <span className="break-all">{emailDisplay || 'N/A'}</span>
                            <CopyButton value={emailDisplay} label="email" />
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1">
                            <span className={`w-fit rounded px-2 py-0.5 text-xs font-semibold ${
                              device.is_registered ? 'bg-green-700 text-green-100' : 'bg-slate-600 text-slate-200'
                            }`}>
                              {device.is_registered ? 'Registered' : 'Unregistered'}
                            </span>
                            {device.registration && (
                              <span className="text-xs text-gray-400">
                                {formatTokenAmount(device.registration.amount, device.registration.asset_id)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1">
                            <span className={`w-fit rounded px-2 py-0.5 text-xs font-semibold ${
                              device.verified ? 'bg-purple-700 text-purple-100' : 'bg-slate-700 text-slate-200'
                            }`}>
                              {device.verified
                                ? device.staked?.type === 'one'
                                  ? 'Verified 1.5x'
                                  : device.staked?.type === 'two'
                                  ? 'Verified 3x'
                                  : 'Verified'
                                : 'Unverified'}
                            </span>
                            {device.staked && (
                              <span className="text-xs text-gray-400">
                                {formatTokenAmount(device.staked.amount, device.staked.asset_id)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-gray-100">{createdDate}</td>
                        <td className="px-4 py-3 align-top text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeviceExpand(device._id, device.miner_key)
                            }}
                            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs text-gray-200 transition hover:bg-white/10"
                          >
                            {isExpanded ? 'Hide' : 'View'}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.24 4.405a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-black/40">
                          <td colSpan={7} className="px-6 py-6">
                            <div className="space-y-4 text-sm text-gray-300" onClick={(e) => e.stopPropagation()}>
                              <div className="grid gap-4 lg:grid-cols-2">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <strong>Email:</strong>
                                    <span className="break-all">{emailDisplay || 'N/A'}</span>
                                    <CopyButton value={emailDisplay} label="email" />
                                  </div>
                                  {nicknameDisplay && (
                                    <div><strong>Nickname:</strong> {nicknameDisplay}</div>
                                  )}
                                  {byodKey && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <strong>BYOD Key:</strong>
                                      <span className="break-all">{byodKey}</span>
                                      <CopyButton value={byodKey} label="BYOD key" />
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <strong>Main Wallet:</strong>
                                    <span className="break-all">{mainWallet || 'N/A'}</span>
                                    <CopyButton value={mainWallet} label="main wallet" />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <strong>Reward Wallet:</strong>
                                    <span className="break-all">{rewardWallet || 'N/A'}</span>
                                    <CopyButton value={rewardWallet} label="reward wallet" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div><strong>Order:</strong> {orderDisplay}</div>
                                  <div><strong>Created:</strong> {formatDateTime(device.created_at)}</div>
                                  <div><strong>Owner:</strong> {ownerDisplay}</div>
                                </div>
                              </div>

                              {device.registration && (
                                <div className="rounded border border-white/10 bg-black/20 p-3">
                                  <div className="font-semibold text-blue-300 mb-1">Registration Staking</div>
                                  <div>Amount: {formatTokenAmount(device.registration.amount, device.registration.asset_id)}</div>
                                  <div>Date: {formatDate(device.registration.time)}</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>TX ID: {formatTxSnippet(device.registration.txId)}</span>
                                    <CopyButton value={device.registration.txId} label="transaction ID" />
                                  </div>
                                </div>
                              )}

                              {device.node && (
                                <div className="rounded border border-white/10 bg-black/20 p-3">
                                  <div className="font-semibold text-green-300 mb-1">Node Operation Staking</div>
                                  <div>Amount: {formatTokenAmount(device.node.amount, device.node.asset_id)}</div>
                                  <div>Date: {formatDate(device.node.time)}</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>TX ID: {formatTxSnippet(device.node.txId)}</span>
                                    <CopyButton value={device.node.txId} label="transaction ID" />
                                  </div>
                                </div>
                              )}

                              {device.staked && (
                                <div className="rounded border border-white/10 bg-black/20 p-3">
                                  <div className="font-semibold text-purple-300 mb-1">
                                    Verification Staking ({device.staked.type === 'one' ? '1.5x Multiplier' : '3x Multiplier'})
                                  </div>
                                  <div>Amount: {formatTokenAmount(device.staked.amount, device.staked.asset_id)}</div>
                                  <div>Date: {formatDate(device.staked.time)}</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>TX ID: {formatTxSnippet(device.staked.txId)}</span>
                                    <CopyButton value={device.staked.txId} label="transaction ID" />
                                  </div>
                                </div>
                              )}

                              {rewardsLoading && (
                                <div className="rounded border border-white/10 bg-black/20 p-3">
                                  <div className="font-semibold text-yellow-300 mb-1">Loading Rewards...</div>
                                  <div className="text-sm text-gray-400">Fetching rewards data...</div>
                                </div>
                              )}

                              {rewards && (
                                <div className="rounded border border-white/10 bg-black/20 p-3 space-y-4">
                                  <div className="font-semibold text-yellow-300">Device Rewards</div>
                                  {hasLegacyRewards && (
                                    <div className="rounded bg-gray-800/50 p-2">
                                      <div className="text-xs font-semibold text-blue-300 mb-2">Legacy FRY (Fry 1.0)</div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <div className="text-gray-400">Total</div>
                                          <div className="font-semibold">{formatNumber(rewards.legacy_fry_total)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Claimed</div>
                                          <div className="font-semibold text-green-400">{formatNumber(rewards.legacy_fry_claimed)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Claimable</div>
                                          <div className="font-semibold text-yellow-400">{formatNumber(rewards.legacy_fry_claimable)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Pending</div>
                                          <div className="font-semibold text-orange-400">{formatNumber(rewards.legacy_fry_pending)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Aggregated</div>
                                          <div className="font-semibold text-blue-400">{formatNumber(rewards.legacy_fry_aggregated)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Converted</div>
                                          <div className={`font-semibold ${rewards.legacy_fry_claimed_converted ? 'text-green-400' : 'text-red-400'}`}>
                                            {rewards.legacy_fry_claimed_converted ? 'Yes' : 'No'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {hasTfryRewards && (
                                    <div className="rounded bg-gray-800/50 p-2">
                                      <div className="text-xs font-semibold text-purple-300 mb-2">tFRY (New Rewards)</div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <div className="text-gray-400">Total</div>
                                          <div className="font-semibold">{formatNumber(rewards.tfry_total)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Claimed</div>
                                          <div className="font-semibold text-green-400">{formatNumber(rewards.tfry_claimed)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Claimable</div>
                                          <div className="font-semibold text-yellow-400">{formatNumber(rewards.tfry_claimable)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Pending</div>
                                          <div className="font-semibold text-orange-400">{formatNumber(rewards.tfry_pending)}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-400">Aggregated</div>
                                          <div className="font-semibold text-blue-400">{formatNumber(rewards.tfry_aggregated)}</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  <div className="grid gap-2 text-xs md:grid-cols-2">
                                    <div>
                                      <div className="text-gray-400">Total Claimed</div>
                                      <div className="font-semibold">{formatTokenAmount(rewards.total_claimed, rewardTokenId)}</div>
                                    </div>
                                    <div>
                                      <div className="text-gray-400">Total Pending</div>
                                      <div className="font-semibold">{formatTokenAmount(rewards.total_pending, rewardTokenId)}</div>
                                    </div>
                                    <div>
                                      <div className="text-gray-400">Claimable Rewards</div>
                                      <div className="font-semibold">{formatTokenAmount(rewards.claimable_rewards, rewardTokenId)}</div>
                                    </div>
                                    <div>
                                      <div className="text-gray-400">Aggregated Rewards</div>
                                      <div className="font-semibold">{formatTokenAmount(rewards.aggregated_rewards, rewardTokenId)}</div>
                                    </div>
                                    <div>
                                      <div className="text-gray-400">Reward Count</div>
                                      <div className="font-semibold">{formatNumber(rewards.reward_count)}</div>
                                    </div>
                                    <div>
                                      <div className="text-gray-400">Weekly Reward Count</div>
                                      <div className="font-semibold">{formatNumber(rewards.weekly_reward_count)}</div>
                                    </div>
                                  </div>

                                  {dailyRewards.length > 0 && (
                                    <div>
                                      <div className="mb-2 text-xs text-gray-400">Daily Rewards History ({dailyRewards.length} total)</div>
                                      <div className="max-h-64 space-y-2 overflow-y-auto">
                                        {dailyRewards.map((reward: any, index: number) => {
                                          const rewardTx = typeof reward?.tx_id === 'string' ? reward.tx_id : null
                                          return (
                                            <div key={index} className="rounded bg-black/40 p-2 text-xs">
                                              <div className="flex justify-between">
                                                <div><strong>Date:</strong> {formatDate(reward?.date || reward?.created_at)}</div>
                                                <div><strong>Status:</strong> {reward?.status || 'unknown'}</div>
                                              </div>
                                              <div><strong>Amount:</strong> {formatTokenAmount(reward?.amount, reward?.asset_id)}</div>
                                              {reward?.unlock_at && (
                                                <div><strong>Unlock:</strong> {formatDate(reward.unlock_at)}</div>
                                              )}
                                              {reward?.claimed_at && (
                                                <div><strong>Claimed:</strong> {formatDate(reward.claimed_at)}</div>
                                              )}
                                              <div className="flex items-center gap-2">
                                                <strong>TX:</strong>
                                                <span>{formatTxSnippet(rewardTx, 12)}</span>
                                                <CopyButton value={rewardTx} label="transaction ID" />
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {weeklyRewards.length > 0 && (
                                    <div>
                                      <div className="mb-2 text-xs text-gray-400">Weekly Rewards History ({weeklyRewards.length} total)</div>
                                      <div className="max-h-64 space-y-2 overflow-y-auto">
                                        {weeklyRewards.map((reward: any, index: number) => {
                                          const rewardTx = typeof reward?.tx_id === 'string' ? reward.tx_id : null
                                          return (
                                            <div key={index} className="rounded bg-black/40 p-2 text-xs">
                                              <div className="flex justify-between">
                                                <div>
                                                  <strong>Week:</strong> {formatDate(reward?.week_start)} - {formatDate(reward?.week_end)}
                                                </div>
                                                <span className={`px-1 py-0.5 rounded text-xs ${
                                                  reward?.status === 'claimed' ? 'bg-green-600' :
                                                  reward?.status === 'pending' ? 'bg-orange-600' :
                                                  'bg-gray-600'
                                                }`}>
                                                  {reward?.status || 'unknown'}
                                                </span>
                                              </div>
                                              <div><strong>Amount:</strong> {formatTokenAmount(reward?.amount, reward?.asset_id)}</div>
                                              {reward?.unlock_at && (
                                                <div><strong>Unlock:</strong> {formatDate(reward.unlock_at)}</div>
                                              )}
                                              {reward?.claimed_at && (
                                                <div><strong>Claimed:</strong> {formatDate(reward.claimed_at)}</div>
                                              )}
                                              <div className="flex items-center gap-2">
                                                <strong>TX:</strong>
                                                <span>{formatTxSnippet(rewardTx, 12)}</span>
                                                <CopyButton value={rewardTx} label="transaction ID" />
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {rewards.last_updated && (
                                    <div className="border-t border-gray-600 pt-2 text-xs text-gray-400">
                                      <strong>Last Updated:</strong> {formatDateTime(rewards.last_updated)}
                                    </div>
                                  )}
                                </div>
                              )}

                              {!rewardsLoading && !rewards && (
                                <div className="rounded border border-white/10 bg-black/20 p-3">
                                  <div className="font-semibold text-gray-400 mb-1">No Rewards Data</div>
                                  <div className="text-sm text-gray-500">No rewards found for this device.</div>
                                </div>
                              )}

                              {credentialsLoading && (
                                <div className="rounded border border-white/10 bg-black/20 p-3">
                                  <div className="font-semibold text-blue-300 mb-1">Loading Credentials...</div>
                                  <div className="text-sm text-gray-400">Fetching credentials data...</div>
                                </div>
                              )}

                              {hasCredentials && (
                                <div className="rounded border border-white/10 bg-black/20 p-3 space-y-3">
                                  <div className="font-semibold text-blue-300">Device Credentials</div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    {Object.entries(credentials).map(([category, data]: [string, any]) => {
                                      const credentialData = (data && typeof data === 'object') ? data : {}
                                      const position = credentialData.position && typeof credentialData.position === 'object' ? credentialData.position : {}
                                      const creds = credentialData.credentials && typeof credentialData.credentials === 'object' ? credentialData.credentials : {}
                                      return (
                                        <div key={category} className="rounded bg-black/40 p-3">
                                          <div className="text-sm font-semibold text-gray-200 capitalize">{category.replace(/_/g, ' ')}</div>
                                          {Object.keys(creds).length > 0 ? (
                                            <div className="mt-2 space-y-1 text-xs text-gray-300">
                                              {Object.entries(creds).map(([key, value]) => (
                                                <div key={key}>
                                                  <strong>{key}:</strong> {String(value)}
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="mt-2 text-xs text-gray-400">No credentials stored.</div>
                                          )}
                                          {(position.lat !== undefined && position.lat !== null) ||
                                          (position.lng !== undefined && position.lng !== null) ||
                                          (position.hexId !== undefined && position.hexId !== null) ? (
                                            <div className="mt-2 space-y-1 text-xs text-gray-300">
                                              <div><strong>Lat:</strong> {position.lat ?? 'N/A'}</div>
                                              <div><strong>Lng:</strong> {position.lng ?? 'N/A'}</div>
                                              <div><strong>Hex ID:</strong> {position.hexId ?? 'N/A'}</div>
                                            </div>
                                          ) : null}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {!credentialsLoading && !hasCredentials && (
                                <div className="rounded border border-white/10 bg-black/20 p-3">
                                  <div className="font-semibold text-gray-400 mb-1">No Credentials</div>
                                  <div className="text-sm text-gray-500">No credentials found for this device.</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination totalPages={totalPages} page={currentPage + 1} setPage={(page) => onPageChange(page - 1)} />
        </div>
      )}
    </div>
  )
}
