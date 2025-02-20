import React from 'react';

interface FileActionsProps {
  onDelete?: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  disabled?: boolean;
  isValid?: boolean;
}

export function FileActions({
  onDelete,
  onDownload,
  onPreview,
  disabled,
  isValid = true
}: FileActionsProps) {
  const buttonClass = `
    p-2 rounded-lg transition-colors duration-200
    ${disabled
      ? 'text-gray-300 cursor-not-allowed'
      : 'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
    }
  `;

  return (
    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
      {onPreview && isValid && (
        <button
          type="button"
          onClick={onPreview}
          disabled={disabled}
          className={buttonClass}
          title="Preview"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </button>
      )}

      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          className={buttonClass}
          title="Download"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className={`${buttonClass} hover:text-red-600 hover:bg-red-50`}
          title="Delete"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
} 