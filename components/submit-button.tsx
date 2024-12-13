import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function SubmitButton({ 
  loading = false, 
  children, 
  className = ''
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={loading}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        children
      )}
    </Button>
  );
}
