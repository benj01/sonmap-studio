import { RegisterForm } from '@/components/auth/auth-forms/register-form'

export default function SignUpPage() {
  return (
    <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Create an account</h1>
          <p className="text-muted-foreground">
            Enter your email below to create your account
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  )
} 