'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { HeightConfigTabProps } from './types';

/**
 * Height Configuration Tab - Configures top elevation or height of features
 */
export function HeightConfigTab({ 
  advancedConfig, 
  setAdvancedConfig,
  numericAttributesInfo
}: HeightConfigTabProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm mb-3">
        Configure top elevation or height of features
      </div>
      
      <div className="space-y-3">
        <Label>Height Source</Label>
        <RadioGroup
          value={advancedConfig.heightConfig.source}
          onValueChange={(value) => {
            setAdvancedConfig({
              ...advancedConfig,
              heightConfig: {
                ...advancedConfig.heightConfig,
                source: value as 'attribute' | 'calculated' | 'none'
              }
            });
          }}
          className="flex flex-col space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="none" id="height-none" />
            <Label htmlFor="height-none" className="font-normal">
              No Height/Flat
              <p className="text-xs text-muted-foreground">
                Features will be flat at base elevation
              </p>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem 
              value="attribute" 
              id="height-attribute" 
              disabled={numericAttributesInfo.attributes.length === 0}
            />
            <Label 
              htmlFor="height-attribute" 
              className={`font-normal ${numericAttributesInfo.attributes.length === 0 ? 'text-muted-foreground' : ''}`}
            >
              Attribute Value
              <p className="text-xs text-muted-foreground">
                Use a numeric attribute for height or top elevation
                {numericAttributesInfo.attributes.length === 0 && (
                  <span className="block text-amber-600 mt-1">
                    No numeric attributes detected in this layer
                  </span>
                )}
              </p>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="calculated" id="height-calculated" disabled />
            <Label htmlFor="height-calculated" className="font-normal text-muted-foreground">
              Calculated Value
              <p className="text-xs text-muted-foreground">
                Calculate height from other attributes or properties
                <span className="block text-amber-600 mt-1">
                  Coming soon
                </span>
              </p>
            </Label>
          </div>
        </RadioGroup>
      </div>
      
      {advancedConfig.heightConfig.source === 'attribute' && (
        <div className="space-y-2 mt-3">
          <Label htmlFor="height-attribute-select">Height Attribute</Label>
          <Select 
            value={advancedConfig.heightConfig.attributeName || ''}
            onValueChange={(value) => {
              setAdvancedConfig({
                ...advancedConfig,
                heightConfig: {
                  ...advancedConfig.heightConfig,
                  attributeName: value
                }
              });
            }}
          >
            <SelectTrigger id="height-attribute-select">
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
              id="height-relative" 
              checked={advancedConfig.heightConfig.isRelative}
              onCheckedChange={(checked) => {
                setAdvancedConfig({
                  ...advancedConfig,
                  heightConfig: {
                    ...advancedConfig.heightConfig,
                    isRelative: !!checked
                  }
                });
              }}
            />
            <label
              htmlFor="height-relative"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Value is relative height (not absolute top elevation)
            </label>
          </div>
        </div>
      )}
    </div>
  );
} 