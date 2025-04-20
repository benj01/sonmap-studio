import React, { useEffect, useState } from 'react';
import { useWizard } from '../WizardContext';
import { ParserFactory } from '@/core/processors/parser-factory';
import { createClient } from '@/utils/supabase/client';
import { COORDINATE_SYSTEMS } from '@/core/coordinates/coordinates';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { GeoFeature } from '@/types/geo-import';
import { LogManager, LogLevel } from '@/core/logging/log-manager';

interface ParseStepProps {
  onNext: () => void;
  onBack: () => void;
}

const SOURCE = 'ParseStep';
const logManager = LogManager.getInstance();
logManager.setComponentLogLevel(SOURCE, LogLevel.INFO);

export function ParseStep({ onNext, onBack }: ParseStepProps) {
  const { fileInfo, setDataset, setImportDataset } = useWizard();
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseSummary, setParseSummary] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const parseFile = async () => {
      if (!fileInfo?.id || !fileInfo.name) return;
      setParsing(true);
      setError(null);
      setParseSummary(null);
      try {
        // 1. Query DB for main file record to get storage_path
        const { data: mainFileRecord, error: mainFileError } = await supabase
          .from('project_files')
          .select('storage_path')
          .eq('id', fileInfo.id)
          .single();
        if (mainFileError || !mainFileRecord) {
          setError(mainFileError?.message || 'Main file record not found');
          setParsing(false);
          return;
        }
        // 2. Download main file using storage_path
        const { data, error: downloadError } = await supabase.storage
          .from('project-files')
          .download(mainFileRecord.storage_path);
        if (downloadError || !data) {
          setError(downloadError?.message || 'Failed to download file');
          setParsing(false);
          return;
        }
        const arrayBuffer = await data.arrayBuffer();
        // 3. Download companion files using their storage_path
        let companionBuffers: Record<string, ArrayBuffer> = {};
        if (fileInfo.companions && fileInfo.companions.length > 0) {
          for (const companion of fileInfo.companions) {
            const { data: compRecord, error: compDbError } = await supabase
              .from('project_files')
              .select('storage_path')
              .eq('id', companion.id)
              .single();
            if (compDbError || !compRecord) continue;
            const { data: compData, error: compError } = await supabase.storage
              .from('project-files')
              .download(compRecord.storage_path);
            if (!compError && compData) {
              const ext = companion.name.match(/\.[^.]+$/)?.[0].toLowerCase() || '';
              companionBuffers[ext] = await compData.arrayBuffer();
            }
          }
        }
        // Use parser factory to parse the file
        const parser = ParserFactory.createParser(fileInfo.name);
        const fullDataset = await parser.parse(arrayBuffer, companionBuffers, { 
          maxFeatures: 10000,
          transformCoordinates: false
        });

        // IMPORTANT: Store the original dataset for import (with untransformed coordinates)
        setImportDataset(fullDataset);
        logManager.info(SOURCE, 'Stored original dataset for import', { 
          srid: fullDataset.metadata?.srid, 
          featureCount: fullDataset.features?.length 
        });

        // Create a transformed copy of the dataset for map preview if needed
        const previewDataset = { ...fullDataset };
        if (fullDataset.metadata?.srid && fullDataset.metadata.srid !== 4326) {
          const sourceSrid = fullDataset.metadata.srid;
          try {
            logManager.info(SOURCE, 'Transforming coordinates for preview', { sourceSrid });
            
            // Simplified approach - use proj4 directly with common projections
            // Swiss LV95 (EPSG:2056)
            if (sourceSrid === 2056 && !proj4.defs(`EPSG:${sourceSrid}`)) {
              proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
            }
            
            // Create a transformed copy of features
            previewDataset.features = await Promise.all(fullDataset.features.map(async (feature) => {
              // Create a clone of the feature to avoid modifying the original
              const transformedFeature = { ...feature, geometry: { ...feature.geometry } };
              
              // Use a helper function to transform coordinates based on geometry type
              const transformCoords = (coords: any[], srid: number): any => {
                if (Array.isArray(coords[0])) {
                  // Handle nested arrays (LineString, Polygon, etc.)
                  return coords.map((c: any) => transformCoords(c, srid));
                } else {
                  try {
                    // Log input coordinates - use INFO level for better visibility during debugging
                    logManager.info(SOURCE, 'Transforming point coordinate', { 
                      input: coords,
                      inputType: typeof coords[0],
                      srid 
                    });
                    
                    // Check if coords are valid numbers
                    if (typeof coords[0] !== 'number' || typeof coords[1] !== 'number' || 
                        isNaN(coords[0]) || isNaN(coords[1])) {
                      logManager.warn(SOURCE, 'Invalid coordinate values', { coords });
                      return coords;
                    }
                    
                    // Try to verify if these are already WGS84 coordinates
                    if (coords[0] >= -180 && coords[0] <= 180 && 
                        coords[1] >= -90 && coords[1] <= 90) {
                      logManager.info(SOURCE, 'Coordinate appears to already be in WGS84 range', { 
                        input: coords 
                      });
                      // Continue with transformation anyway to be sure
                    }
                    
                    // Verify this is actually an LV95 coordinate (should be in expected range)
                    if (srid === 2056) {
                      const validLV95 = coords[0] >= 2485000 && coords[0] <= 2835000 &&
                                        coords[1] >= 1075000 && coords[1] <= 1295000;
                      if (!validLV95) {
                        logManager.warn(SOURCE, 'Coordinates outside expected LV95 range', { 
                          input: coords,
                          expectedRange: "X: 2485000-2835000, Y: 1075000-1295000"
                        });
                        // Continue with transformation anyway
                      }
                    }
                    
                    // Log the exact proj4 definition being used
                    const fromDef = proj4.defs(`EPSG:${srid}`);
                    logManager.info(SOURCE, 'Using projection definition', { 
                      fromSrid: srid, 
                      definition: fromDef
                    });
                    
                    // Transform from source SRID to WGS84
                    const transformed = proj4(`EPSG:${srid}`, 'EPSG:4326', coords);
                    
                    // Verify transformed coordinates are valid
                    if (typeof transformed[0] !== 'number' || typeof transformed[1] !== 'number' ||
                        isNaN(transformed[0]) || isNaN(transformed[1])) {
                      logManager.warn(SOURCE, 'Invalid transformed coordinate values', { 
                        input: coords, 
                        output: transformed 
                      });
                      return coords;
                    }
                    
                    // Verify lat/lng values are in valid ranges
                    if (transformed[0] < -180 || transformed[0] > 180 || 
                        transformed[1] < -90 || transformed[1] > 90) {
                      logManager.warn(SOURCE, 'Transformed coordinates out of valid range', { 
                        input: coords, 
                        output: transformed 
                      });
                      
                      // Try flipping the input coordinates if they might be in wrong order
                      const flippedInput = [coords[1], coords[0]];
                      logManager.info(SOURCE, 'Trying with flipped input coordinates', { 
                        originalInput: coords, 
                        flippedInput 
                      });
                      
                      const transformedFlipped = proj4(`EPSG:${srid}`, 'EPSG:4326', flippedInput);
                      
                      if (transformedFlipped[0] >= -180 && transformedFlipped[0] <= 180 && 
                          transformedFlipped[1] >= -90 && transformedFlipped[1] <= 90) {
                        logManager.info(SOURCE, 'Flipped coordinates transformation successful', { 
                          flippedInput, 
                          transformedFlipped 
                        });
                        return transformedFlipped;
                      }
                      
                      // Return a safe fallback in Switzerland
                      return [8.5, 47.0]; // Default to somewhere in Switzerland
                    }
                    
                    // Log successful transformation
                    logManager.info(SOURCE, 'Transformed coordinate', { 
                      input: coords, 
                      output: transformed 
                    });
                    
                    return transformed;
                  } catch (error) {
                    logManager.error(SOURCE, 'Coordinate transformation failed', { coords, srid, error });
                    // Return a safe fallback in Switzerland
                    return [8.5, 47.0]; // Default to somewhere in Switzerland
                  }
                }
              };
              
              // Transform specific geometry types
              if (feature.geometry) {
                transformedFeature.geometry = { ...feature.geometry };
                if ('coordinates' in transformedFeature.geometry) {
                  transformedFeature.geometry.coordinates = transformCoords(
                    transformedFeature.geometry.coordinates, 
                    sourceSrid
                  );
                }
              }
              
              return transformedFeature;
            }));
            
            // Update metadata
            previewDataset.metadata = { 
              ...fullDataset.metadata,
              srid: 4326
            };
            
            logManager.info(SOURCE, 'Preview dataset transformation complete', {
              originalSrid: sourceSrid,
              featureCount: previewDataset.features.length
            });
            
            // Log first feature geometry to verify transformation
            if (previewDataset.features && previewDataset.features.length > 0) {
              const firstFeature = previewDataset.features[0];
              logManager.debug(SOURCE, 'First preview feature geometry sample', {
                type: firstFeature.geometry.type,
                coordinates: 'coordinates' in firstFeature.geometry ? 
                  JSON.stringify(firstFeature.geometry.coordinates).substring(0, 100) + '...' : 
                  'No coordinates property'
              });
            }
          } catch (error) {
            logManager.error(SOURCE, 'Failed to transform coordinates for preview', { error });
            // If transformation fails, use the original dataset for preview too
            // This will likely cause map display issues but prevents total failure
          }
        }
        
        // Set the preview dataset for the map view
        setDataset(previewDataset);
        logManager.info(SOURCE, 'Preview dataset set for UI', { 
          previewSrid: previewDataset.metadata?.srid 
        });

        // Set parse summary
        const featureCount = fullDataset.features?.length ?? 0;
        let geometryType = 'unknown';
        if (fullDataset.metadata) {
          if (typeof (fullDataset.metadata as any)?.geometryType === 'string') {
            geometryType = (fullDataset.metadata as any).geometryType;
          } else if (Array.isArray((fullDataset.metadata as any)?.geometryTypes)) {
            geometryType = (fullDataset.metadata as any).geometryTypes.join(', ');
          } else if (typeof (fullDataset.metadata as any)?.geometryTypes === 'string') {
            geometryType = (fullDataset.metadata as any).geometryTypes;
          }
        }
        const srid = fullDataset.metadata?.srid || 'unknown';
        setParseSummary(
          `Parsing completed successfully: ${featureCount} features, geometry type: ${geometryType}, SRID: ${srid}.`
        );
        setParsing(false);
      } catch (err: any) {
        setError(err.message || 'Parsing failed');
        setParsing(false);
      }
    };
    if (fileInfo?.id && fileInfo.name) {
      parseFile();
    }
  }, [fileInfo, setDataset, onNext, supabase, setImportDataset]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Step 2: Parsing & Initial Analysis</h2>
      {!fileInfo?.name && <div className="text-red-600">No file selected.</div>}
      {parsing && <div className="text-blue-600">Parsing file...</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!parsing && !error && parseSummary && (
        <div className="text-green-700 bg-green-50 border border-green-200 rounded p-2">
          {parseSummary}
        </div>
      )}
      <div className="flex gap-2 mt-4">
        <button
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
          onClick={onBack}
          disabled={parsing}
        >
          Back
        </button>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={onNext}
          disabled={parsing || !!error || !fileInfo?.name}
        >
          Next
        </button>
      </div>
    </div>
  );
} 