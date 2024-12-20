import { DxfData, DxfEntity, DxfEntityBase, Vector3, isVector3, isDxfPointEntity, isDxfLineEntity, isDxfPolylineEntity, isDxfCircleEntity, isDxfArcEntity, isDxfTextEntity, isDxfInsertEntity } from './types';
import { DxfErrorReporter, createDxfErrorReporter } from './error-collector';
import { ErrorMessage } from '../errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';

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
  coordinateSystem?: CoordinateSystem;
}

function isEntityBase(entity: unknown): entity is DxfEntityBase {
  return typeof entity === 'object' && 
         entity !== null && 
         typeof (entity as DxfEntityBase).type === 'string';
}

function detectCoordinateSystem(dxf: DxfData): CoordinateSystem | undefined {
  // Check for coordinate system in header variables
  const header = dxf.header;
  if (!header) return undefined;

  // Check for common coordinate system indicators
  if (header.$INSUNITS === 1) {
    // Scientific and engineering units (meters)
    // Common for Swiss coordinate systems
    const extMin = header.$EXTMIN;
    const extMax = header.$EXTMAX;

    if (extMin && extMax && isVector3(extMin) && isVector3(extMax)) {
      // Check coordinate ranges for Swiss systems
      if (extMin.x >= 2000000 && extMin.x <= 3000000 &&
          extMin.y >= 1000000 && extMin.y <= 2000000) {
        return COORDINATE_SYSTEMS.SWISS_LV95;
      }
      if (extMin.x >= 400000 && extMin.x <= 900000 &&
          extMin.y >= 50000 && extMin.y <= 400000) {
        return COORDINATE_SYSTEMS.SWISS_LV03;
      }
    }
  }

  // Check for WGS84 indicators
  if (header.$INSUNITS === 6) { // Meters
    const extMin = header.$EXTMIN;
    const extMax = header.$EXTMAX;

    if (extMin && extMax && isVector3(extMin) && isVector3(extMax)) {
      // Check if coordinates are in WGS84 range
      if (Math.abs(extMin.x) <= 180 && Math.abs(extMin.y) <= 90 &&
          Math.abs(extMax.x) <= 180 && Math.abs(extMax.y) <= 90) {
        return COORDINATE_SYSTEMS.WGS84;
      }
    }
  }

  return undefined;
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
      return { isValid: false, stats, errorReporter };
    }

    if (!dxf.entities) {
      errorReporter.addDxfError('DXF file is missing entities section', {
        type: 'MISSING_ENTITIES',
        isCritical: true
      });
      return { isValid: false, stats, errorReporter };
    }

    // Detect coordinate system
    const coordinateSystem = detectCoordinateSystem(dxf);
    if (!coordinateSystem) {
      errorReporter.addDxfWarning('Could not detect coordinate system, using local coordinates', {
        type: 'NO_COORDINATE_SYSTEM'
      });
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
      coordinateSystem
    };
  };

  return { analyze };
}

export default createDxfAnalyzer;
