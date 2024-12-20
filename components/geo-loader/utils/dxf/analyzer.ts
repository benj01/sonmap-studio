import { DxfData, DxfEntity, DxfEntityBase, Vector3, isVector3, isDxfPointEntity, isDxfLineEntity, isDxfPolylineEntity, isDxfCircleEntity, isDxfArcEntity, isDxfTextEntity, isDxfInsertEntity } from './types';
import { DxfErrorReporter, createDxfErrorReporter } from './error-collector';
import { ErrorMessage } from '../errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { suggestCoordinateSystem, CoordinatePoint } from '../coordinate-utils';

interface AnalysisStats {
  entityCount: number;
  layerCount: number;
  blockCount: number;
  lineCount: number;
  pointCount: number;
  polylineCount: number;
  circleCount: number;
  arcCount: number;
  textCount: number;
  [key: string]: number;
}

interface AnalysisResult {
  isValid: boolean;
  stats: AnalysisStats;
  errorReporter: DxfErrorReporter;
  coordinateSystem: CoordinateSystem; // Changed to required
}

function isEntityBase(entity: unknown): entity is DxfEntityBase {
  return typeof entity === 'object' && 
         entity !== null && 
         typeof (entity as DxfEntityBase).type === 'string';
}

interface CoordinateSystemDetectionResult {
  system: CoordinateSystem;
  confidence: number;
  reason: string;
  source: 'points' | 'header' | 'fallback';
  alternativeSystems?: Array<{
    system: CoordinateSystem;
    confidence: number;
    reason: string;
  }>;
}

