'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';
import { 
  generateTestPoints, 
  generateTestPolygon, 
  generateTestLineString,
  generateMixedDataset
} from '../data/test-data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

type GeometryType = 'points' | 'polygon' | 'linestring' | 'mixed';

export function TestImport({ projectId }: { projectId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [featureCount, setFeatureCount] = useState(50);
  const [batchSize, setBatchSize] = useState(10);
  const [geometryType, setGeometryType] = useState<GeometryType>('points');
  const [results, setResults] = useState<unknown>(null);

  const generateFeatures = (type: GeometryType, count: number) => {
    switch (type) {
      case 'points':
        return generateTestPoints(count);
      case 'polygon':
        return [generateTestPolygon()];
      case 'linestring':
        return [generateTestLineString()];
      case 'mixed':
        return generateMixedDataset(
          Math.max(0, count - 5), // Reserve 5 features for polygons and lines
          Math.min(3, Math.floor(count * 0.1)), // 10% polygons, max 3
          Math.min(2, Math.floor(count * 0.05))  // 5% lines, max 2
        );
      default:
        return generateTestPoints(count);
    }
  };

  const handleTestImport = async () => {
    try {
      setIsLoading(true);
      setResults(null);
      const supabase = createClient();
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        await dbLogger.error('TestImport', 'Failed to get current user', { error: userError, projectId });
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
        await dbLogger.error('TestImport', 'Failed to find a suitable project file', { error: filesError, projectId, userId: user.id });
        throw new Error('No suitable project file found for the current user');
      }
      
      const projectFileId = projectFiles[0].id;
      await dbLogger.info('TestImport', 'Found suitable project file', { projectFileId, projectId, userId: user.id });
      
      // Generate features based on selected type and count
      const features = generateFeatures(geometryType, featureCount);
      
      await dbLogger.info('TestImport', 'Starting batch import test', { featureCount: features.length, geometryType, batchSize, projectId, userId: user.id });

      // Call the import function directly
      const { data, error } = await supabase.rpc(
        'import_geo_features_with_transform',
        {
          p_project_file_id: projectFileId, // Use the file we found
          p_collection_name: `Test ${geometryType} Import (${features.length} features)`,
          p_features: features,
          p_source_srid: 2056,
          p_target_srid: 4326,
          p_batch_size: batchSize
        }
      );

      if (error) {
        await dbLogger.error('TestImport', 'Batch import failed', { error, projectId, userId: user.id });
        throw new Error(error.message);
      }

      await dbLogger.info('TestImport', 'Batch import successful', { result: data, projectId, userId: user.id });
      setResults(data);

      // Verify the import by checking the geo_features table
      const { data: importedFeatures, error: featuresError } = await supabase
        .from('geo_features')
        .select(`
          id,
          geometry,
          properties,
          created_at,
          layer:layers(
            id,
            name,
            collection:feature_collections(
              id,
              name,
              project_file:project_files(
                id,
                project_id
              )
            )
          )
        `)
        .eq('layer.collection.project_file.project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (featuresError) {
        await dbLogger.error('TestImport', 'Error fetching imported features', { error: featuresError, projectId, userId: user.id });
      } else {
        await dbLogger.info('TestImport', 'Verified imported features', { sampleFeatures: importedFeatures, totalImported: data[0]?.imported_count || 0, projectId, userId: user.id });
      }

    } catch (error) {
      await dbLogger.error('TestImport', 'Test import failed', { error: error instanceof Error ? error.message : 'Unknown error', projectId });
    } finally {
      setIsLoading(false);
    }
  };

  // Type guard for import results
  function isImportResultsArray(val: unknown): val is Array<{ imported_count?: number; failed_count?: number; collection_id?: string; layer_id?: string }> {
    return Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Test Geo Import</CardTitle>
        <CardDescription>
          Import test GeoJSON features with configurable batch size
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="geometry-type">Geometry Type</Label>
          <Select 
            value={geometryType} 
            onValueChange={(value) => setGeometryType(value as GeometryType)}
          >
            <SelectTrigger id="geometry-type">
              <SelectValue placeholder="Select geometry type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="polygon">Polygon</SelectItem>
              <SelectItem value="linestring">LineString</SelectItem>
              <SelectItem value="mixed">Mixed Geometries</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="feature-count">Feature Count</Label>
          <Input
            id="feature-count"
            type="number"
            min="1"
            max="1000"
            value={featureCount}
            onChange={(e) => setFeatureCount(parseInt(e.target.value) || 50)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="batch-size">Batch Size</Label>
          <Input
            id="batch-size"
            type="number"
            min="1"
            max="100"
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
          />
        </div>

        {isImportResultsArray(results) && (
          <div className="mt-4 p-3 bg-muted rounded-md">
            <h4 className="font-medium mb-2">Import Results:</h4>
            <ul className="text-sm space-y-1">
              <li>Imported: {results[0]?.imported_count || 0} features</li>
              <li>Failed: {results[0]?.failed_count || 0} features</li>
              <li>Collection: {results[0]?.collection_id}</li>
              <li>Layer: {results[0]?.layer_id}</li>
            </ul>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleTestImport} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Importing...' : 'Run Test Import'}
        </Button>
      </CardFooter>
    </Card>
  );
} 