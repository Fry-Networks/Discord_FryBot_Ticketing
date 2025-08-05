import Header from '@/components/Header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <main className="flex-1 overflow-y-auto pt-32 px-4 sm:px-6">
        {children}
      </main>
    </div>
  )
}
