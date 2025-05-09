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

// User metadata types
export interface UserMetadata {
  avatar_url?: string
  full_name?: string
  preferred_theme?: 'light' | 'dark' | 'system'
  default_project_id?: string
  last_login?: string
  [key: string]: string | undefined
}

// Custom user types
export interface CustomUser extends User {
  user_metadata: UserMetadata
}