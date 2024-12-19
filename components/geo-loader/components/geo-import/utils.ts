import { AnalyzeResult } from '../../processors';
import { Warning, Analysis } from '../../types/map';

export const PROGRESS_PHASES = {
  PARSE: {
    START: 0,
    END: 0.3,
    description: 'Parsing file'
  },
  ANALYZE: {
    START: 0.3,
    END: 0.6,
    description: 'Analyzing content'
  },
  CONVERT: {
    START: 0.6,
    END: 1,
    description: 'Converting data'
  }
} as const;

/**
 * Convert warnings from AnalyzeResult format to Analysis format
 */
export function convertToAnalysis(result: AnalyzeResult): Analysis {
  return {
    warnings: (result.warnings || []).map(w => ({
      type: w.type,
      message: w.message,
      entity: w.context?.entity as Warning['entity']
    }))
  };
}

/**
 * Convert warnings to a format suitable for display
 */
export function convertWarnings(warnings: Array<{ type: string; message: string; context?: Record<string, any> }> = []): Warning[] {
  return warnings.map(w => ({
    type: w.type,
    message: w.message,
    entity: w.context?.entity
  }));
}

/**
 * Convert processor statistics to a format suitable for display
 */
export function convertStatistics(stats: any) {
  if (!stats) return null;

  return {
    pointCount: stats.featureCount || 0,
    layerCount: stats.layerCount || 0,
    featureTypes: stats.featureTypes || {},
    failedTransformations: stats.failedTransformations || 0,
    errors: stats.errors || []
  };
}
