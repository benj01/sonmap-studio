import { User as SupabaseUser } from '@supabase/supabase-js';

export type Message = {
  success?: string;
  error?: string;
  message?: string;
};

export type AuthState = {
  user: SupabaseUser | null;
  loading: boolean;
  error: string | null;
};

export type AuthFormState = {
  message: Message | null;
  formError: string | null;
  isSubmitting: boolean;
};

export type AuthFormData = {
  email: string;
  password: string;
  confirmPassword?: string;
};

export interface CustomUser extends SupabaseUser {
  user_metadata: {
    avatar_url?: string;
    [key: string]: any;
  };
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials extends SignInCredentials {
  confirmPassword: string;
}

export interface SerializableUser {
  // Serializable version of User
}
