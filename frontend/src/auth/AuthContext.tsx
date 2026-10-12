import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '../types/database'

type AuthContextValue = { client: SupabaseClient<Database> | null; session: Session | null; user: User | null; loading: boolean; configured: boolean; sessionError: string | null; acceptSession: (session: Session | null) => void }
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    void import('../lib/supabase').then(({ supabase, supabaseConfigured }) => {
      if (!active) return
      setClient(supabase)
      setConfigured(supabaseConfigured)
      if (!supabase) { setLoading(false); return }
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!active) return
        setSession(nextSession)
        if (event === 'SIGNED_OUT') setSessionError('Your session ended. Sign in again to continue.')
        else setSessionError(null)
        setLoading(false)
      })
      unsubscribe = () => subscription.unsubscribe()
      void supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return
        setSession(data.session)
        if (error) setSessionError('Your session could not be restored. Please sign in again.')
        setLoading(false)
      }).catch(() => {
        if (!active) return
        setSession(null)
        setSessionError('Could not connect to the authentication service. Check your connection and try again.')
        setLoading(false)
      })
    }).catch(() => {
      if (!active) return
      setSession(null)
      setSessionError('Could not load the authentication client. Refresh the page and try again.')
      setLoading(false)
    })
    return () => { active = false; unsubscribe?.() }
  }, [])

  const value = useMemo(() => ({ client, session, user: session?.user ?? null, loading, configured, sessionError, acceptSession: setSession }), [client, session, loading, configured, sessionError])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}

export function getDisplayName(user: User | null, fallback = 'Learner') {
  if (!user) return fallback
  const metadataName = user.user_metadata?.display_name
  return typeof metadataName === 'string' && metadataName.trim() ? metadataName.trim() : user.email?.split('@')[0] ?? fallback
}
