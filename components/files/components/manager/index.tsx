import React from 'react';
import { FileList } from './file-list';
import { EmptyState } from './empty-state';
import { Toolbar } from './toolbar';
import { useFileOperations } from '../../hooks/useFileOperations';
import { FileGroup, ProcessedFiles } from '../../types';

interface FileManagerProps {
  onFilesProcessed?: (files: ProcessedFiles) => void;
  onError?: (error: string) => void;
}

export function FileManager({ onFilesProcessed, onError }: FileManagerProps) {
  const { isProcessing, error, processFiles, processGroup } = useFileOperations();
  const [selectedGroup, setSelectedGroup] = React.useState<FileGroup | null>(null);

  const handleFileSelect = async (files: FileList) => {
    try {
      const fileArray = Array.from(files) as File[];
      const groups = await processFiles(fileArray);
      
      if (groups.length > 0) {
        setSelectedGroup(groups[0]);
        const processed = await processGroup(groups[0]);
        onFilesProcessed?.(processed);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to process files';
      onError?.(errorMessage);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Toolbar onFileSelect={handleFileSelect} isProcessing={isProcessing} />
      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}
      {selectedGroup ? (
        <FileList
          mainFile={selectedGroup.mainFile}
          companions={selectedGroup.companions}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
} 