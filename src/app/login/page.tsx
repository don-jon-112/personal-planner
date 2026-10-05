'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginWithMaster, setAuthSession } from './actions'
import { db } from '@/firebase/config'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Lock, User, KeyRound, ArrowRight, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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

      // Mode 2: Username + Password authentication against Firestore
      try {
        const usersRef = collection(db, 'users')
        const q = query(usersRef, where('username', '==', trimmedUser))
        const snapshot = await getDocs(q)

        let matchedUser: any = null
        snapshot.forEach((doc) => {
          const data = doc.data()
          if (data.password === trimmedPass) {
            matchedUser = { id: doc.id, ...data }
          }
        })

        // Also check case-insensitive if not found directly
        if (!matchedUser) {
          const allSnapshot = await getDocs(usersRef)
          allSnapshot.forEach((doc) => {
            const data = doc.data()
            if (
              data.username?.toLowerCase() === trimmedUser.toLowerCase() &&
              data.password === trimmedPass
            ) {
              matchedUser = { id: doc.id, ...data }
            }
          })
        }

        if (matchedUser) {
          const session = {
            userId: matchedUser.id,
            username: matchedUser.username,
            name: matchedUser.name || matchedUser.username,
            isSuperAdmin: Boolean(matchedUser.isSuperAdmin),
          }
          localStorage.setItem('planner_auth_session', JSON.stringify(session))
          await setAuthSession(session)
          router.push('/')
          router.refresh()
          return
        }
      } catch (dbErr) {
        console.warn('Firestore query failed, attempting master password fallback...', dbErr)
      }

      // Fallback: Check if entered password is master password
      const masterCheck = await loginWithMaster(trimmedPass)
      if (masterCheck.success) {
        if (masterCheck.session) {
          localStorage.setItem('planner_auth_session', JSON.stringify(masterCheck.session))
        }
        router.push('/')
        router.refresh()
        return
      }

      setError('Incorrect username or password. Please verify your credentials.')
    } catch (err: any) {
      console.error(err)
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
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                  placeholder={useMasterOnly ? 'Enter master site password' : 'Enter your password'}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-center font-medium">
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
