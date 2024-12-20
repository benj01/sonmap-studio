import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';

interface ImportControlsProps {
  loading: boolean;
  hasErrors: boolean;
  coordinateSystemChanged: boolean;
  pendingCoordinateSystem?: string;
  onClose: () => void;
  onApplyCoordinateSystem: () => void;
  onImport: () => void;
}

export function ImportControls({
  loading,
  hasErrors,
  coordinateSystemChanged,
  pendingCoordinateSystem,
  onClose,
  onApplyCoordinateSystem,
  onImport
}: ImportControlsProps) {
  return (
    <div className="flex justify-end space-x-2 mt-4 pt-4 border-t">
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      {coordinateSystemChanged && (
        <Button
          onClick={onApplyCoordinateSystem}
          disabled={loading || !pendingCoordinateSystem}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Apply Coordinate System
        </Button>
      )}
      <Button
        onClick={onImport}
        disabled={loading || hasErrors || coordinateSystemChanged}
      >
        {loading ? 'Importing...' : 'Import'}
      </Button>
    </div>
  );
}
