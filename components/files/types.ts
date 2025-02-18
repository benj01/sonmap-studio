import { Database } from 'types/supabase'

export type FileWithCompanions = {
  id: string
  name: string
  file_type: string
  storage_path: string
  size: number
  uploaded_at: string
  project_id: string
  is_shapefile_component: boolean
  companion_files: CompanionFile[] | null
}

export interface ProjectFileBase {
  id: string
  project_id: string
  name: string
  file_type: string
  storage_path: string
  size: number
  uploaded_at: string
  is_shapefile_component: boolean
  source_file_id?: string | null
  is_imported?: boolean
  import_metadata?: Record<string, any> | null
}

export type CompanionFile = {
  id: string
  name: string
  component_type: string
  storage_path: string
  size: number
}

export type ProjectFile = ProjectFileBase & {
  importedFiles?: ProjectFile[]
  companion_files?: CompanionFile[]
  is_shapefile_component?: boolean
}

export type RelatedFile = {
  path: string
  size: number
  name: string
}

export type UploadedFile = {
  id: string
  name: string
  size: number
  type: string
  relatedFiles?: { [key: string]: RelatedFile }
}
