'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export default function NavBar() {
  const pathname = usePathname()

  const linkClass = (path: string) =>
    `hover:text-bg-neutral-700 transition-colors ${
      pathname === path ? 'underline text-bg-neutral-700' : ''
    }`

  return (
    <nav className="w-full px-6 py-3 bg-black/40 backdrop-blur-sm border-b border-white/10 flex gap-12 text-sm sm:text-base font-medium text-white">
      <Link href="/tickets" className={linkClass('/tickets')}>Tickets</Link>
      <Link href="/devices" className={linkClass('/devices')}>Devices</Link>
      <Link href="/node-forgo" className={linkClass('/node-forgo')}>Node Forgo Program</Link>
      <Link href="/analytics" className={linkClass('/analytics')}>Analytics</Link>
      <Link href="/rewards" className={linkClass('/rewards')}>Rewards</Link>
      <Link href="/logs" className={linkClass('/logs')}>Logs</Link>
      <Link href="/admin/announcements" className={linkClass('/admin/announcements')}>Announcements</Link>
    </nav>
  )
}
