'use client';

import { useState, useEffect } from 'react';
import { HexColorPicker } from "react-colorful";
import { useLayer } from '@/store/layers/hooks';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LayerSettingsDialogProps {
  layerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LayerSettingsDialog({ layerId, open, onOpenChange }: LayerSettingsDialogProps) {
  const { layer, updateStyle } = useLayer(layerId);
  const [color, setColor] = useState("#088");

  useEffect(() => {
    // Initialize color from layer style if available
    if (layer?.metadata?.style?.paint) {
      const currentColor = layer.metadata.style.paint['fill-color'] || 
                          layer.metadata.style.paint['line-color'] || 
                          layer.metadata.style.paint['circle-color'] ||
                          "#088";
      setColor(currentColor);
    }
  }, [layer]);

  const handleSave = () => {
    if (!layer) return;

    // Create style update based on geometry type
    const paint: Record<string, any> = {};
    
    // Determine layer type from ID
    const isLineLayer = layer.id.endsWith('-line');
    const isFillLayer = layer.id.endsWith('-fill');
    const isCircleLayer = layer.id.endsWith('-circle');
    
    // Apply color only to relevant geometry types
    if (isLineLayer) {
      paint['line-color'] = color;
      paint['line-width'] = 2;
    } else if (isFillLayer) {
      paint['fill-color'] = color;
      paint['fill-opacity'] = 0.4;
      paint['fill-outline-color'] = '#000';
    } else if (isCircleLayer) {
      paint['circle-color'] = color;
      paint['circle-radius'] = 5;
      paint['circle-stroke-width'] = 2;
      paint['circle-stroke-color'] = '#000';
    }

    updateStyle({ paint });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Layer Settings - {layer?.id}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="color">Layer Color</Label>
            <div className="flex gap-4 items-start">
              <HexColorPicker color={color} onChange={setColor} />
              <Input 
                id="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-[100px]"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 