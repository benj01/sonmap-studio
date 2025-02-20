import React from 'react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500">
      <svg
        className="w-12 h-12 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <h3 className="text-lg font-medium mb-2">No files selected</h3>
      <p className="text-sm">
        Upload files by clicking the button above or drag and drop them here
      </p>
    </div>
  );
} 