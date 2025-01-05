import React from 'react';
import { ErrorInfo, ControlProps } from '../types';

interface ErrorDisplayProps extends ControlProps {
  error: ErrorInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  className = '',
  disabled = false
}: ErrorDisplayProps) {
  return (
    <div className={`rounded-lg bg-red-50 p-4 ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">
            {error.message}
          </h3>
          {error.details && (
            <div className="mt-2 text-sm text-red-700">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(error.details, null, 2)}
              </pre>
            </div>
          )}
          {(onRetry || onDismiss) && !disabled && (
            <div className="mt-4">
              {onRetry && (
                <button
                  type="button"
                  className="mr-3 text-sm font-medium text-red-800 hover:text-red-700"
                  onClick={onRetry}
                >
                  Try again
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  className="text-sm font-medium text-red-800 hover:text-red-700"
                  onClick={onDismiss}
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
