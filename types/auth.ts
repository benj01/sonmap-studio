// /types/auth.ts
import { User } from '@supabase/supabase-js'
import { Message } from './index'  // Add this import

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
    full_name?: string
  } & Record<string, any>
}