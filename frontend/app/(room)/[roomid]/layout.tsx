import type { Metadata } from 'next'
import { Suspense } from 'react'
import Loading from './loading'

export const metadata: Metadata = {
  title: 'Video Room',
  description: 'Video conferencing room',
}

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<Loading />}>
      {children}
    </Suspense>
  )
}
