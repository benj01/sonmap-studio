import React from 'react';
import { isShapefile } from '../../utils/file-types';

interface FileIconProps {
  fileName: string;
  isMain?: boolean;
}

export function FileIcon({ fileName, isMain }: FileIconProps) {
  const getIconPath = () => {
    if (isShapefile(fileName)) {
      return (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
      );
    }

    // Default file icon
    return (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    );
  };

  return (
    <div className={`flex-shrink-0 ${isMain ? 'text-blue-600' : 'text-gray-500'}`}>
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        {getIconPath()}
      </svg>
    </div>
  );
} 