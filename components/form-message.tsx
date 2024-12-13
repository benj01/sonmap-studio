import React from 'react';

interface FormMessageProps {
  message?: string;
  type?: 'error' | 'success';
}

export default function FormMessage({ message, type = 'error' }: FormMessageProps) {
  if (!message) return null;

  const colorClasses = {
    error: 'text-red-500',
    success: 'text-green-500'
  };

  return (
    <p className={`text-sm mt-2 ${colorClasses[type]}`}>
      {message}
    </p>
  );
}
