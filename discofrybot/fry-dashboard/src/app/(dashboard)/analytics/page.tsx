import { checkStaffRole } from '@/utils/checkStaffRole'
import { redirect } from 'next/navigation'
import { logger } from '@/utils/logger'
import AnalyticsClient from '@/components/AnalyticsClient'
import StaffPointsClient from '@/components/StaffPointsClient' // Import the new component

export default async function AnalyticsPage() {
  const authorized = await checkStaffRole()
  if (!authorized) {
    await logger.warn('Unauthorized access to /analytics', 'analytics')
    redirect('/unauthorized')
  }

  await logger.info('Staff accessed analytics page', 'analytics')

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard Analytics</h1>
      {/* StaffPointsClient moved to the top */}
      <div className="mb-8">
        <StaffPointsClient />
      </div>
      <AnalyticsClient />
    </div>
  )
}
