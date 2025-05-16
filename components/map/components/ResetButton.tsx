'use client';

import { Button } from '@/components/ui/button';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { dbLogger } from '@/utils/logging/dbLogger';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const SOURCE = 'ResetButton';

export function ResetButton() {
  const { cleanup } = useMapInstanceStore();
  const { reset: resetViewState } = useViewStateStore();

  const handleReset = async () => {
    cleanup();
    resetViewState();
    await dbLogger.info('Map and view state reset', undefined, { source: SOURCE });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Reset</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Map</AlertDialogTitle>
          <AlertDialogDescription>
            This will reset the map view and remove all layers. Your project data will not be affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => { await handleReset(); }}
          >
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}