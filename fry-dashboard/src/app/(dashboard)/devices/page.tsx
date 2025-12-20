import { checkStaffRole } from '@/utils/checkStaffRole'
import { redirect } from 'next/navigation'
import DevicesClient from '@/components/DevicesClient'

export default async function DevicesPage() {
  const authorized = await checkStaffRole()
  if (!authorized) {
    redirect('/unauthorized')
  }
  return <DevicesClient />
}
