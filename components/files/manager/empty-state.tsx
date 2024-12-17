import { EmptyStateProps } from './types';

export function EmptyState({ isLoading }: EmptyStateProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading files...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
      <p className="text-muted-foreground text-sm">
        No files uploaded yet. Click upload to add files.
      </p>
    </div>
  );
}
