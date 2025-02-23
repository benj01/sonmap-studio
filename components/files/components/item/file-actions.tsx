import React from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Download, Eye, Import } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FileActionsProps {
  onDelete?: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  onImport?: () => void;
  disabled?: boolean;
  isValid?: boolean;
  isCompanion?: boolean;
}

export function FileActions({
  onDelete,
  onDownload,
  onPreview,
  onImport,
  disabled,
  isValid,
  isCompanion
}: FileActionsProps) {
  // Don't render any actions for companion files
  if (isCompanion) {
    return null;
  }

  const buttonClass = `
    p-2 rounded-lg transition-colors duration-200
    text-gray-500 hover:text-gray-700 hover:bg-gray-100
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
  `;

  return (
    <TooltipProvider>
      <div className="flex items-center space-x-2">
        {onImport && isValid && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="flex items-center gap-2"
                onClick={onImport}
                disabled={disabled}
              >
                <Import className="h-4 w-4" />
                Import
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Import file into project</p>
            </TooltipContent>
          </Tooltip>
        )}
        {onPreview && isValid && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={buttonClass}
                onClick={onPreview}
                disabled={disabled}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Preview file</p>
            </TooltipContent>
          </Tooltip>
        )}
        {onDownload && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={buttonClass}
                onClick={onDownload}
                disabled={disabled}
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download file</p>
            </TooltipContent>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={buttonClass}
                onClick={onDelete}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete file</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
} 