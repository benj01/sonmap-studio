import { User } from '@supabase/supabase-js';

export type Message = {
  success?: string;
  error?: string;
  message?: string;
};

export type AuthState = {
  user: User | null;
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
