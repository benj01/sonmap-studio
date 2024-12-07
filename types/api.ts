export type ApiResponse<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
};

export type ErrorResponse = {
  error: string;
  code?: string;
};

export type SuccessResponse<T = void> = {
  success: true;
  message: string;
  data?: T;
};

export type ActionResponse<T = void> = {
  kind: "success" | "error";
  message: string;
  error?: string;
  code?: string;
  data?: T;
};

export interface SignInCredentials {
  email: string
  password: string
}

export interface SignUpCredentials extends SignInCredentials {
  confirmPassword: string
}

export interface AuthResponse {
  user: SerializableUser | null
  error?: string
}

export interface Profile {
  id: string
  user_id: string
  username?: string
  full_name?: string
  avatar_url?: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface CreateNoteInput {
  title: string
  content: string
}

export interface UpdateNoteInput extends Partial<CreateNoteInput> {
  id: string
}
