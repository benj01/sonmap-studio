import React from 'react';
import { ControlProps } from '../types';

interface StatusMessageProps extends ControlProps {
  message: string;
  type?: 'info' | 'success' | 'warning';
  icon?: boolean;
  timeout?: number;
  onDismiss?: () => void;
}

export function StatusMessage({
  message,
  type = 'info',
  icon = true,
  timeout,
  onDismiss,
  className = '',
  disabled = false
}: StatusMessageProps) {
  React.useEffect(() => {
    if (timeout && onDismiss) {
      const timer = setTimeout(onDismiss, timeout);
      return () => clearTimeout(timer);
    }
  }, [timeout, onDismiss]);

  const styles = {
    info: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      icon: 'text-blue-400'
    },
    success: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      icon: 'text-green-400'
    },
    warning: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      icon: 'text-yellow-400'
    }
  }[type];

  return (
    <div
      className={`rounded-md p-4 ${styles.bg} ${className}`}
      role="alert"
    >
      <div className="flex">
        {icon && (
          <div className="flex-shrink-0">
            {type === 'info' && (
              <svg
                className={`h-5 w-5 ${styles.icon}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {type === 'success' && (
              <svg
                className={`h-5 w-5 ${styles.icon}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {type === 'warning' && (
              <svg
                className={`h-5 w-5 ${styles.icon}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        )}
        <div className="ml-3">
          <p className={`text-sm ${styles.text}`}>{message}</p>
        </div>
        {onDismiss && !disabled && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                type="button"
                className={`inline-flex rounded-md p-1.5 ${styles.text} hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                onClick={onDismiss}
              >
                <span className="sr-only">Dismiss</span>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
