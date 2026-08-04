'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from './actions'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(password)
      
      if (result.success) {
        router.push('/')
        router.refresh()
      } else {
        setError(result.error || 'Login failed')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex-1 bg-background flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="p-6 sm:p-8 md:p-10 space-y-6 sm:space-y-8">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight mb-2">Welcome Back</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Enter password to access your planner</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <div className="space-y-1.5 sm:space-y-2">
              <label 
                htmlFor="password" 
                className="block text-sm font-semibold text-foreground"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-lg border border-border bg-input text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition duration-200"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 sm:py-3 px-4 rounded-lg shadow-sm transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center text-sm sm:text-base"
            >
              {loading ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : null}
              {loading ? 'Verifying...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
