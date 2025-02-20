import React from 'react';
import { FileTypeUtil } from '../../utils/file-types';

interface FileListProps {
  mainFile: File;
  companions: File[];
}

interface FileItemProps {
  file: File;
  isMain?: boolean;
}

function FileItem({ file, isMain }: FileItemProps) {
  return (
    <div className={`flex items-center p-3 ${isMain ? 'bg-blue-50' : 'bg-gray-50'} rounded-lg mb-2`}>
      <svg
        className="w-6 h-6 mr-3 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
      <div className="flex-1">
        <div className="font-medium">{file.name}</div>
        <div className="text-sm text-gray-500">
          {FileTypeUtil.getMimeType(file.name)} • {formatFileSize(file.size)}
        </div>
      </div>
      {isMain && (
        <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded">
          Main File
        </span>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function FileList({ mainFile, companions }: FileListProps) {
  return (
    <div className="space-y-4">
      <div className="font-medium text-gray-700">Selected Files</div>
      <div>
        <FileItem file={mainFile} isMain />
        {companions.map((file, index) => (
          <FileItem key={`${file.name}-${index}`} file={file} />
        ))}
      </div>
    </div>
  );
} 