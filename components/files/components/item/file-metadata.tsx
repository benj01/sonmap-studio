import React from 'react';
import { FileTypeUtil } from '../../utils/file-types';
import { ProcessedFile } from '../../types';

interface FileMetadataProps {
  file: ProcessedFile;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function FileMetadata({ file }: FileMetadataProps) {
  return (
    <div className="flex items-center mt-1 text-sm text-gray-500">
      <span className="truncate">
        {FileTypeUtil.getMimeType(file.file.name)}
      </span>
      <span className="mx-2">•</span>
      <span>{formatFileSize(file.size)}</span>
      {file.error && (
        <>
          <span className="mx-2">•</span>
          <span className="text-red-500 truncate">
            {file.error}
          </span>
        </>
      )}
    </div>
  );
} 