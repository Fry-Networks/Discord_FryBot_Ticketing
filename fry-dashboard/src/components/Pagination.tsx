'use client'

import React from 'react'

interface PaginationProps {
  totalPages: number
  page: number
  setPage: (page: number) => void
}

export default function Pagination({ totalPages, page, setPage }: PaginationProps) {
    console.log('Pagination loaded:', { totalPages, page })
    if (totalPages <= 1) return null
  
  const renderPageButtons = () => {
    const buttons = []

    if (page > 6) {
      buttons.push(
        <button key={1} onClick={() => setPage(1)} className="px-3 py-1 text-sm rounded bg-slate-600 text-white hover:bg-blue-600">
          1
        </button>
      )
      buttons.push(<span key="left-ellipsis" className="px-2 text-white/60">...</span>)
    }

    const start = Math.max(1, page - 4)
    const end = Math.min(totalPages, page + 5)

    for (let p = start; p <= end; p++) {
      buttons.push(
        <button
          key={p}
          onClick={() => {
            console.log('Changing page to:', p) // ✅ Add this here
            setPage(p)
          }}
          className={`px-3 py-1 text-sm rounded ${
            p === page ? 'bg-neutral-700 text-white' : 'bg-slate-600 text-white hover:bg-blue-600'
          }`}
        >
          {p}
        </button>
      )
    }

    if (page + 5 < totalPages) {
      buttons.push(<span key="right-ellipsis" className="px-2 text-white/60">...</span>)
      buttons.push(
        <button key={totalPages} onClick={() => setPage(totalPages)} className="px-3 py-1 text-sm rounded bg-slate-600 text-white hover:bg-blue-600">
          {totalPages}
        </button>
      )
    }

    return buttons
  }

  return (
    <nav aria-label="Pagination" className="flex justify-center gap-1 mt-6 flex-wrap">
      {page > 1 && (
        <button
          onClick={() => {
            console.log('Prev to page:', page - 1)
            setPage(page - 1)
          }}
          className="px-3 py-1 text-sm rounded bg-slate-600 text-white hover:bg-blue-600"
        >
          Prev
        </button>
      )}

      {renderPageButtons()}

      {page < totalPages && (
        <button
          onClick={() => {
            console.log('Next to page:', page + 1)
            setPage(page + 1)
          }}
          className="px-3 py-1 text-sm rounded bg-slate-600 text-white hover:bg-blue-600"
        >
          Next
        </button>
      )}
    </nav>
  )
}
