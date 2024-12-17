import { Database } from 'types/supabase';
import { LoaderResult } from 'types/geo';

export type ViewMode = 'grid' | 'list';

export type ProjectFile = Database['public']['Tables']['project_files']['Row'] & {
  importedFiles?: ProjectFile[];
};

export interface FileManagerProps {
  projectId: string;
  onGeoImport?: (result: LoaderResult, file: ProjectFile) => void;
}

export interface FileUploadResult {
  name: string;
  size: number;
  type: string;
  relatedFiles?: { [key: string]: string };
}

export interface FileListProps {
  files: ProjectFile[];
  viewMode: ViewMode;
  onDelete: (fileId: string) => Promise<void>;
  onImport: (result: LoaderResult, file: ProjectFile) => Promise<void>;
}

export interface FileToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  projectId: string;
  onUploadComplete: (result: FileUploadResult) => Promise<void>;
}

export interface EmptyStateProps {
  isLoading: boolean;
}

export interface FileActionsProps {
  projectId: string;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}
