// /types/index.ts

// Re-export all types from individual files
export * from './api'
export * from './auth'
export * from './forms' 
export * from './props'
export * from './store'

// Core shared types
export type Message = {
   success?: string
   error?: string
   message?: string
}

export type Theme = 'light' | 'dark' | 'system'
export type ModalId = 'login' | 'register'

// Response types
export type ActionSuccessResponse<T = unknown> = {
   kind: "success"
   success: true
   message: string
   data?: T
}

export type ActionErrorResponse = {
   kind: "error"
   error: string
   code?: string
}

export type ActionResponse<T = unknown> = ActionSuccessResponse<T> | ActionErrorResponse

// User metadata types
export interface UserMetadata {
  avatar_url?: string;
  full_name?: string;
  preferred_theme?: Theme;
  default_project_id?: string;
  last_login?: string;
  [key: string]: string | undefined;
}

export interface AppMetadata {
  provider?: string;
  providers?: string[];
  roles?: string[];
  [key: string]: string | string[] | undefined;
}

// User types
export type User = {
   id: string
   email?: string
   created_at: string
   updated_at: string
   user_metadata?: UserMetadata
   app_metadata?: AppMetadata
}

export interface SerializableUser extends Omit<User, 'user_metadata' | 'app_metadata'> {
   email?: string
}

// State interfaces
export interface UIState {
   theme: Theme
   setTheme: (theme: Theme) => void
   modals: Record<ModalId, boolean>
   toggleModal: (modalId: ModalId) => void
}

export interface AuthUIState {
   error: string | null
   setError: (error: string | null) => void
   resetError: () => void
}

export interface SignInCredentials {
  email: string
  password: string
}

export interface SignUpCredentials extends SignInCredentials {
  metadata?: Partial<UserMetadata>
}