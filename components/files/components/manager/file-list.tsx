import React from 'react';
import { FileIcon } from '../item/file-icon';
import { ChevronDown, ChevronRight, Download, Import, Trash2, Check } from 'lucide-react';
import { ProjectFile } from '../../types';
import { Button } from '../../../ui/button';
import { cn } from '../../../../lib/utils';
import { Badge } from '../../../ui/badge';

interface FileListProps {
  mainFile: File | ProjectFile;
  companions?: (File | ProjectFile)[];
  onDelete?: (id: string) => void;
  onDownload?: (id: string) => void;
  onImport?: (id: string) => void;
}

export function FileList({ mainFile, companions = [], onDelete, onDownload, onImport }: FileListProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasCompanions = companions.length > 0;
  const isProjectFile = 'id' in mainFile;
  const isImported = isProjectFile && (mainFile as ProjectFile).is_imported;

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn(
      "bg-white rounded-lg border shadow-sm transition-all duration-200",
      hasCompanions && "hover:shadow-md"
    )}>
      {/* Main file card */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon and main info */}
          <div className="flex-shrink-0">
            <FileIcon fileName={mainFile.name} isMain={true} />
          </div>
          <div className="flex-grow min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 truncate">{mainFile.name}</h3>
                  {isImported && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Imported
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{formatSize(mainFile.size)}</span>
                  {hasCompanions && (
                    <>
                      <span>•</span>
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-1 hover:text-gray-700"
                      >
                        {companions.length} related files
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {isProjectFile && onImport && !isImported && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onImport(mainFile.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                    <Import className="h-4 w-4" />
                    Import
                  </Button>
                )}
                {isProjectFile && onDownload && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDownload(mainFile.id)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </Button>
                )}
                {isProjectFile && onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(mainFile.id)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Companion files */}
      {hasCompanions && isExpanded && (
        <div className="border-t bg-gray-50 rounded-b-lg">
          <div className="p-2 grid grid-cols-2 gap-2">
            {companions.map((companion, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded hover:bg-gray-100"
              >
                <div className="text-xs font-mono text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                  {companion.name.split('.').pop()?.toUpperCase()}
                </div>
                <div className="flex-grow min-w-0">
                  <div className="text-sm text-gray-700 truncate">{companion.name}</div>
                  <div className="text-xs text-gray-500">{formatSize(companion.size)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 