'use client'

import { LoginForm } from '@/components/auth/auth-forms/login-form'

export default function SignInPage() {
  return (
    <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Sign in to your account</h1>
          <p className="text-muted-foreground">
            Enter your email below to sign in to your account
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}