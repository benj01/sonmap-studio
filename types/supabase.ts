export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      project_files: {
        Row: {
          id: string
          project_id: string
          name: string
          size: number
          file_type: string
          storage_path: string
          uploaded_at: string
          metadata: Json | null
          source_file_id: string | null
          is_imported: boolean
          import_metadata: Json | null
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          size: number
          file_type: string
          storage_path: string
          uploaded_at?: string
          metadata?: Json | null
          source_file_id?: string | null
          is_imported?: boolean
          import_metadata?: Json | null
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          size?: number
          file_type?: string
          storage_path?: string
          uploaded_at?: string
          metadata?: Json | null
          source_file_id?: string | null
          is_imported?: boolean
          import_metadata?: Json | null
        }
      }
      projects: {
        Row: {
          id: string
          created_at: string
          name: string
          description: string | null
          owner_id: string
          storage_used: number
          settings: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
          description?: string | null
          owner_id: string
          storage_used?: number
          settings?: Json | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
          description?: string | null
          owner_id?: string
          storage_used?: number
          settings?: Json | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_imported_files: {
        Args: { source_file_id: string }
        Returns: {
          id: string
          name: string
          file_type: string
          storage_path: string
          import_metadata: Json
          uploaded_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
