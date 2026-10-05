'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginWithMaster, setAuthSession, authenticateUser } from './actions'
import { db } from '@/firebase/config'
import { collection, getDocsFromCache } from 'firebase/firestore'
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

      // Mode 1: Master Admin Password quick unlock (when toggled to Master Password mode)
      if (useMasterOnly) {
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
        setError(result.error || 'Invalid master password')
        setLoading(false)
        return
      }

      // Mode 2: Primary Server-Side User Authentication against Firestore Cloud
      const serverAuth = await authenticateUser(trimmedUser, rawPass)
      if (serverAuth.success && serverAuth.session) {
        localStorage.setItem('planner_auth_session', JSON.stringify(serverAuth.session))
        router.push('/')
        router.refresh()
        return
      }

      // If the server explicitly reported an incorrect password for the found user, show it directly
      if (serverAuth.error && serverAuth.error.includes('Incorrect password')) {
        setError(serverAuth.error)
        setLoading(false)
        return
      }

      // Mode 3: Local Offline Cache Fallback (for zero-quota / offline local databases)
      const userMap = new Map<string, any>()
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
      } catch (_) {}

      try {
        const usersRef = collection(db, 'users')
        const cacheSnap = await getDocsFromCache(usersRef)
        cacheSnap.forEach((doc) => {
          const data = doc.data()
          if (data?.username) {
            userMap.set(data.username.toString().trim().toLowerCase(), { id: doc.id, ...data })
          }
        })
      } catch (_) {}

      const candidateUser = userMap.get(trimmedUser.toLowerCase())
      if (candidateUser) {
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
        setError(`Incorrect password for user "${candidateUser.username}". Please check your password.`)
        return
      }

      // Fallback: Check if password entered is the master password
      const masterCheck = await loginWithMaster(trimmedPass)
      if (masterCheck.success) {
        if (masterCheck.session) {
          localStorage.setItem('planner_auth_session', JSON.stringify(masterCheck.session))
        }
        router.push(masterCheck.isGuest ? '/guest-timeline' : '/')
        router.refresh()
        return
      }

      setError(serverAuth.error || `User "${trimmedUser}" not found. Please verify your credentials.`)
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
                    placeholder="e.g. inal.mahpud"
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
