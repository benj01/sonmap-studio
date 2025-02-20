import React from 'react';
import { FileUploader } from './file-uploader';
import { UploadProgress } from './upload-progress';
import { UploadDialog } from './upload-dialog';
import { useFileOperations } from '../../hooks/useFileOperations';
import { FileGroup, ProcessedFiles, UploadedFile } from '../../types';

interface FileUploadProps {
  projectId: string;
  onUploadComplete?: (file: UploadedFile) => void;
  acceptedFileTypes?: string[];
  disabled?: boolean;
  maxFileSize?: number;  // in bytes
}

export function FileUpload({ 
  projectId, 
  onUploadComplete, 
  acceptedFileTypes, 
  disabled, 
  maxFileSize 
}: FileUploadProps) {
  const { isProcessing, error, processFiles, processGroup } = useFileOperations();
  const [selectedGroup, setSelectedGroup] = React.useState<FileGroup | null>(null);
  const [showDialog, setShowDialog] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);

  const handleFilesSelected = async (files: File[]) => {
    try {
      const groups = await processFiles(files);
      if (groups.length > 0) {
        setSelectedGroup(groups[0]);
        setShowDialog(true);
      }
    } catch (e) {
      // Error handling is done by useFileOperations
    }
  };

  const handleUpload = async () => {
    if (!selectedGroup) return;

    try {
      const processed = await processGroup(selectedGroup);
      // Upload logic will be implemented in a separate hook
      setShowDialog(false);
      onUploadComplete?.(processed as unknown as UploadedFile); // Type cast for now, will fix with proper types
    } catch (e) {
      // Error handling is done by useFileOperations
    }
  };

  return (
    <>
      <FileUploader
        onFilesSelected={handleFilesSelected}
        acceptedFileTypes={acceptedFileTypes}
        disabled={disabled || isProcessing}
        maxFileSize={maxFileSize}
      />
      
      {error && (
        <div className="text-red-500 text-sm mt-2">{error}</div>
      )}

      {isProcessing && (
        <UploadProgress progress={uploadProgress} />
      )}

      <UploadDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConfirm={handleUpload}
        fileGroup={selectedGroup}
        isUploading={isProcessing}
      />
    </>
  );
} 