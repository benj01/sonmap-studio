import React from 'react';
import { ProgressInfo, ControlProps } from '../types';

interface ProgressBarProps extends ControlProps {
  info: ProgressInfo;
  onCancel?: () => void;
  showPercentage?: boolean;
  height?: number;
}

export function ProgressBar({
  info,
  onCancel,
  showPercentage = true,
  height = 4,
  className = '',
  disabled = false
}: ProgressBarProps) {
  const percentage = Math.round(info.progress * 100);

  return (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-600 truncate">{info.status}</span>
        {showPercentage && (
          <span className="text-gray-500">{percentage}%</span>
        )}
      </div>
      
      <div className="relative w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-1 bg-blue-500 transition-all duration-300 ease-in-out"
          style={{
            height: `${height}px`,
            width: `${percentage}%`
          }}
        />
      </div>

      {info.details && (
        <span className="text-xs text-gray-500 truncate">
          {info.details}
        </span>
      )}

      {onCancel && !disabled && (
        <button
          onClick={onCancel}
          className="text-sm text-red-500 hover:text-red-600 mt-1"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
