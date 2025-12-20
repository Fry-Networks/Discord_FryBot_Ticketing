import { checkStaffRole } from '@/utils/checkStaffRole'
import { redirect } from 'next/navigation'
import NodeForgoClient from '@/components/NodeForgoClient' // Import the new client component

export default async function NodeForgoPage() {
  const authorized = await checkStaffRole()
  if (!authorized) {
    redirect('/unauthorized')
  }
  return <NodeForgoClient />
}
