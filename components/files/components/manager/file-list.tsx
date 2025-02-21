import React from 'react';
import { FileItem } from '../item';
import type { ProcessedFile, ProjectFile } from '../../types';

interface FileListProps {
  mainFile: File | ProjectFile;
  companions: File[] | ProjectFile[];
  onDelete?: (fileId: string) => Promise<void>;
  onDownload?: (fileId: string) => Promise<void>;
}

export function FileList({ mainFile, companions, onDelete, onDownload }: FileListProps) {
  // Type guard to check if a file is a ProjectFile
  function isProjectFile(file: File | ProjectFile): file is ProjectFile {
    return 'file_type' in file && 'id' in file;
  }

  // Convert File objects to ProcessedFile format
  const mainProcessedFile: ProcessedFile = isProjectFile(mainFile) 
    ? {
        file: new File([new Blob()], mainFile.name, { type: mainFile.file_type }),
        type: mainFile.file_type,
        size: mainFile.size,
        isValid: true
      }
    : {
        file: mainFile,
        type: mainFile.type,
        size: mainFile.size,
        isValid: true
      };

  const companionProcessedFiles: ProcessedFile[] = companions.map(companion => {
    if (isProjectFile(companion)) {
      return {
        file: new File([new Blob()], companion.name, { type: companion.file_type }),
        type: companion.file_type,
        size: companion.size,
        isValid: true
      };
    } else {
      return {
        file: companion,
        type: companion.type,
        size: companion.size,
        isValid: true
      };
    }
  });

  // Check if this is a shapefile group
  const isShapefile = isProjectFile(mainFile) 
    ? mainFile.file_type === 'application/x-esri-shape' || mainFile.name.toLowerCase().endsWith('.shp')
    : mainFile.type === 'application/x-esri-shape' || mainFile.name.toLowerCase().endsWith('.shp');

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="p-4">
        <FileItem 
          file={mainProcessedFile}
          isMain={isShapefile} // Only mark as main if it's a shapefile
          onDelete={onDelete ? () => onDelete(isProjectFile(mainFile) ? mainFile.id : mainFile.name) : undefined}
          onDownload={onDownload ? () => onDownload(isProjectFile(mainFile) ? mainFile.id : mainFile.name) : undefined}
        />
      </div>
      {companionProcessedFiles.length > 0 && (
        <div className="bg-gray-50 border-t px-4 py-2">
          <div className="text-xs text-gray-500 mb-2">Related Files</div>
          <div className="space-y-2">
            {companionProcessedFiles.map((file, index) => (
              <FileItem
                key={`${file.file.name}-${index}`}
                file={file}
                isCompanion={true}
                onDelete={onDelete ? () => {
                  const companion = companions[index];
                  return onDelete(isProjectFile(companion) ? companion.id : companion.name);
                } : undefined}
                onDownload={onDownload ? () => {
                  const companion = companions[index];
                  return onDownload(isProjectFile(companion) ? companion.id : companion.name);
                } : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 