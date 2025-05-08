import React, { useRef, useState, useEffect } from 'react';
import { useWizard } from '../WizardContext';
import { createClient } from '@/utils/supabase/client';
import {
  getRequiredCompanions,
  getExtension,
  getAllConfigs
} from '../../../files/utils/file-types';
import { groupFiles } from '../../../files/utils/file-processor';
import { Alert, AlertTitle, AlertDescription } from '../../../ui/alert';
import { dbLogger } from '@/utils/logging/dbLogger';

interface FileSelectStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function FileSelectStep({ onNext }: FileSelectStepProps) {
  const { fileInfo, setFileInfo, projectId } = useWizard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileSummary, setFileSummary] = useState<string>('');
  const supabase = createClient();

  // Auto-advance if fileInfo is already set (preselected file)
  useEffect(() => {
    if (fileInfo && fileInfo.id && fileInfo.name) {
      onNext();
    }
    // Only run on mount or when fileInfo changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileInfo]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    setUploadError(null);
    setUploaded(false);
    setFileSummary('');
    setSelectedFiles(files);
    if (!files.length) return;
    setUploading(true);
    try {
      // Group files and validate companions
      const groups = await groupFiles(files);
      if (groups.length === 0) {
        setUploadError('No supported geodata files found.');
        setUploading(false);
        return;
      }
      // Only support one group at a time for now
      const group = groups[0];
      // Validate companions
      const requiredCompanions = getRequiredCompanions(group.mainFile.name);
      const missingCompanions = requiredCompanions.filter((ext: string) =>
        !group.companions.some((f: File) => getExtension(f.name) === ext)
      );
      if (missingCompanions.length > 0) {
        setUploadError(`Missing required companion files: ${missingCompanions.join(', ')}`);
        setUploading(false);
        return;
      }
      // Show summary
      setFileSummary(
        `Main file: ${group.mainFile.name}\nCompanions: ${group.companions.map((f: File) => f.name).join(', ') || 'None'}`
      );
      // Upload all files (main + companions)
      // Helper to wait for DB record
      async function waitForFileRecord(filePath: string, maxAttempts = 10, delayMs = 300) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const { data: fileRecord } = await supabase
            .from('project_files')
            .select('id, name, size, file_type')
            .eq('storage_path', filePath)
            .order('uploaded_at', { ascending: false })
            .maybeSingle();
          if (fileRecord) return fileRecord;
          await new Promise(res => setTimeout(res, delayMs));
        }
        throw new Error('File record not found after upload');
      }

      // 1. Upload and insert main file first
      const mainFile = group.mainFile;
      const mainFilePath = `uploads/${Date.now()}_${mainFile.name}`;
      const { error: mainUploadError } = await supabase.storage
        .from('project-files')
        .upload(mainFilePath, mainFile, { upsert: false });
      if (mainUploadError) {
        setUploadError(`Failed to upload ${mainFile.name}: ${mainUploadError.message}`);
        setUploading(false);
        return;
      }
      const { error: mainInsertError } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          name: mainFile.name,
          size: mainFile.size,
          file_type: mainFile.type,
          storage_path: mainFilePath,
          is_imported: false,
          is_shapefile_component: false
        });
      if (mainInsertError) {
        setUploadError(`Failed to insert file record for ${mainFile.name}: ${mainInsertError.message}`);
        setUploading(false);
        return;
      }
      let mainFileRecord;
      try {
        mainFileRecord = await waitForFileRecord(mainFilePath);
      } catch (err: unknown) {
        let errorMsg = 'Upload failed';
        if (err instanceof Error) {
          errorMsg = err.message;
        } else if (typeof err === 'string') {
          errorMsg = err;
        }
        setUploadError(errorMsg);
        setUploading(false);
        return;
      }

      // 2. Upload and insert companions with main_file_id set
      const companionFileInfos = [];
      for (const companion of group.companions as File[]) {
        const companionPath = `uploads/${Date.now()}_${companion.name}`;
        const { error: compUploadError } = await supabase.storage
          .from('project-files')
          .upload(companionPath, companion, { upsert: false });
        if (compUploadError) {
          setUploadError(`Failed to upload ${companion.name}: ${compUploadError.message}`);
          setUploading(false);
          return;
        }
        const ext = companion.name.match(/\.[^.]+$/)?.[0].toLowerCase().replace('.', '') || null;
        const { error: compInsertError } = await supabase
          .from('project_files')
          .insert({
            project_id: projectId,
            name: companion.name,
            size: companion.size,
            file_type: companion.type,
            storage_path: companionPath,
            is_imported: false,
            is_shapefile_component: true,
            main_file_id: mainFileRecord.id,
            component_type: ext
          });
        if (compInsertError) {
          setUploadError(`Failed to insert file record for ${companion.name}: ${compInsertError.message}`);
          setUploading(false);
          return;
        }
        let compFileRecord;
        try {
          compFileRecord = await waitForFileRecord(companionPath);
        } catch (err: unknown) {
          let errorMsg = 'Upload failed';
          if (err instanceof Error) {
            errorMsg = err.message;
          } else if (typeof err === 'string') {
            errorMsg = err;
          }
          setUploadError(errorMsg);
          setUploading(false);
          return;
        }
        companionFileInfos.push({
          id: compFileRecord.id,
          name: companion.name,
          size: companion.size,
          type: companion.type,
        });
      }
      // Set main file info in wizard context
      setFileInfo({
        id: mainFileRecord.id,
        name: mainFile.name,
        size: mainFile.size,
        type: mainFile.type,
        companions: companionFileInfos
      });
      setUploaded(true);
    } catch (err: unknown) {
      let errorMsg = 'Upload failed';
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'string') {
        errorMsg = err;
      }
      setUploadError(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e).catch(() => { setUploadError('File selection failed'); });
  };

  void (async () => { await dbLogger.info('FileSelectStep loaded', { projectId }); })().catch(() => {});

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 1: Select File(s)</h2>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleInputChange}
        className="block"
        accept={getAllConfigs().map((c) => c.mainExtension).join(',') + ',' + getAllConfigs().flatMap((c) => (c.companionFiles?.map((cf: { extension: string }) => cf.extension) || [])).join(',')}
        multiple
        disabled={uploading}
      />
      {uploading && <div className="text-blue-600 text-sm">Uploading...</div>}
      {uploadError && (
        <Alert variant="destructive" className="mb-2">
          <AlertTitle>Upload Error</AlertTitle>
          <AlertDescription>{uploadError}</AlertDescription>
          <button
            className="mt-2 px-3 py-1 bg-blue-600 text-white rounded"
            onClick={() => {
              // Retry: re-trigger file input if files are still selected
              if (fileInputRef.current && selectedFiles.length > 0) {
                // Create a synthetic event with the correct type
                const syntheticEvent = {
                  target: { files: (selectedFiles as unknown as FileList) }
                } as React.ChangeEvent<HTMLInputElement>;
                // Intentionally fire-and-forget: handleFileChange is async, but React event handler cannot be awaited
                void handleFileChange(syntheticEvent).catch(() => { setUploadError('Retry failed'); });
              } else {
                setUploadError(null);
              }
            }}
          >
            Retry
          </button>
        </Alert>
      )}
      {fileSummary && <div className="text-sm text-gray-700 whitespace-pre">{fileSummary}</div>}
      <div className="flex gap-2 mt-4">
        {/* No Back button on first step */}
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          disabled={!fileInfo?.name || !uploaded || uploading}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
} 