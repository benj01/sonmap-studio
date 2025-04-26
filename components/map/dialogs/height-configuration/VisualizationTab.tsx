'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { VisualizationTabProps } from './types';

/**
 * Visualization Tab - Configures how heights are visualized in 3D
 */
export function VisualizationTab({ 
  advancedConfig, 
  setAdvancedConfig
}: VisualizationTabProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm mb-3">
        Configure how heights are visualized in 3D
      </div>
      
      <div className="space-y-3">
        <Label>Visualization Type</Label>
        <RadioGroup
          value={advancedConfig.visualization.type}
          onValueChange={(value) => {
            setAdvancedConfig({
              ...advancedConfig,
              visualization: {
                ...advancedConfig.visualization,
                type: value as 'extrusion' | 'point_elevation' | 'line_elevation'
              }
            });
          }}
          className="flex flex-col space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="extrusion" id="visual-extrusion" />
            <Label htmlFor="visual-extrusion" className="font-normal">
              Polygon Extrusion
              <p className="text-xs text-muted-foreground">
                Extrude polygons from base to top elevation
              </p>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="point_elevation" id="visual-point" />
            <Label htmlFor="visual-point" className="font-normal">
              Point Elevation
              <p className="text-xs text-muted-foreground">
                Position points at specified elevation
              </p>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="line_elevation" id="visual-line" />
            <Label htmlFor="visual-line" className="font-normal">
              Line Elevation
              <p className="text-xs text-muted-foreground">
                Position lines at specified elevation
              </p>
            </Label>
          </div>
        </RadioGroup>
      </div>
      
      {advancedConfig.visualization.type === 'extrusion' && (
        <div className="space-y-2 mt-3">
          <Label>Extrusion Options</Label>
          <div className="flex flex-col space-y-2 mt-1">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="extrusion-faces" 
                checked={advancedConfig.visualization.extrudedFaces}
                onCheckedChange={(checked) => {
                  setAdvancedConfig({
                    ...advancedConfig,
                    visualization: {
                      ...advancedConfig.visualization,
                      extrudedFaces: !!checked
                    }
                  });
                }}
              />
              <label
                htmlFor="extrusion-faces"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Show side faces
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="extrusion-top" 
                checked={advancedConfig.visualization.extrudedTop}
                onCheckedChange={(checked) => {
                  setAdvancedConfig({
                    ...advancedConfig,
                    visualization: {
                      ...advancedConfig.visualization,
                      extrudedTop: !!checked
                    }
                  });
                }}
              />
              <label
                htmlFor="extrusion-top"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Show top face
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 