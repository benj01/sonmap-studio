'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { BaseElevationTabProps } from './types';

/**
 * Base Elevation Tab - Configures where features start in 3D space
 */
export function BaseElevationTab({ 
  advancedConfig, 
  setAdvancedConfig,
  zCoordinatesInfo,
  numericAttributesInfo
}: BaseElevationTabProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm mb-3">
        Configure where features start in 3D space
      </div>
      
      <div className="space-y-3">
        <Label>Base Elevation Source</Label>
        <RadioGroup
          value={advancedConfig.baseElevation.source}
          onValueChange={(value) => {
            setAdvancedConfig({
              ...advancedConfig,
              baseElevation: {
                ...advancedConfig.baseElevation,
                source: value as 'z_coord' | 'attribute' | 'terrain'
              }
            });
          }}
          className="flex flex-col space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="terrain" id="base-terrain" />
            <Label htmlFor="base-terrain" className="font-normal">
              Terrain Surface
              <p className="text-xs text-muted-foreground">
                Features will be placed on the terrain surface
              </p>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem 
              value="z_coord" 
              id="base-z" 
              disabled={!zCoordinatesInfo.hasZ}
            />
            <Label htmlFor="base-z" className={`font-normal ${!zCoordinatesInfo.hasZ ? 'text-muted-foreground' : ''}`}>
              Z Coordinates
              <p className="text-xs text-muted-foreground">
                Use Z values from geometry as base elevation
                {!zCoordinatesInfo.hasZ && (
                  <span className="block text-amber-600 mt-1">
                    No Z coordinates detected in this layer
                  </span>
                )}
              </p>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem 
              value="attribute" 
              id="base-attribute" 
              disabled={numericAttributesInfo.attributes.length === 0}
            />
            <Label 
              htmlFor="base-attribute" 
              className={`font-normal ${numericAttributesInfo.attributes.length === 0 ? 'text-muted-foreground' : ''}`}
            >
              Attribute Value
              <p className="text-xs text-muted-foreground">
                Use a numeric attribute for base elevation
                {numericAttributesInfo.attributes.length === 0 && (
                  <span className="block text-amber-600 mt-1">
                    No numeric attributes detected in this layer
                  </span>
                )}
              </p>
            </Label>
          </div>
        </RadioGroup>
      </div>
      
      {advancedConfig.baseElevation.source === 'attribute' && (
        <div className="space-y-2 mt-3">
          <Label htmlFor="base-attribute-select">Base Elevation Attribute</Label>
          <Select 
            value={advancedConfig.baseElevation.attributeName || ''}
            onValueChange={(value) => {
              setAdvancedConfig({
                ...advancedConfig,
                baseElevation: {
                  ...advancedConfig.baseElevation,
                  attributeName: value
                }
              });
            }}
          >
            <SelectTrigger id="base-attribute-select">
              <SelectValue placeholder="Select attribute" />
            </SelectTrigger>
            <SelectContent>
              {numericAttributesInfo.attributes.map(attr => (
                <SelectItem key={attr.name} value={attr.name}>
                  {attr.name} ({attr.min.toFixed(1)} - {attr.max.toFixed(1)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="flex items-center space-x-2 mt-2">
            <Checkbox 
              id="base-absolute" 
              checked={advancedConfig.baseElevation.isAbsolute}
              onCheckedChange={(checked) => {
                setAdvancedConfig({
                  ...advancedConfig,
                  baseElevation: {
                    ...advancedConfig.baseElevation,
                    isAbsolute: !!checked
                  }
                });
              }}
            />
            <label
              htmlFor="base-absolute"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Value is absolute elevation (not relative to terrain)
            </label>
          </div>
        </div>
      )}
    </div>
  );
} 