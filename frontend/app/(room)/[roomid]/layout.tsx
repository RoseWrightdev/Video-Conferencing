import type { Metadata } from 'next'
import { type ReactNode, Suspense } from 'react'
import Loading from './loading'

export const metadata: Metadata = {
  title: 'Video Room',
  description: 'Video conferencing room',
}

export default function RoomLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <Suspense fallback={<Loading />}>
      {children}
    </Suspense>
  )
}