function detectCoordinateSystem(dxf: DxfData, errorReporter: DxfErrorReporter): CoordinateSystemDetectionResult {
  // Collect all coordinates from entities first
  const points: CoordinatePoint[] = [];
  let entityCount = 0;
  
  dxf.entities.forEach((entity: unknown) => {
    if (!isEntityBase(entity)) return;
    entityCount++;

    if (isDxfPointEntity(entity)) {
      points.push(entity.position);
    } else if (isDxfLineEntity(entity)) {
      points.push(entity.start, entity.end);
    } else if (isDxfPolylineEntity(entity)) {
      points.push(...entity.vertices);
    } else if (isDxfCircleEntity(entity)) {
      points.push(entity.center);
    } else if (isDxfArcEntity(entity)) {
      points.push(entity.center);
    }
  });

  console.log('Analyzing coordinates for system detection:', {
    totalEntities: entityCount,
    pointsCollected: points.length,
    samplePoints: points.slice(0, 5).map(p => ({x: p.x, y: p.y}))
  });

  // Try point-based detection first
  if (points.length > 0) {
    try {
      const suggestion = suggestCoordinateSystem(points);
      console.log('Point-based detection result:', suggestion);

      if (suggestion.confidence >= 0.5) {
        errorReporter.addInfo(
          `Detected coordinate system from geometry: ${suggestion.system} (${Math.round(suggestion.confidence * 100)}% confidence)`,
          'COORDINATE_SYSTEM_DETECTED',
          { 
            system: suggestion.system,
            confidence: suggestion.confidence,
            reason: suggestion.reason,
            source: 'points'
          }
        );

        return {
          ...suggestion,
          source: 'points'
        };
      }
    } catch (error) {
      console.warn('Point-based detection failed:', error);
      errorReporter.addWarning(
        'Point-based coordinate system detection failed',
        'POINT_DETECTION_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  } else {
    errorReporter.addWarning(
      'No valid points found for coordinate system detection',
      'NO_POINTS_FOR_DETECTION',
      { entityCount }
    );
  }

  // Try header-based detection
  const header = dxf.header;
  if (header) {
    const extMin = header.$EXTMIN;
    const extMax = header.$EXTMAX;

    if (extMin && extMax && isVector3(extMin) && isVector3(extMax)) {
      // Check for Swiss systems with confidence levels
      if (extMin.x >= 2450000 && extMin.x <= 2850000 &&
          extMin.y >= 1050000 && extMin.y <= 1300000) {
        errorReporter.addInfo(
          'Detected Swiss LV95 from header extents',
          'HEADER_DETECTION_LV95',
          { extMin, extMax }
        );
        return {
          system: COORDINATE_SYSTEMS.SWISS_LV95,
          confidence: 0.9,
          reason: 'Header extents match Swiss LV95 ranges',
          source: 'header'
        };
      }
      
      if (extMin.x >= 450000 && extMin.x <= 850000 &&
          extMin.y >= 50000 && extMin.y <= 300000) {
        errorReporter.addInfo(
          'Detected Swiss LV03 from header extents',
          'HEADER_DETECTION_LV03',
          { extMin, extMax }
        );
        return {
          system: COORDINATE_SYSTEMS.SWISS_LV03,
          confidence: 0.9,
          reason: 'Header extents match Swiss LV03 ranges',
          source: 'header'
        };
      }

      // More lenient ranges for potential matches
      if (extMin.x >= 2000000 && extMin.x <= 3000000 &&
          extMin.y >= 1000000 && extMin.y <= 2000000) {
        errorReporter.addInfo(
          'Possible Swiss LV95 from header extents (expanded range)',
          'HEADER_DETECTION_LV95_EXPANDED',
          { extMin, extMax }
        );
        return {
          system: COORDINATE_SYSTEMS.SWISS_LV95,
          confidence: 0.7,
          reason: 'Header extents roughly match Swiss LV95 ranges',
          source: 'header'
        };
      }

      if (extMin.x >= 400000 && extMin.x <= 900000 &&
          extMin.y >= 0 && extMin.y <= 400000) {
        errorReporter.addInfo(
          'Possible Swiss LV03 from header extents (expanded range)',
          'HEADER_DETECTION_LV03_EXPANDED',
          { extMin, extMax }
        );
        return {
          system: COORDINATE_SYSTEMS.SWISS_LV03,
          confidence: 0.7,
          reason: 'Header extents roughly match Swiss LV03 ranges',
          source: 'header'
        };
      }
    } else {
      errorReporter.addWarning(
        'DXF header missing or has invalid extents',
        'INVALID_HEADER_EXTENTS',
        { header }
      );
    }
  }

  // Fallback to NONE with explanation
  errorReporter.addWarning(
    'Could not confidently detect coordinate system',
    'NO_COORDINATE_SYSTEM_DETECTED',
    { 
      pointCount: points.length,
      hasHeader: !!header,
      hasExtents: !!(header?.$EXTMIN && header?.$EXTMAX)
    }
  );

  return {
    system: COORDINATE_SYSTEMS.NONE,
    confidence: 0,
    reason: 'Could not confidently detect any coordinate system',
    source: 'fallback'
  };
}

export function createDxfAnalyzer() {
  const analyze = (dxf: DxfData): AnalysisResult => {
    const errorReporter = createDxfErrorReporter();
    const stats: AnalysisStats = {
      entityCount: 0,
      layerCount: 0,
      blockCount: 0,
      lineCount: 0,
      pointCount: 0,
      polylineCount: 0,
      circleCount: 0,
      arcCount: 0,
      textCount: 0
    };

    // Validate basic structure
    if (!dxf) {
      errorReporter.addDxfError('Invalid DXF file structure', {
        type: 'INVALID_DXF',
        isCritical: true
      });
      return { isValid: false, stats, errorReporter, coordinateSystem: COORDINATE_SYSTEMS.NONE };
    }

    if (!dxf.entities) {
      errorReporter.addDxfError('DXF file is missing entities section', {
        type: 'MISSING_ENTITIES',
        isCritical: true
      });
      return { isValid: false, stats, errorReporter, coordinateSystem: COORDINATE_SYSTEMS.NONE };
    }

    // Detect coordinate system with enhanced feedback
    const detectionResult = detectCoordinateSystem(dxf, errorReporter);
    
    if (detectionResult.system === COORDINATE_SYSTEMS.NONE) {
      errorReporter.addDxfWarning(
        'Could not detect coordinate system, using local coordinates',
        {
          type: 'NO_COORDINATE_SYSTEM',
          details: {
            reason: detectionResult.reason,
            confidence: detectionResult.confidence,
            source: detectionResult.source
          }
        }
      );
    } else if (detectionResult.confidence < 0.8) {
      errorReporter.addDxfWarning(
        `Detected ${detectionResult.system} with moderate confidence (${Math.round(detectionResult.confidence * 100)}%)`,
        {
          type: 'MODERATE_CONFIDENCE_DETECTION',
          details: {
            system: detectionResult.system,
            confidence: detectionResult.confidence,
            reason: detectionResult.reason,
            source: detectionResult.source,
            alternatives: detectionResult.alternativeSystems
          }
        }
      );
    } else {
      errorReporter.addInfo(
        `Detected coordinate system: ${detectionResult.system} (${Math.round(detectionResult.confidence * 100)}% confidence)`,
        'COORDINATE_SYSTEM_DETECTED',
        {
          system: detectionResult.system,
          confidence: detectionResult.confidence,
          reason: detectionResult.reason,
          source: detectionResult.source
        }
      );
    }

    // Count entities and validate
    stats.entityCount = dxf.entities.length;
    
    // Count layers
    if (dxf.tables?.layer?.layers) {
      stats.layerCount = Object.keys(dxf.tables.layer.layers).length;
    } else {
      errorReporter.addDxfWarning('DXF file has no layer definitions', {
        type: 'NO_LAYERS'
      });
    }

    // Count blocks
    if (dxf.blocks) {
      stats.blockCount = Object.keys(dxf.blocks).length;
    }

    // Track unique layers for validation
    const foundLayers = new Set<string>();

    // Analyze entities
    dxf.entities.forEach((entity: unknown) => {
      if (!isEntityBase(entity)) {
        errorReporter.addDxfWarning('Invalid entity structure', {
          type: 'INVALID_ENTITY'
        });
        return;
      }

      // Track layer usage
      if (entity.layer) {
        foundLayers.add(entity.layer);
      }

      const entityMeta = { 
        handle: entity.handle,
        layer: entity.layer 
      };

      switch (entity.type) {
        case 'LINE':
          stats.lineCount++;
          if (!isDxfLineEntity(entity)) {
            errorReporter.addEntityWarning(
              'LINE',
              entity.handle,
              'Line entity has invalid start or end point',
              { type: 'INVALID_LINE', ...entityMeta }
            );
          }
          break;

        case 'POINT':
          stats.pointCount++;
          if (!isDxfPointEntity(entity)) {
            errorReporter.addEntityWarning(
              'POINT',
              entity.handle,
              'Point entity has invalid position',
              { type: 'INVALID_POINT', ...entityMeta }
            );
          }
          break;

        case 'POLYLINE':
        case 'LWPOLYLINE':
          stats.polylineCount++;
          if (!isDxfPolylineEntity(entity)) {
            errorReporter.addEntityWarning(
              'POLYLINE',
              entity.handle,
              'Polyline entity has invalid structure',
              { type: 'INVALID_POLYLINE', ...entityMeta }
            );
          } else if (entity.vertices.length < 2) {
            errorReporter.addEntityWarning(
              'POLYLINE',
              entity.handle,
              'Polyline entity has insufficient vertices',
              { type: 'INVALID_POLYLINE', ...entityMeta, vertexCount: entity.vertices.length }
            );
          }
          break;

        case 'CIRCLE':
          stats.circleCount++;
          if (!isDxfCircleEntity(entity)) {
            errorReporter.addEntityWarning(
              'CIRCLE',
              entity.handle,
              'Circle entity has invalid structure',
              { type: 'INVALID_CIRCLE', ...entityMeta }
            );
          }
          break;

        case 'ARC':
          stats.arcCount++;
          if (!isDxfArcEntity(entity)) {
            errorReporter.addEntityWarning(
              'ARC',
              entity.handle,
              'Arc entity has invalid structure',
              { type: 'INVALID_ARC', ...entityMeta }
            );
          }
          break;

        case 'TEXT':
        case 'MTEXT':
          stats.textCount++;
          if (!isDxfTextEntity(entity)) {
            errorReporter.addEntityWarning(
              'TEXT',
              entity.handle,
              'Text entity has invalid structure',
              { type: 'INVALID_TEXT', ...entityMeta }
            );
          }
          break;

        case 'INSERT':
          if (!isDxfInsertEntity(entity)) {
            errorReporter.addEntityWarning(
              'INSERT',
              entity.handle,
              'Block insertion has invalid structure',
              { type: 'INVALID_INSERT', ...entityMeta }
            );
          } else if (!dxf.blocks?.[entity.block]) {
            errorReporter.addEntityWarning(
              'INSERT',
              entity.handle,
              `Referenced block "${entity.block}" not found`,
              { type: 'INVALID_INSERT', ...entityMeta, blockName: entity.block }
            );
          }
          break;

        default:
          // Track unsupported types but don't treat as errors
          const statKey = `${entity.type.toLowerCase()}Count`;
          stats[statKey] = (stats[statKey] || 0) + 1;
      }
    });

    // Validate layer references
    if (dxf.tables?.layer?.layers) {
      foundLayers.forEach(layer => {
        if (!dxf.tables?.layer?.layers[layer]) {
          errorReporter.addDxfWarning(`Entity references undefined layer: ${layer}`, {
            type: 'UNDEFINED_LAYER',
            layer
          });
        }
      });
    }

    // Check for critical issues
    if (stats.entityCount === 0) {
      errorReporter.addDxfError('DXF file contains no valid entities', {
        type: 'NO_ENTITIES',
        isCritical: true
      });
    }

    // Add analysis summary to logs
    const validEntityCount = Object.entries(stats)
      .filter(([key]) => key.endsWith('Count') && key !== 'entityCount')
      .reduce((sum, [_, count]) => sum + count, 0);

    if (validEntityCount < stats.entityCount) {
      errorReporter.addDxfWarning(`${stats.entityCount - validEntityCount} entities of unsupported types were found`, {
        type: 'UNSUPPORTED_ENTITIES',
        totalEntities: stats.entityCount,
        validEntities: validEntityCount
      });
    }

    return {
      isValid: !errorReporter.getMessages().some(m => 
        m.details?.isCritical === true
      ),
      stats,
      errorReporter,
      coordinateSystem: detectionResult.system
    };
  };

  return { analyze };
}

export default createDxfAnalyzer;
