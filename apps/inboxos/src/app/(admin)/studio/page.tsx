'use client'

// /studio → default to the clinic management page.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function StudioIndex() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/studio/clinics')
  }, [router])
  return null
}
