'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { DialogActionsProps } from './types';

/**
 * Dialog Actions component for height configuration
 * Contains common actions and footer buttons
 */
export function DialogActions({
  applyToAllLayers,
  setApplyToAllLayers,
  savePreference,
  setSavePreference,
  onCancel,
  onApply,
  showProgress
}: DialogActionsProps) {
  return (
    <div className="mt-6">
      {/* Common Options */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="apply-all" 
            checked={applyToAllLayers} 
            onCheckedChange={(checked) => setApplyToAllLayers(!!checked)} 
          />
          <Label htmlFor="apply-all" className="font-normal">
            Apply to all compatible layers
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="save-preference" 
            checked={savePreference} 
            onCheckedChange={(checked) => setSavePreference(!!checked)} 
          />
          <Label htmlFor="save-preference" className="font-normal">
            Save as default for future layers
          </Label>
        </div>
      </div>
      
      {/* Dialog Footer */}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={showProgress}>
          Cancel
        </Button>
        <Button onClick={onApply} disabled={showProgress}>
          {showProgress && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Apply
        </Button>
      </DialogFooter>
    </div>
  );
} 