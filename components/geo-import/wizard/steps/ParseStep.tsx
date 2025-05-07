import React, { useEffect, useState } from 'react';
import { useWizard } from '../WizardContext';
import { ParserFactory } from '@/core/processors/parser-factory';
import { createClient } from '@/utils/supabase/client';
import proj4 from 'proj4';
import { dbLogger } from '@/utils/logging/dbLogger';

interface ParseStepProps {
  onNext: () => void;
  onBack: () => void;
}

// Helper function to detect Z coordinates in features
function detectZCoordinates(features: unknown[]): { hasZ: boolean; message: string } {
  if (!Array.isArray(features) || features.length === 0) return { hasZ: false, message: 'No features found' };
  let zCount = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  let totalCoords = 0;
  const geometryTypes = new Set<string>();
  // Function to process coordinates recursively
  const processCoords = (coords: unknown[], geomType: string) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 3 && typeof coords[2] === 'number') {
      const z = coords[2];
      if (!isNaN(z)) {
        zCount++;
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
        (async () => { await dbLogger.debug('Found Z coordinate', { source: 'ParseStep', z, geomType }); })();
      }
      totalCoords++;
    } else if (Array.isArray(coords[0])) {
      (coords as unknown[]).forEach((c) => processCoords(c as unknown[], geomType));
    }
  };
  features.forEach((feature) => {
    if (
      typeof feature !== 'object' || feature === null ||
      !('geometry' in feature) ||
      typeof (feature as { geometry?: unknown }).geometry !== 'object' ||
      (feature as { geometry?: unknown }).geometry === null ||
      !('coordinates' in (feature as { geometry: { coordinates?: unknown } }).geometry)
    ) return;
    const geometry = (feature as { geometry: { type: string; coordinates: unknown } }).geometry;
    const geomType = geometry.type;
    geometryTypes.add(geomType);
    try {
      processCoords(geometry.coordinates as unknown[], geomType);
    } catch (error) {
      (async () => { await dbLogger.warn('Error processing coordinates for geometry type', { source: 'ParseStep', error, geomType }); })();
    }
  });
  (async () => { await dbLogger.info('Z coordinate detection summary', { source: 'ParseStep', zCount, totalCoords, zMin, zMax, geometryTypes: Array.from(geometryTypes), percentWithZ: totalCoords > 0 ? Math.round((zCount / totalCoords) * 100) : 0 }); })();
  const hasNonZeroZ = zMin !== 0 || zMax !== 0;
  const hasReasonableRange = zMin >= -100 && zMax <= 4000;
  const hasSufficientData = zCount > 0 && zCount >= 0.5 * totalCoords;
  return { hasZ: hasSufficientData && hasNonZeroZ && hasReasonableRange, message: 'Z coordinate detection complete' };
}

