'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'

export default function GoogleProviderWrapper({
  clientId,
  children,
}: {
  clientId: string
  children: React.ReactNode
}) {
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
}
