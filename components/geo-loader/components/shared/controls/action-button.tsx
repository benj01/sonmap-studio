import React from 'react';
import { ControlProps } from '../types';

interface ActionButtonProps extends ControlProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  icon?: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
}

export function ActionButton({
  label,
  onClick,
  variant = 'primary',
  size = 'medium',
  icon,
  loading = false,
  loadingText = 'Loading...',
  className = '',
  disabled = false
}: ActionButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantStyles = {
    primary: 'text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'text-gray-700 bg-gray-100 hover:bg-gray-200 focus:ring-gray-500',
    danger: 'text-white bg-red-600 hover:bg-red-700 focus:ring-red-500'
  }[variant];

  const sizeStyles = {
    small: 'px-2.5 py-1.5 text-xs',
    medium: 'px-4 py-2 text-sm',
    large: 'px-6 py-3 text-base'
  }[size];

  const disabledStyles = 'opacity-50 cursor-not-allowed';

  return (
    <button
      type="button"
      className={`
        ${baseStyles}
        ${variantStyles}
        ${sizeStyles}
        ${disabled || loading ? disabledStyles : ''}
        ${className}
      `}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{loadingText}</span>
        </>
      ) : (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
