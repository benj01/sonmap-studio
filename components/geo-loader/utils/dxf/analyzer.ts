import { DxfData } from './types';

interface AnalysisWarning {
  type: string;
  message: string;
}

interface AnalysisError {
  type: string;
  message: string;
  isCritical: boolean;
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
  [key: string]: number; // Allow additional stat types
}

interface AnalysisResult {
  isValid: boolean;
  warnings: AnalysisWarning[];
  errors: AnalysisError[];
  stats: AnalysisStats;
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
    }

    // Count blocks
    if (dxf.blocks) {
      stats.blockCount = Object.keys(dxf.blocks).length;
    }

    // Analyze entities
    dxf.entities.forEach(entity => {
      if (!entity) {
        warnings.push({
          type: 'NULL_ENTITY',
          message: 'Found null entity in DXF file'
        });
        return;
      }

      switch (entity.type) {
        case 'LINE':
          stats.lineCount++;
          if (!entity.start || !entity.end) {
            warnings.push({
              type: 'INVALID_LINE',
              message: 'Line entity missing start or end point'
            });
          }
          break;
        case 'POINT':
          stats.pointCount++;
          if (!entity.position) {
            warnings.push({
              type: 'INVALID_POINT',
              message: 'Point entity missing position'
            });
          }
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          stats.polylineCount++;
          if (!entity.vertices || entity.vertices.length < 2) {
            warnings.push({
              type: 'INVALID_POLYLINE',
              message: 'Polyline entity has insufficient vertices'
            });
          }
          break;
        case 'CIRCLE':
          stats.circleCount++;
          if (!entity.center || !entity.radius) {
            warnings.push({
              type: 'INVALID_CIRCLE',
              message: 'Circle entity missing center or radius'
            });
          }
          break;
        case 'ARC':
          stats.arcCount++;
          if (!entity.center || !entity.radius || !entity.startAngle || !entity.endAngle) {
            warnings.push({
              type: 'INVALID_ARC',
              message: 'Arc entity missing required properties'
            });
          }
          break;
        case 'TEXT':
        case 'MTEXT':
          stats.textCount++;
          if (!entity.position || !entity.text) {
            warnings.push({
              type: 'INVALID_TEXT',
              message: 'Text entity missing position or content'
            });
          }
          break;
      }
    });

    // Check for critical issues
    if (stats.entityCount === 0) {
      errors.push({
        type: 'NO_ENTITIES',
        message: 'DXF file contains no valid entities',
        isCritical: true
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
