import React from 'react';
import { FileTypeUtil } from '../../utils/file-types';
import { FileIcon } from './file-icon';
import { FileActions } from './file-actions';
import { FileMetadata } from './file-metadata';
import { ProcessedFile } from '../../types';

interface FileItemProps {
  file: ProcessedFile;
  isMain?: boolean;
  isCompanion?: boolean;
  onDelete?: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  disabled?: boolean;
}

export function FileItem({
  file,
  isMain,
  isCompanion,
  onDelete,
  onDownload,
  onPreview,
  disabled
}: FileItemProps) {
  return (
    <div
      className={`
        flex items-center rounded-lg group transition-colors duration-200
        ${isMain ? 'bg-blue-50 border border-blue-100' : isCompanion ? 'bg-transparent' : 'bg-white border'}
        ${isCompanion ? 'p-2' : 'p-4'}
        ${disabled ? 'opacity-60 cursor-not-allowed' : isCompanion ? '' : 'hover:border-blue-200'}
      `}
    >
      <FileIcon fileName={file.file.name} isMain={isMain} />
      
      <div className="flex-1 min-w-0 ml-3">
        <div className="flex items-center space-x-2">
          <h3 className={`font-medium truncate ${isCompanion ? 'text-xs text-gray-600' : 'text-sm text-gray-900'}`}>
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
        
        <FileMetadata file={file} isCompanion={isCompanion} />
      </div>

      <FileActions
        onDelete={onDelete}
        onDownload={onDownload}
        onPreview={onPreview}
        disabled={disabled}
        isValid={file.isValid}
        isCompanion={isCompanion}
      />
    </div>
  );
} 