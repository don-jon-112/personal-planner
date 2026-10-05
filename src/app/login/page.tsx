'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginWithMaster, setAuthSession } from './actions'
import { db } from '@/firebase/config'
import { collection, getDocs, getDocsFromCache, enableNetwork } from 'firebase/firestore'
import { Lock, User, KeyRound, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [useMasterOnly, setUseMasterOnly] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const trimmedUser = username.trim()
      const rawPass = password
      const trimmedPass = password.trim()

      // Mode 1: Master Admin Password quick unlock
      if (useMasterOnly || !trimmedUser) {
        const result = await loginWithMaster(trimmedPass)
        if (result.success) {
          if (result.session) {
            localStorage.setItem('planner_auth_session', JSON.stringify(result.session))
          }
          if (result.isGuest) {
            router.push('/guest-timeline')
          } else {
            router.push('/')
          }
          router.refresh()
          return
        }
        if (useMasterOnly) {
          setError(result.error || 'Invalid master password')
          setLoading(false)
          return
        }
      }

      // Mode 2: Multi-source User Authentication
      // Accumulate users from localStorage cache, IndexedDB cache, and Cloud Firestore
      const userMap = new Map<string, any>()

      // Source A: LocalStorage cache (instant, always available on the device)
      try {
        const localCached = localStorage.getItem('planner_cached_users')
        if (localCached) {
          const parsed = JSON.parse(localCached)
          if (Array.isArray(parsed)) {
            for (const u of parsed) {
              if (u?.username) {
                userMap.set(u.username.toString().trim().toLowerCase(), u)
              }
            }
          }
        }
      } catch (err) {
        console.warn('LocalStorage users cache read error:', err)
      }

      // Source B: Firestore local IndexedDB cache (works offline / zero quota)
      try {
        const usersRef = collection(db, 'users')
        const cacheSnap = await getDocsFromCache(usersRef)
        cacheSnap.forEach((doc) => {
          const data = doc.data()
          if (data?.username) {
            userMap.set(data.username.toString().trim().toLowerCase(), { id: doc.id, ...data })
          }
        })
      } catch (cacheErr) {
        console.warn('Firestore cache fetch skipped or empty:', cacheErr)
      }

      // Source C: Firestore Cloud network query (fetch newest users if online)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await enableNetwork(db).catch(() => {})
          const usersRef = collection(db, 'users')
          // Timeout race so slow connection never hangs authentication
          const fetchPromise = getDocs(usersRef)
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout')), 4000)
          )
          const netSnap = await Promise.race([fetchPromise, timeoutPromise])
          netSnap.forEach((doc: any) => {
            const data = doc.data()
            if (data?.username) {
              userMap.set(data.username.toString().trim().toLowerCase(), { id: doc.id, ...data })
            }
          })

          // Save newly discovered users to localStorage for instant subsequent logins
          try {
            const allUsers = Array.from(userMap.values())
            localStorage.setItem('planner_cached_users', JSON.stringify(allUsers))
          } catch (_) {}
        } catch (netErr) {
          console.warn('Firestore network query skipped or timed out:', netErr)
        }
      }

      // Check if user exists in any collected source
      const userKey = trimmedUser.toLowerCase()
      let candidateUser = userMap.get(userKey)

      // Fallback for default seeded Super Admin
      if (!candidateUser && userKey === 'admin') {
        candidateUser = {
          id: 'admin_default',
          username: 'admin',
          name: 'Super Administrator',
          password: 'AdminPassword2026!',
          isSuperAdmin: true,
        }
      }

      if (candidateUser) {
        // Password validation: match exact or trimmed
        const storedPass = (candidateUser.password || '').toString()
        const isPasswordCorrect =
          storedPass === rawPass ||
          storedPass === trimmedPass ||
          storedPass.trim() === trimmedPass

        if (isPasswordCorrect) {
          const session = {
            userId: candidateUser.id || `user_${candidateUser.username}`,
            username: candidateUser.username,
            name: candidateUser.name || candidateUser.username,
            isSuperAdmin: Boolean(candidateUser.isSuperAdmin),
          }
          localStorage.setItem('planner_auth_session', JSON.stringify(session))
          await setAuthSession(session)
          router.push('/')
          router.refresh()
          return
        }

        // Check if Master Password was entered as a super admin override
        const masterCheck = await loginWithMaster(trimmedPass)
        if (masterCheck.success && !masterCheck.isGuest) {
          const session = {
            userId: candidateUser.id || `user_${candidateUser.username}`,
            username: candidateUser.username,
            name: candidateUser.name || candidateUser.username,
            isSuperAdmin: Boolean(candidateUser.isSuperAdmin),
          }
          localStorage.setItem('planner_auth_session', JSON.stringify(session))
          await setAuthSession(session)
          router.push('/')
          router.refresh()
          return
        }

        setError(`Incorrect password for user "${candidateUser.username}". Please check your password.`)
        return
      }

      // If user wasn't found, check if password entered is the master password
      const masterCheck = await loginWithMaster(trimmedPass)
      if (masterCheck.success) {
        if (masterCheck.session) {
          localStorage.setItem('planner_auth_session', JSON.stringify(masterCheck.session))
        }
        if (masterCheck.isGuest) {
          router.push('/guest-timeline')
        } else {
          router.push('/')
        }
        router.refresh()
        return
      }

      setError(`User "${trimmedUser}" not found. Please verify the username or sign in with Master Password.`)
    } catch (err: any) {
      console.error('Authentication error:', err)
      setError('An error occurred during authentication. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex-1 bg-background flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="p-6 sm:p-8 md:p-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-1">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Work Planner Login
            </h1>
            <p className="text-sm text-muted-foreground">
              {useMasterOnly ? 'Enter Master Admin password to unlock' : 'Sign in with your user credentials'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!useMasterOnly && (
              <div className="space-y-1.5">
                <label
                  htmlFor="username"
                  className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    placeholder="e.g. john.doe"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required={!useMasterOnly}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseMasterOnly(!useMasterOnly)
                    setError('')
                  }}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  {useMasterOnly ? 'Sign in with Username' : 'Master Password'}
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition font-mono"
                  placeholder={useMasterOnly ? 'Enter master site password' : 'Enter your password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-center font-medium leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 text-center border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Role-Based Access Control Enabled
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
