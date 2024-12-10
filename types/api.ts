// /types/api.ts - Update API types and consolidate response types

export interface ApiResponse<T = void> {
  success: boolean
  data?: T
  error?: string
  code?: string
  message?: string
 }
 
 export interface ErrorResponse {
  error: string
  code?: string
 }
 
 export interface SuccessResponse<T = void> {
  success: true
  message: string
  data?: T
 }
 
 export type ActionResponse<T = void> = {
  kind: "success" | "error"
  message: string
  error?: string
  code?: string
  data?: T
 }
 
 // Auth types
 export interface AuthResponse {
  user: SerializableUser | null
  error?: string
 }
 
 // Profile types  
 export interface Profile {
  id: string
  user_id: string
  username?: string
  full_name?: string
  avatar_url?: string
  updated_at: string
 }
 
 // Note types
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