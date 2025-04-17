import React, { useRef, useState } from 'react';
import { useWizard } from '../WizardContext';
import { createClient } from '@/utils/supabase/client';
import { FileTypeUtil } from '../../../files/utils/file-types';
import { FileProcessor } from '../../../files/utils/file-processor';

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
      const groups = await FileProcessor.groupFiles(files);
      if (groups.length === 0) {
        setUploadError('No supported geodata files found.');
        setUploading(false);
        return;
      }
      // Only support one group at a time for now
      const group = groups[0];
      // Validate companions
      const mainConfig = FileTypeUtil.getConfigForFile(group.mainFile.name);
      const requiredCompanions = FileTypeUtil.getRequiredCompanions(group.mainFile.name);
      const missingCompanions = requiredCompanions.filter(ext =>
        !group.companions.some(f => FileTypeUtil.getExtension(f.name) === ext)
      );
      if (missingCompanions.length > 0) {
        setUploadError(`Missing required companion files: ${missingCompanions.join(', ')}`);
        setUploading(false);
        return;
      }
      // Show summary
      setFileSummary(
        `Main file: ${group.mainFile.name}\nCompanions: ${group.companions.map(f => f.name).join(', ') || 'None'}`
      );
      // Upload all files (main + companions)
      const uploadedFileInfos = [];
      // Helper to wait for DB record
      async function waitForFileRecord(filePath: string, maxAttempts = 10, delayMs = 300) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const { data: fileRecord, error } = await supabase
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
      for (const file of [group.mainFile, ...group.companions]) {
        const filePath = `uploads/${Date.now()}_${file.name}`;
        const { data, error } = await supabase.storage
          .from('project-files')
          .upload(filePath, file, { upsert: false });
        if (error) {
          setUploadError(`Failed to upload ${file.name}: ${error.message}`);
          setUploading(false);
          return;
        }
        // Insert a record into project_files after upload
        const { error: insertError } = await supabase
          .from('project_files')
          .insert({
            project_id: projectId,
            name: file.name,
            size: file.size,
            file_type: file.type,
            storage_path: filePath,
            is_imported: false,
            is_shapefile_component: false
          });
        if (insertError) {
          setUploadError(`Failed to insert file record for ${file.name}: ${insertError.message}`);
          setUploading(false);
          return;
        }
        // Wait for project_files DB record to appear
        let fileRecord;
        try {
          fileRecord = await waitForFileRecord(filePath);
        } catch (waitError) {
          let errorMsg = 'Unknown error';
          if (waitError instanceof Error) {
            errorMsg = waitError.message;
          } else if (typeof waitError === 'string') {
            errorMsg = waitError;
          }
          setUploadError(`Failed to retrieve file record for ${file.name}: ${errorMsg}`);
          setUploading(false);
          return;
        }
        uploadedFileInfos.push({
          id: fileRecord.id, // Use the UUID from the DB
          name: file.name,
          size: file.size,
          type: file.type,
        });
      }
      // Set main file info in wizard context
      setFileInfo({
        ...uploadedFileInfos[0],
        companions: uploadedFileInfos.slice(1)
      });
      setUploaded(true);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 1: Select File(s)</h2>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="block"
        accept={FileTypeUtil.getAllConfigs().map(c => c.mainExtension).join(',') + ',' + FileTypeUtil.getAllConfigs().flatMap(c => c.companionFiles?.map(cf => cf.extension) || []).join(',')}
        multiple
        disabled={uploading}
      />
      {uploading && <div className="text-blue-600 text-sm">Uploading...</div>}
      {uploadError && <div className="text-red-600 text-sm">{uploadError}</div>}
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