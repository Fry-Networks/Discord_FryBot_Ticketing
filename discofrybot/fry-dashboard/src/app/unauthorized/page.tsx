import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6">
      <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
      <p className="text-gray-600 mb-4 text-center max-w-sm">
        You don’t have the required Discord role to access this page.
      </p>
      <Link href="/" className="text-blue-600 hover:underline">
        Go back to home
      </Link>
    </main>
  )
}