'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/client';

export function TestImport({ projectId }: { projectId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleTestImport = async () => {
    try {
      setIsLoading(true);
      
      // Simple test geometry (a point)
      const testFeature = {
        projectId,
        layerName: 'Test Layer',
        geometry: {
          type: 'Point',
          coordinates: [2600000, 1200000, 0]  // Added Z coordinate (elevation) = 0
        },
        properties: {
          name: 'Test Point',
          timestamp: new Date().toISOString()
        },
        sourceSrid: 2056
      };

      console.log('Starting test import...', testFeature);

      const response = await fetch('/api/geo-import/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testFeature)
      });

      const result = await response.json();
      console.log('Test import result:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      // Now let's try to fetch the imported feature using Supabase directly
      const supabase = createClient();
      const { data: feature, error: featureError } = await supabase
        .from('geo_features')
        .select('*')
        .eq('layer_id', result.layerId)
        .single();

      if (featureError) {
        console.error('Error fetching imported feature:', featureError);
      } else {
        console.log('Imported feature:', feature);
      }

    } catch (error) {
      console.error('Test import failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleTestImport} 
      disabled={isLoading}
    >
      {isLoading ? 'Testing...' : 'Test Import'}
    </Button>
  );
} 