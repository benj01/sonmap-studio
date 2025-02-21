import React from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Download, Eye } from 'lucide-react';

interface FileActionsProps {
  onDelete?: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  disabled?: boolean;
  isValid?: boolean;
  isCompanion?: boolean;
}

export function FileActions({
  onDelete,
  onDownload,
  onPreview,
  disabled,
  isValid,
  isCompanion
}: FileActionsProps) {
  const buttonClass = `
    p-2 rounded-lg transition-colors duration-200
    ${isCompanion 
      ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' 
      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
  `;

  return (
    <div className="flex items-center space-x-1">
      {onPreview && isValid && (
        <Button
          variant="ghost"
          size="icon"
          className={buttonClass}
          onClick={onPreview}
          disabled={disabled}
        >
          <Eye className={`${isCompanion ? 'h-3 w-3' : 'h-4 w-4'}`} />
        </Button>
      )}
      {onDownload && (
        <Button
          variant="ghost"
          size="icon"
          className={buttonClass}
          onClick={onDownload}
          disabled={disabled}
        >
          <Download className={`${isCompanion ? 'h-3 w-3' : 'h-4 w-4'}`} />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className={buttonClass}
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 className={`${isCompanion ? 'h-3 w-3' : 'h-4 w-4'}`} />
        </Button>
      )}
    </div>
  );
} 