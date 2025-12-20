import { checkStaffRole } from '@/utils/checkStaffRole'
import { redirect } from 'next/navigation'
import { logger } from '@/utils/logger'
import LogList from '@/components/LogList'

export default async function LogsPage() {
  const authorized = await checkStaffRole()
  if (!authorized) {
    await logger.warn('Unauthorized access to /logs', 'logs_page')
    redirect('/unauthorized')
  }

  await logger.info('Staff accessed logs page', 'logs_page')
  return <LogList />
}