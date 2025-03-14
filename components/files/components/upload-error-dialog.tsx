import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Link from 'next/link';

interface UploadErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  error: string;
  fileName?: string;
  fileSize?: number;
}

export function UploadErrorDialog({
  isOpen,
  onClose,
  error,
  fileName,
  fileSize,
}: UploadErrorDialogProps) {
  const isSizeError = error.toLowerCase().includes('size') || 
                      error.toLowerCase().includes('large') || 
                      error.toLowerCase().includes('exceeds');
  
  const fileSizeMB = fileSize ? Math.round(fileSize / (1024 * 1024)) : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-destructive">
            <AlertTriangle className="h-5 w-5 mr-2" />
            Upload Failed
          </DialogTitle>
          <DialogDescription>
            {fileName && <span className="font-medium">{fileName}</span>}
            {fileSizeMB && <span> ({fileSizeMB} MB)</span>}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <p>{error}</p>
          
          {isSizeError && (
            <div className="bg-muted p-4 rounded-md space-y-2">
              <h4 className="font-medium flex items-center">
                <HelpCircle className="h-4 w-4 mr-2" />
                What can I do?
              </h4>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Try uploading a smaller file</li>
                <li>Split your data into multiple smaller files</li>
                <li>Compress or simplify your data if possible</li>
                <li>
                  <Link href="/settings" className="text-primary hover:underline">
                    Check your file size settings
                  </Link>
                </li>
                <li>Contact support if you need to upload larger files</li>
              </ul>
            </div>
          )}
        </div>
        
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Link href="/settings">
            <Button variant="default">
              Go to Settings
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 