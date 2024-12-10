'use client'

import { RegisterForm } from '@/components/auth/auth-forms/register-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignUpPage() {
  return (
    <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
          <p className="text-muted-foreground">
            Enter your email below to create your account
          </p>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </div>
  )
}