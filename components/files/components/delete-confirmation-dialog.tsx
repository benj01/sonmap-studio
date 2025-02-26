import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (deleteRelated: boolean) => void;
  fileName: string;
  type: 'uploaded' | 'imported';
  hasRelatedFile: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  fileName,
  type,
  hasRelatedFile
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Confirm Deletion
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p>Are you sure you want to delete {fileName}?</p>
              {hasRelatedFile && (
                <p>
                  {type === 'uploaded' ? (
                    'This file has been imported. Would you like to delete the imported file as well?'
                  ) : (
                    'This is an imported file. Would you like to delete the source file as well?'
                  )}
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {hasRelatedFile ? (
            <>
              <Button
                variant="secondary"
                onClick={() => onConfirm(false)}
              >
                Delete {type === 'uploaded' ? 'Uploaded' : 'Imported'} File Only
              </Button>
              <Button
                variant="destructive"
                onClick={() => onConfirm(true)}
              >
                Delete Both Files
              </Button>
            </>
          ) : (
            <Button
              variant="destructive"
              onClick={() => onConfirm(false)}
            >
              Delete File
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 