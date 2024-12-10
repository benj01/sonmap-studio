// /types/auth.ts
import type { User } from '@supabase/supabase-js'

// Basic auth types
export interface SignInCredentials {
  email: string
  password: string
}

export interface SignUpCredentials extends SignInCredentials {
  confirmPassword: string
}

// Auth form states
export interface AuthFormState {
  message: Message | null
  formError: string | null
  isSubmitting: boolean
}

export interface AuthFormData {
  email: string
  password: string
  confirmPassword?: string
}

// Custom user types
export interface CustomUser extends User {
  user_metadata: {
    avatar_url?: string
    [key: string]: any
  }
}