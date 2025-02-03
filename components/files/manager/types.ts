import { Database } from 'types/supabase';
import { LoaderResult } from 'types/geo';
import { ProjectFileBase, UploadedFile } from '../types';

export type ViewMode = 'grid' | 'list';

export type ProjectFile = ProjectFileBase & {
  importedFiles?: ProjectFile[];
};

export interface FileManagerProps {
  projectId: string;
  onGeoImport?: (result: LoaderResult, file: ProjectFile) => void;
}

export type FileUploadResult = UploadedFile;

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
