import { DxfData, DxfEntity, DxfEntityBase, Vector3, isVector3, isDxfPointEntity, isDxfLineEntity, isDxfPolylineEntity, isDxfCircleEntity, isDxfArcEntity, isDxfTextEntity, isDxfInsertEntity } from './types';

interface AnalysisWarning {
  type: string;
  message: string;
  entity?: {
    handle?: string;
    layer?: string;
  };
}

interface AnalysisError {
  type: string;
  message: string;
  isCritical: boolean;
  entity?: {
    handle?: string;
    layer?: string;
  };
}

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
  warnings: AnalysisWarning[];
  errors: AnalysisError[];
  stats: AnalysisStats;
}

function isEntityBase(entity: unknown): entity is DxfEntityBase {
  return typeof entity === 'object' && 
         entity !== null && 
         typeof (entity as DxfEntityBase).type === 'string';
}

export function createDxfAnalyzer() {
  const analyze = (dxf: DxfData): AnalysisResult => {
    const warnings: AnalysisWarning[] = [];
    const errors: AnalysisError[] = [];
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
      errors.push({
        type: 'INVALID_DXF',
        message: 'Invalid DXF file structure',
        isCritical: true
      });
      return { isValid: false, warnings, errors, stats };
    }

    if (!dxf.entities) {
      errors.push({
        type: 'MISSING_ENTITIES',
        message: 'DXF file is missing entities section',
        isCritical: true
      });
      return { isValid: false, warnings, errors, stats };
    }

    // Count entities and validate
    stats.entityCount = dxf.entities.length;
    
    // Count layers
    if (dxf.tables?.layer?.layers) {
      stats.layerCount = Object.keys(dxf.tables.layer.layers).length;
    } else {
      warnings.push({
        type: 'NO_LAYERS',
        message: 'DXF file has no layer definitions'
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
        warnings.push({
          type: 'INVALID_ENTITY',
          message: 'Invalid entity structure'
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
            warnings.push({
              type: 'INVALID_LINE',
              message: 'Line entity has invalid start or end point',
              entity: entityMeta
            });
          }
          break;

        case 'POINT':
          stats.pointCount++;
          if (!isDxfPointEntity(entity)) {
            warnings.push({
              type: 'INVALID_POINT',
              message: 'Point entity has invalid position',
              entity: entityMeta
            });
          }
          break;

        case 'POLYLINE':
        case 'LWPOLYLINE':
          stats.polylineCount++;
          if (!isDxfPolylineEntity(entity)) {
            warnings.push({
              type: 'INVALID_POLYLINE',
              message: 'Polyline entity has invalid structure',
              entity: entityMeta
            });
          } else if (entity.vertices.length < 2) {
            warnings.push({
              type: 'INVALID_POLYLINE',
              message: 'Polyline entity has insufficient vertices',
              entity: entityMeta
            });
          }
          break;

        case 'CIRCLE':
          stats.circleCount++;
          if (!isDxfCircleEntity(entity)) {
            warnings.push({
              type: 'INVALID_CIRCLE',
              message: 'Circle entity has invalid structure',
              entity: entityMeta
            });
          }
          break;

        case 'ARC':
          stats.arcCount++;
          if (!isDxfArcEntity(entity)) {
            warnings.push({
              type: 'INVALID_ARC',
              message: 'Arc entity has invalid structure',
              entity: entityMeta
            });
          }
          break;

        case 'TEXT':
        case 'MTEXT':
          stats.textCount++;
          if (!isDxfTextEntity(entity)) {
            warnings.push({
              type: 'INVALID_TEXT',
              message: 'Text entity has invalid structure',
              entity: entityMeta
            });
          }
          break;

        case 'INSERT':
          if (!isDxfInsertEntity(entity)) {
            warnings.push({
              type: 'INVALID_INSERT',
              message: 'Block insertion has invalid structure',
              entity: entityMeta
            });
          } else if (!dxf.blocks?.[entity.block]) {
            warnings.push({
              type: 'INVALID_INSERT',
              message: `Referenced block "${entity.block}" not found`,
              entity: entityMeta
            });
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
          warnings.push({
            type: 'UNDEFINED_LAYER',
            message: `Entity references undefined layer: ${layer}`
          });
        }
      });
    }

    // Check for critical issues
    if (stats.entityCount === 0) {
      errors.push({
        type: 'NO_ENTITIES',
        message: 'DXF file contains no valid entities',
        isCritical: true
      });
    }

    // Add analysis summary to logs
    const validEntityCount = Object.entries(stats)
      .filter(([key]) => key.endsWith('Count') && key !== 'entityCount')
      .reduce((sum, [_, count]) => sum + count, 0);

    if (validEntityCount < stats.entityCount) {
      warnings.push({
        type: 'UNSUPPORTED_ENTITIES',
        message: `${stats.entityCount - validEntityCount} entities of unsupported types were found`
      });
    }

    return {
      isValid: errors.every(e => !e.isCritical),
      warnings,
      errors,
      stats
    };
  };

  return { analyze };
}

export default createDxfAnalyzer;
