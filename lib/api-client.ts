import { createClient } from '@supabase/supabase-js'
import type { 
  SignInCredentials, 
  SignUpCredentials,
  AuthResponse,
  Profile,
  Note,
  CreateNoteInput,
  UpdateNoteInput 
} from '@/types'

// Validate environment variables before creating the instance
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

class ApiClient {
  private supabase = createClient(
    SUPABASE_URL as string,
    SUPABASE_ANON_KEY as string
  )

  // Auth methods
  auth = {
    signIn: async (credentials: SignInCredentials): Promise<AuthResponse> => {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) {
        return { user: null, error: error.message }
      }

      return { user: data.user }
    },

    signUp: async (credentials: SignUpCredentials): Promise<AuthResponse> => {
      const { data, error } = await this.supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) {
        return { user: null, error: error.message }
      }

      return { user: data.user }
    },

    signOut: async (): Promise<void> => {
      const { error } = await this.supabase.auth.signOut()
      if (error) throw error
    },

    getUser: async () => {
      const { data: { user }, error } = await this.supabase.auth.getUser()
      if (error) throw error
      return user
    }
  }

  // Profile methods
  profiles = {
    get: async (userId: string): Promise<Profile> => {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error) throw error
      return data
    },

    update: async (userId: string, profile: Partial<Profile>): Promise<Profile> => {
      const { data, error } = await this.supabase
        .from('profiles')
        .upsert({ user_id: userId, ...profile })
        .select()
        .single()

      if (error) throw error
      return data
    }
  }

  // Notes methods
  notes = {
    list: async (): Promise<Note[]> => {
      const { data, error } = await this.supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },

    create: async (note: CreateNoteInput): Promise<Note> => {
      const { data, error } = await this.supabase
        .from('notes')
        .insert(note)
        .select()
        .single()

      if (error) throw error
      return data
    },

    update: async (id: string, note: UpdateNoteInput): Promise<Note> => {
      const { data, error } = await this.supabase
        .from('notes')
        .update(note)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },

    delete: async (id: string): Promise<void> => {
      const { error } = await this.supabase
        .from('notes')
        .delete()
        .eq('id', id)

      if (error) throw error
    }
  }
}

export const apiClient = new ApiClient()