export function ParseStep({ onNext, onBack }: ParseStepProps) {
  const { fileInfo, setDataset, setImportDataset, setHeightSource } = useWizard();
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseSummary, setParseSummary] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const parseFile = async () => {
      if (!fileInfo || typeof fileInfo !== 'object' || !('id' in fileInfo) || !('name' in fileInfo) || typeof fileInfo.id !== 'string' || typeof fileInfo.name !== 'string' || !fileInfo.name) return;
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
        
        await dbLogger.info('Processing file', { source: 'ParseStep', fileName: fileInfo.name, fileId: fileInfo.id, storagePath: mainFileRecord.storage_path, fileExtension: fileInfo.name ? fileInfo.name.split('.').pop()?.toLowerCase() : undefined });
        
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
        
        // Log file size and binary header data for debugging
        const fileSize = arrayBuffer.byteLength;
        const headerBytes = new Uint8Array(arrayBuffer.slice(0, Math.min(50, fileSize)));
        await dbLogger.info('File binary information', { source: 'ParseStep', fileName: fileInfo.name, fileSize, headerHex: Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join(' ') });
        
        // 3. Download companion files using their storage_path
        const companionBuffers: Record<string, ArrayBuffer> = {};
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
        const parser = ParserFactory.createParser(typeof fileInfo.name === 'string' ? fileInfo.name : '');
        
        // Enable more verbose debugging for parsing
        await dbLogger.info('Using parser', { source: 'ParseStep', parserType: parser.constructor.name, fileExtension: fileInfo.name ? fileInfo.name.split('.').pop()?.toLowerCase() : undefined });
        
        const fullDataset = await parser.parse(arrayBuffer, companionBuffers, { 
          maxFeatures: 10000,
          transformCoordinates: false
        });
        
        // Log raw dataset details including first feature
        if (fullDataset.features && fullDataset.features.length > 0) {
          const firstFeature = fullDataset.features[0];
          await dbLogger.info('First parsed feature', { source: 'ParseStep', hasGeometry: !!firstFeature.geometry, geometryType: firstFeature.geometry?.type, coordinates: firstFeature.geometry && 'coordinates' in firstFeature.geometry ? 
            JSON.stringify(firstFeature.geometry.coordinates).substring(0, 500) : 'No coordinates',
            properties: firstFeature.properties ? 
            JSON.stringify(firstFeature.properties).substring(0, 500) : 'No properties'
          });
        }

        // Add a special-case path for shapefiles specifically to check if coordinates are in array form
        // Some shapefile parsers might return Z coordinates in a different format
        if (fileInfo.name.toLowerCase().endsWith('.shp')) {
          await dbLogger.info('Special shapefile processing', { source: 'ParseStep', featureCount: fullDataset.features?.length || 0, hasFeatures: !!fullDataset.features && fullDataset.features.length > 0 });
          // Force deep inspection of the first few features
          if (fullDataset.features && fullDataset.features.length > 0) {
            const maxFeatures = Math.min(5, fullDataset.features.length);
            for (let i = 0; i < maxFeatures; i++) {
              const feature = fullDataset.features[i];
              await dbLogger.info('Full shapefile feature', { source: 'ParseStep', i, data: JSON.stringify(feature), featureType: feature.geometry?.type, coordsType: feature.geometry && 'coordinates' in feature.geometry ? 
                typeof feature.geometry.coordinates : 'undefined' });
              // Check if Z values might be stored in feature properties
              const propKeys = Object.keys(feature.properties || {});
              for (const k of propKeys) {
                if (/^(z|height|elevation|altitude|h|hoehe|z_value|z_coord)$/i.test(k)) {
                  await dbLogger.info('Feature', { source: 'ParseStep', i, zProperties: [{ key: k, value: feature.properties?.[k] }] });
                }
              }
            }
          }
        }

        // Detect Z coordinates
        const zDetection = detectZCoordinates(fullDataset.features || []);
        await dbLogger.info('Z coordinate detection result', { source: 'ParseStep', zDetection });

        // Now that we have the original zDetection, run enhanced detection if needed
        if (fileInfo.name.toLowerCase().endsWith('.shp') && !zDetection.hasZ) {
          try {
            // Some formats might store Z in properties or special structure
            const enhancedFeatures: typeof fullDataset.features = [];
            for (const feature of fullDataset.features) {
              // Clone the feature to avoid modifying original
              const enhancedFeature = { ...feature };
              // Check for Z value in properties that might indicate height
              const props = feature.properties || {};
              const zProps = ['z', 'height', 'elevation', 'altitude', 'hoehe', 'h'];
              let zValue: number | null = null;
              // Find first property that might contain Z value
              for (const prop of zProps) {
                if (prop in props && typeof props[prop] === 'number') {
                  zValue = props[prop];
                  await dbLogger.debug('Found Z value in property', { source: 'ParseStep', property: prop, value: zValue, featureId: feature.id });
                  break;
                }
              }
              // If Z value found in properties but not in coords, add it
              if (zValue !== null && enhancedFeature.geometry && 'coordinates' in enhancedFeature.geometry) {
                const coordsArr = (enhancedFeature.geometry as { coordinates: unknown[] }).coordinates;
                if (
                  enhancedFeature.geometry &&
                  'coordinates' in enhancedFeature.geometry &&
                  Array.isArray(coordsArr)
                ) {
                  if (enhancedFeature.geometry.type === 'Point' && coordsArr.length === 2) {
                    (enhancedFeature.geometry as { coordinates: unknown[] }).coordinates = [coordsArr[0], coordsArr[1], zValue];
                    await dbLogger.debug('Added Z coordinate to Point', { source: 'ParseStep', original: coordsArr, enhanced: (enhancedFeature.geometry as { coordinates: unknown[] }).coordinates });
                  }
                  // Could add more cases for other geometry types
                }
              }
              enhancedFeatures.push(enhancedFeature);
            }
            // Run Z detection on enhanced features, but only update if more Z values found
            const enhancedZDetection = detectZCoordinates(enhancedFeatures);
            if (enhancedZDetection.hasZ) {
              await dbLogger.info('Enhanced Z detection found Z values', { source: 'ParseStep', enhancedZDetection });
              // Update the dataset with enhanced features
              fullDataset.features = enhancedFeatures;
              // Replace original detection result
              const updatedZDetection = enhancedZDetection;
              await dbLogger.info('Updated Z detection result', { source: 'ParseStep', updatedZDetection });
              // Set height source based on the enhanced detection
              if (updatedZDetection.hasZ) {
                setHeightSource({
                  type: 'z',
                  status: 'detected',
                  message: updatedZDetection.message
                });
              }
            }
          } catch (err) {
            await dbLogger.warn('Enhanced Z detection failed', { source: 'ParseStep', error: err });
            // Continue with original detection, don't fail the process
          }
        } else {
          // Set height source based on detection
          if (zDetection.hasZ) {
            setHeightSource({
              type: 'z',
              status: 'detected',
              message: zDetection.message
            });
          } else {
            setHeightSource({
              type: 'none',
              status: 'not_detected',
              message: zDetection.message
            });
          }
        }

        // IMPORTANT: Store the original dataset for import (with untransformed coordinates)
        setImportDataset(fullDataset);
        await dbLogger.info('Stored original dataset for import', { source: 'ParseStep', srid: fullDataset.metadata?.srid, featureCount: fullDataset.features?.length, heightSource: zDetection.hasZ ? 'z' : 'none' });

        // Create a transformed copy of the dataset for map preview if needed
        const previewDataset = { ...fullDataset };
        const sourceSrid = fullDataset.metadata && typeof fullDataset.metadata.srid === 'number' ? fullDataset.metadata.srid : undefined;
        if (sourceSrid) {
          try {
            await dbLogger.info('Transforming coordinates for preview', { source: 'ParseStep', srid: sourceSrid });
            
            // Simplified approach - use proj4 directly with common projections
            // Swiss LV95 (EPSG:2056)
            if (sourceSrid === 2056 && !proj4.defs(`EPSG:${sourceSrid}`)) {
              proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
            }
            
            // Create a transformed copy of features
            previewDataset.features = await Promise.all(fullDataset.features.map(async (feature) => {
              // Create a clone of the feature to avoid modifying the original
              const transformedFeature = { ...feature, geometry: { ...feature.geometry } };
              // Use type guards for transformCoords
              const isNumberArray = (arr: unknown): arr is number[] => Array.isArray(arr) && arr.every((v) => typeof v === 'number');
              const transformCoords = async (coords: unknown, srid: number): Promise<unknown> => {
                if (Array.isArray(coords) && Array.isArray(coords[0])) {
                  return Promise.all((coords as unknown[]).map((c) => transformCoords(c, srid)));
                } else if (isNumberArray(coords)) {
                  // Now coords is number[]
                  if (
                    typeof coords[0] !== 'number' || typeof coords[1] !== 'number' ||
                    isNaN(coords[0]) || isNaN(coords[1])
                  ) {
                    await dbLogger.warn('Invalid coordinate values', { source: 'ParseStep', coords });
                    return coords;
                  }
                  // Try to verify if these are already WGS84 coordinates
                  if (coords[0] >= -180 && coords[0] <= 180 && 
                      coords[1] >= -90 && coords[1] <= 90) {
                    await dbLogger.info('Coordinate appears to already be in WGS84 range', { source: 'ParseStep', input: coords });
                    // Continue with transformation anyway to be sure
                  }
                  // Verify this is actually an LV95 coordinate (should be in expected range)
                  if (srid === 2056) {
                    const validLV95 = coords[0] >= 2485000 && coords[0] <= 2835000 &&
                                      coords[1] >= 1075000 && coords[1] <= 1295000;
                    if (!validLV95) {
                      await dbLogger.warn('Coordinates outside expected LV95 range', { source: 'ParseStep', input: coords, expectedRange: "X: 2485000-2835000, Y: 1075000-1295000" });
                      // Continue with transformation anyway
                    }
                  }
                  // Log the exact proj4 definition being used
                  const fromDef = proj4.defs(`EPSG:${srid}`);
                  await dbLogger.info('Using projection definition', { source: 'ParseStep', fromSrid: srid, definition: fromDef });
                  // Transform from source SRID to WGS84
                  const transformed = proj4(`EPSG:${srid}`, 'EPSG:4326', coords as [number, number]);
                  // Verify transformed coordinates are valid
                  if (
                    !Array.isArray(transformed) ||
                    typeof transformed[0] !== 'number' || typeof transformed[1] !== 'number' ||
                    isNaN(transformed[0]) || isNaN(transformed[1])
                  ) {
                    await dbLogger.warn('Invalid transformed coordinate values', { source: 'ParseStep', input: coords, output: transformed });
                    return coords;
                  }
                  // Verify lat/lng values are in valid ranges
                  if (transformed[0] < -180 || transformed[0] > 180 || 
                      transformed[1] < -90 || transformed[1] > 90) {
                    await dbLogger.warn('Transformed coordinates out of valid range', { source: 'ParseStep', input: coords, output: transformed });
                    // Try flipping the input coordinates if they might be in wrong order
                    const flippedInput: [number, number] = [coords[1], coords[0]];
                    await dbLogger.info('Trying with flipped input coordinates', { source: 'ParseStep', originalInput: coords, flippedInput });
                    const transformedFlipped = proj4(`EPSG:${srid}`, 'EPSG:4326', flippedInput);
                    if (
                      Array.isArray(transformedFlipped) &&
                      transformedFlipped[0] >= -180 && transformedFlipped[0] <= 180 && 
                      transformedFlipped[1] >= -90 && transformedFlipped[1] <= 90
                    ) {
                      await dbLogger.info('Flipped coordinates transformation successful', { source: 'ParseStep', flippedInput, transformedFlipped });
                      return transformedFlipped;
                    }
                    // Return a safe fallback in Switzerland
                    return [8.5, 47.0]; // Default to somewhere in Switzerland
                  }
                  // Log successful transformation
                  await dbLogger.info('Transformed coordinate', { source: 'ParseStep', input: coords, output: transformed });
                  return transformed;
                }
                return coords;
              };
              // Transform specific geometry types
              if (feature.geometry) {
                transformedFeature.geometry = { ...feature.geometry };
                if ('coordinates' in transformedFeature.geometry) {
                  const transformed = await transformCoords(
                    transformedFeature.geometry.coordinates,
                    sourceSrid
                  );
                  // Only assign if transformed is a valid GeoJSON coordinates type
                  if (
                    Array.isArray(transformed) ||
                    (Array.isArray(transformed) && Array.isArray(transformed[0]))
                  ) {
                    (transformedFeature.geometry as { coordinates: typeof transformed }).coordinates = transformed;
                  }
                }
              }
              return transformedFeature;
            }));
            
            // Update metadata
            previewDataset.metadata = {
              ...fullDataset.metadata,
              srid: 4326,
              featureCount: typeof previewDataset.features?.length === 'number' ? previewDataset.features.length : 0,
              geometryTypes: Array.isArray(fullDataset.metadata?.geometryTypes) ? fullDataset.metadata.geometryTypes : [],
              properties: Array.isArray(fullDataset.metadata?.properties) ? fullDataset.metadata.properties : []
            };
            
            await dbLogger.info('Preview dataset transformation complete', { source: 'ParseStep', originalSrid: sourceSrid, featureCount: previewDataset.features.length });
            
            // Log first feature geometry to verify transformation
            if (previewDataset.features && previewDataset.features.length > 0) {
              const firstFeature = previewDataset.features[0];
              await dbLogger.debug('First preview feature geometry sample', { source: 'ParseStep', type: firstFeature.geometry.type, coordinates: 'coordinates' in firstFeature.geometry ? 
                JSON.stringify(firstFeature.geometry.coordinates).substring(0, 100) + '...' : 
                'No coordinates property' });
            }
          } catch (error) {
            await dbLogger.error('Failed to transform coordinates for preview', { source: 'ParseStep', error });
            // If transformation fails, use the original dataset for preview too
            // This will likely cause map display issues but prevents total failure
          }
        }
        
        // Set the preview dataset for the map view
        setDataset(previewDataset);
        await dbLogger.info('Preview dataset set for UI', { source: 'ParseStep', previewSrid: previewDataset.metadata?.srid });

        // Set parse summary
        const featureCount = fullDataset.features?.length ?? 0;
        let geometryType = 'unknown';
        if (fullDataset.metadata) {
          if (
            Object.prototype.hasOwnProperty.call(fullDataset.metadata, 'geometryType') &&
            typeof (fullDataset.metadata as { geometryType?: unknown }).geometryType === 'string'
          ) {
            geometryType = (fullDataset.metadata as { geometryType?: string }).geometryType as string;
          } else if (
            Object.prototype.hasOwnProperty.call(fullDataset.metadata, 'geometryTypes')
          ) {
            const gTypes = (fullDataset.metadata as { geometryTypes?: unknown }).geometryTypes;
            if (Array.isArray(gTypes)) {
              geometryType = gTypes.join(', ');
            } else if (typeof gTypes === 'string') {
              geometryType = gTypes;
            }
          }
        }
        let srid: number | string = 'unknown';
        if (fullDataset.metadata && typeof fullDataset.metadata.srid === 'number') {
          srid = fullDataset.metadata.srid;
        }
        await dbLogger.info('Parsing completed successfully', { source: 'ParseStep', featureCount, geometryType, srid });
        await dbLogger.info('Stored original dataset for import', { source: 'ParseStep', srid, featureCount, heightSource: zDetection.hasZ ? 'z' : 'none' });
        setParseSummary(
          `Parsing completed successfully: ${featureCount} features, geometry type: ${geometryType}, SRID: ${srid}.`
        );
        setParsing(false);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Parsing failed');
        }
        setParsing(false);
      }
    };
    if (fileInfo && typeof fileInfo === 'object' && 'id' in fileInfo && 'name' in fileInfo && typeof fileInfo.id === 'string' && typeof fileInfo.name === 'string') {
      (async () => { await parseFile(); })();
    }
  }, [fileInfo, setDataset, onNext, supabase, setImportDataset, setHeightSource]);

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