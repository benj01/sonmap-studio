import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileList } from './file-list';
import { useFileActions } from '../../hooks/useFileActions';
import { ProjectFile } from '../../types';
import { Button } from '../../../ui/button';
import { ImportWizard } from '../../../geo-import/wizard/ImportWizard';
import { getConfigForFile } from '../../utils/file-types';
import { Upload } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { ImportedFilesList, ImportedFilesListRef } from '../imported-files-list';
import { dbLogger } from '@/utils/logging/dbLogger';
import { UploadErrorDialog } from '../upload-error-dialog';
import { Dialog, DialogContent, DialogTitle } from '../../../ui/dialog';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { WizardFileInfo } from '@/components/geo-import/wizard/WizardContext';
import createClient from '@/utils/supabase/client';

interface FileManagerProps {
  projectId: string;
  onError?: (error: string) => void;
}

const SOURCE = 'FileManager';
const LOG_SOURCE = 'FileManager';

export function FileManager({ projectId, onError }: FileManagerProps) {
  const { isLoading, loadFiles, handleDelete } = useFileActions({
    projectId,
    onError: (msg) => onError?.(msg)
  });
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [importedFilesKey, setImportedFilesKey] = useState(0);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);
  const importedFilesRef = React.useRef<ImportedFilesListRef>(null);
  const [uploadError, setUploadError] = useState<{ message: string; fileName?: string; fileSize?: number } | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [uploadedOpen, setUploadedOpen] = useState(true);
  const [importedOpen, setImportedOpen] = useState(true);
  const [importWizardFile, setImportWizardFile] = useState<WizardFileInfo | undefined>();
  const [importWizardStep, setImportWizardStep] = useState<number>(0);
  const subscriptionRef = useRef<any>(null);

  const loadExistingFiles = useCallback(async () => {
    if (!projectId) {
      await dbLogger.warn('loadExistingFiles.noProjectId', { LOG_SOURCE });
      return;
    }
    try {
      await dbLogger.debug('loadExistingFiles.start', { LOG_SOURCE, projectId });
      const loadedFiles = await loadFiles();
      if (!loadedFiles) {
        await dbLogger.warn('loadExistingFiles.noFiles', { LOG_SOURCE, projectId });
        setFiles([]);
        return;
      }
      await dbLogger.debug('loadExistingFiles.success', {
        LOG_SOURCE,
        projectId,
        totalFiles: loadedFiles.length,
        mainFiles: loadedFiles.filter(f => !f.companions).length,
        companionFiles: loadedFiles.filter(f => f.companions).length
      });
      setFiles(loadedFiles);
    } catch {
      await dbLogger.error('loadExistingFiles.error', { LOG_SOURCE, projectId });
      setFiles([]);
    }
  }, [projectId, loadFiles]);

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    // Clean up previous subscription if any
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
    // Subscribe to real-time changes for this project's files
    const channel = supabase.channel(`project_files_changes_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_files',
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          await loadExistingFiles();
        }
      )
      .subscribe();
    subscriptionRef.current = channel;
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [projectId, loadExistingFiles]);

  const handleFileDelete = useCallback(
    async (file: ProjectFile, _deleteRelated?: boolean) => {
      void _deleteRelated;
      try {
        await handleDelete(file.id, true);
        const updatedFiles = await loadFiles();
        setFiles(updatedFiles);
        setImportedFilesKey(prev => prev + 1);
      } catch {
        const errorMessage = 'Failed to delete file';
        onError?.(errorMessage);
      }
    },
    [handleDelete, loadFiles, onError]
  );

  const handleFileImport = async (fileId: string): Promise<void> => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      const fileType = getConfigForFile(file.name);
      setImportWizardFile({
        id: file.id,
        name: file.name,
        size: file.size,
        type: fileType?.mimeType || 'application/octet-stream',
        companions: (file.companions || []).map(c => ({
          ...c,
          type: (c as unknown as { type?: string }).type || 'application/octet-stream'
        }))
      });
      setImportWizardStep(1); // Start at Parse & Analyze
      setShowImportWizard(true);
      return;
    }
    return Promise.resolve();
  };

  const handleViewLayer = (layerId: string) => {
    // TODO: Implement layer viewing functionality
    (async () => {
      try {
        await dbLogger.info(SOURCE, 'View layer requested', { layerId });
      } catch {
        // Optionally handle error here
      }
    })().catch(() => {});
  };

  // Use main files as returned from the DB, which already have companions attached
  const groupedFiles = files.filter(f => !f.main_file_id && !f.is_imported);

  useEffect(() => {
    if (!(files && files.length > 0)) return;
    (async () => {
      try {
        await dbLogger.debug(LOG_SOURCE, 'Raw files from DB (truncated sample)', { files: JSON.stringify(files, null, 2) });
        await dbLogger.debug(LOG_SOURCE, 'Grouped files for FileList', { groupedFiles });
      } catch {
        // Optionally handle error here
      }
    })().catch(() => {});
  }, [files, groupedFiles]);

  // Handler to close the import wizard
  const handleWizardClose = useCallback(() => {
    setShowImportWizard(false);
    setImportWizardFile(undefined);
    setImportWizardStep(0);
  }, []);

  // Handler to refresh files after import
  const handleWizardRefreshFiles = useCallback(async () => {
    await loadExistingFiles();
  }, [loadExistingFiles]);

  return (
    <div className="flex flex-col h-full">
      {/* Top CTA and description */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
        <div>
          <h2 className="text-xl font-bold mb-1">Project Files</h2>
          <p className="text-muted-foreground text-sm">Import files into your project using the guided wizard. All imported files are listed below.</p>
        </div>
        <Button onClick={() => setShowImportWizard(true)} className="gap-2" size="lg">
          <Upload className="w-5 h-5" /> Upload & Import
        </Button>
      </div>

      {/* Main card */}
      <div className={cn('relative min-h-[200px] rounded-lg border bg-card')}>
        <div ref={dropZoneRef} className="p-4 space-y-6">
          {/* Imported Files Section (Only) */}
          <div className="bg-muted/30 p-4 rounded-lg border border-border">
            <button
              className="flex items-center w-full text-left mb-3 group"
              onClick={() => setImportedOpen((v) => !v)}
              type="button"
            >
              {importedOpen ? (
                <ChevronDown className="w-4 h-4 mr-2 transition-transform" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-2 transition-transform" />
              )}
              <span className="text-lg font-semibold">Imported Files</span>
            </button>
            {importedOpen && (
              <ImportedFilesList
                ref={importedFilesRef}
                key={importedFilesKey}
                projectId={projectId}
                onViewLayer={(layerId) => void handleViewLayer(layerId)}
                onDelete={handleFileDelete}
              />
            )}
          </div>
        </div>
      </div>

      {/* Import Wizard Modal */}
      <Dialog open={showImportWizard} onOpenChange={setShowImportWizard}>
        <DialogContent className="max-w-[72rem] w-full">
          <DialogTitle className="sr-only">Upload & Import Files</DialogTitle>
          <ImportWizard
            projectId={projectId}
            initialFileInfo={importWizardFile}
            initialStep={importWizardStep}
            onClose={handleWizardClose}
            onRefreshFiles={handleWizardRefreshFiles}
          />
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <UploadErrorDialog
        isOpen={!!uploadError}
        onClose={() => setUploadError(null)}
        error={uploadError?.message || ''}
        fileName={uploadError?.fileName}
        fileSize={uploadError?.fileSize}
      />
    </div>
  );
}