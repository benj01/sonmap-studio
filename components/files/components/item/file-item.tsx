import React from 'react';
import { FileTypeUtil } from '../../utils/file-types';
import { FileIcon } from './file-icon';
import { FileActions } from './file-actions';
import { FileMetadata } from './file-metadata';
import { ProcessedFile } from '../../types';

interface FileItemProps {
  file: ProcessedFile;
  isMain?: boolean;
  onDelete?: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  disabled?: boolean;
}

export function FileItem({
  file,
  isMain,
  onDelete,
  onDownload,
  onPreview,
  disabled
}: FileItemProps) {
  return (
    <div
      className={`
        flex items-center p-4 rounded-lg mb-2 group
        ${isMain ? 'bg-blue-50 border border-blue-100' : 'bg-white border'}
        ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-200'}
        transition-colors duration-200
      `}
    >
      <FileIcon fileName={file.file.name} isMain={isMain} />
      
      <div className="flex-1 min-w-0 ml-3">
        <div className="flex items-center space-x-2">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {file.file.name}
          </h3>
          {isMain && (
            <span className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded">
              Main File
            </span>
          )}
          {!file.isValid && (
            <span className="px-2 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded">
              Invalid
            </span>
          )}
        </div>
        
        <FileMetadata file={file} />
      </div>

      <FileActions
        onDelete={onDelete}
        onDownload={onDownload}
        onPreview={onPreview}
        disabled={disabled}
        isValid={file.isValid}
      />
    </div>
  );
} 