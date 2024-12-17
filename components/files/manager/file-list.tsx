import { FileItem } from '../file-item';
import { FileListProps } from './types';

export function FileList({
  files,
  viewMode,
  onDelete,
  onImport
}: FileListProps) {
  return (
    <div className={viewMode === 'grid' ? 'grid grid-cols-4 gap-4' : 'space-y-2'}>
      {files.map(file => (
        <FileItem
          key={file.id}
          file={file}
          viewMode={viewMode}
          onDelete={() => onDelete(file.id)}
          onImport={(result) => onImport(result, file)}
        />
      ))}
    </div>
  );
}
