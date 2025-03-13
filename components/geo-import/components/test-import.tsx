'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/client';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TestImport');

export function TestImport({ projectId }: { projectId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleTestImport = async () => {
    try {
      setIsLoading(true);
      const supabase = createClient();
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        logger.error('Failed to get current user', { error: userError });
        throw new Error('Authentication required');
      }
      
      // First, get a project file that belongs to the current user
      const { data: projectFiles, error: filesError } = await supabase
        .from('project_files')
        .select('id')
        .eq('project_id', projectId)
        .eq('uploaded_by', user.id)
        .eq('is_shapefile_component', false) // Only get main files, not components
        .ilike('name', '%.shp') // Ensure it's a shapefile
        .limit(1);
        
      if (filesError || !projectFiles || projectFiles.length === 0) {
        logger.error('Failed to find a suitable project file', { 
          error: filesError, 
          projectId 
        });
        throw new Error('No suitable project file found for the current user');
      }
      
      const projectFileId = projectFiles[0].id;
      logger.info('Found suitable project file', { projectFileId });
      
      // Test feature as GeoJSON
      const testFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [2600000, 1200000, 0]
        },
        properties: {
          name: 'Test Point',
          timestamp: new Date().toISOString()
        }
      };

      logger.info('Starting direct function test', { testFeature });

      // Call the import function directly
      const { data, error } = await supabase.rpc(
        'import_geo_features_with_transform',
        {
          p_project_file_id: projectFileId, // Use the file we found
          p_collection_name: 'Test Direct Import',
          p_features: [testFeature],
          p_source_srid: 2056,
          p_target_srid: 4326,
          p_batch_size: 1
        }
      );

      if (error) {
        logger.error('Direct import failed', { error });
        throw new Error(error.message);
      }

      logger.info('Direct import successful', { result: data });

      // Verify the import by checking the geo_features table
      const { data: feature, error: featureError } = await supabase
        .from('geo_features')
        .select(`
          *,
          layer:layers(
            id,
            collection:feature_collections(
              id,
              project_file:project_files(
                id,
                project_id
              )
            )
          )
        `)
        .eq('layer.collection.project_file.project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (featureError) {
        logger.error('Error fetching imported feature', { error: featureError });
      } else {
        logger.info('Verified imported feature', { feature });
      }

    } catch (error) {
      logger.error('Test import failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
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