import { AlertTriangle } from 'lucide-react';
import { DialogHeader, DialogTitle } from 'components/ui/dialog';
import { Alert, AlertDescription } from 'components/ui/alert';

interface ImportHeaderProps {
  fileName: string;
  hasErrors: boolean;
}

export function ImportHeader({ fileName, hasErrors }: ImportHeaderProps) {
  return (
    <DialogHeader className="flex flex-row items-center justify-between">
      <DialogTitle className="text-lg">Import {fileName}</DialogTitle>
      <div className="flex items-center gap-2">
        {hasErrors && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Errors occurred during import. Check logs below for more information.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </DialogHeader>
  );
}
