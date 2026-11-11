"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export default function SignInPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      if (mode === "signin") {
        const res = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/dashboard",
        })
        if (res.error) {
          setError(res.error.message ?? "Invalid email or password")
        } else {
          window.location.href = "/dashboard"
        }
      } else {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          callbackURL: "/dashboard",
        })
        if (res.error) {
          setError(res.error.message ?? "Could not create account")
        } else {
          window.location.href = "/dashboard"
        }
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function signInSocial(provider: "google" | "github") {
    window.location.href = `${API_BASE}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(
      `${window.location.origin}/dashboard`
    )}`
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-bold text-2xl text-brand-700">ConfluenceDitch</span>
          <p className="text-gray-500 text-sm mt-2">
            {mode === "signin" ? "Sign in to start migrating" : "Create your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          <input
            type="password"
            placeholder="Password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-700 hover:bg-brand-600 text-white rounded-lg px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                onClick={() => { setMode("signup"); setError("") }}
                className="text-brand-700 font-medium hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => { setMode("signin"); setError("") }}
                className="text-brand-700 font-medium hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="space-y-3">
          <button
            onClick={() => signInSocial("google")}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => signInSocial("github")}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 rounded-lg px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          By signing in you agree to our Terms of Service.
        </p>
      </div>
    </div>
  )
}
