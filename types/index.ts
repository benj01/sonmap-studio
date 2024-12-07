export type Message = {
    success?: string;
    error?: string;
    message?: string;
};

export type ActionSuccessResponse<T = unknown> = {
    kind: "success";
    success: true;
    message: string;
    data?: T;
};

export type ActionErrorResponse = {
    kind: "error";
    error: string;
    code?: string;
};

export type ActionResponse<T = unknown> =
    | ActionSuccessResponse<T>
    | ActionErrorResponse;

export type User = {
  id: string
  email?: string
  created_at: string
  updated_at: string
}

export type Theme = 'light' | 'dark' | 'system'

export interface SerializableUser {
  id: string
  email: string | null
  created_at: string
  updated_at: string
}

export interface AuthState {
  user: SerializableUser | null
  isLoading: boolean
  error: string | null
  initialized: boolean
  signIn: (credentials: SignInCredentials) => Promise<void>
  signUp: (credentials: SignUpCredentials) => Promise<void>
  signOut: () => Promise<void>
  checkUser: () => Promise<void>
  resetError: () => void
}

export interface UIState {
  theme: Theme
  setTheme: (theme: Theme) => void
  modals: Record<ModalId, boolean>
  toggleModal: (modalId: ModalId) => void
}

export type ModalId = 'login' | 'register'
