'use client';

import { Info } from 'lucide-react';
import { SwissTransformationInfoProps } from './types';
import { determineSwissTransformationMethod } from './utils';

/**
 * Swiss Transformation Information component
 * Displays information about Swiss height transformation when applicable
 */
export function SwissTransformationInfo({ swissCoordinatesInfo }: SwissTransformationInfoProps) {
  // Only show for Swiss coordinates
  if (!swissCoordinatesInfo.isSwiss) {
    return null;
  }
  
  // Determine the best transformation method based on feature characteristics
  const transformMethod = determineSwissTransformationMethod(swissCoordinatesInfo);
  
  return (
    <div className="p-4 border rounded-md mt-4 bg-slate-50">
      <h3 className="text-sm font-medium flex items-center mb-2">
        <Info className="mr-1 h-4 w-4 text-blue-600" />
        Swiss Height Transformation
      </h3>
      
      <div className="text-xs text-gray-600 space-y-2">
        <p>
          Swiss LV95 coordinates detected. Height transformation will be applied automatically 
          using the Swiss Reframe API for proper 3D visualization.
        </p>
        
        <p>
          {transformMethod === 'api' && (
            <>
              <span className="font-medium">Method: </span>
              Direct API calls will be used for highest precision.
            </>
          )}
          
          {transformMethod === 'delta' && (
            <>
              <span className="font-medium">Method: </span>
              Delta-based calculation will be used for efficiency with this dataset 
              ({swissCoordinatesInfo.featureCount} features).
            </>
          )}
          
          {transformMethod === 'auto' && (
            <>
              <span className="font-medium">Method: </span>
              Automatic selection based on feature distribution.
            </>
          )}
        </p>
      </div>
    </div>
  );
} 