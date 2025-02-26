import React from 'react';
import { FileGroup } from '../../types';

interface UploadingFile {
  group: FileGroup;
  progress: number;
}

interface UploadProgressProps {
  files: UploadingFile[];
}

export function UploadProgress({ files }: UploadProgressProps) {
  return (
    <div className="space-y-2">
      {files.map(file => (
        <div key={file.group.mainFile.name} className="flex items-center gap-2">
          <span className="text-sm">{file.group.mainFile.name}</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${file.progress}%` }}
            />
          </div>
          <span className="text-sm">{file.progress}%</span>
        </div>
      ))}
    </div>
  );
} 