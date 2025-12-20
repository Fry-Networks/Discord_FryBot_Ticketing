import { checkStaffRole } from '@/utils/checkStaffRole'
import { redirect } from 'next/navigation'
import TicketListClient from '@/components/TicketListClient'

export default async function TicketsPage() {
  const authorized = await checkStaffRole()
  if (!authorized) {
    redirect('/unauthorized')
  }
  return <TicketListClient />
}