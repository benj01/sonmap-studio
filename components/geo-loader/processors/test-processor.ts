// components/geo-loader/processors/test-processor.ts

import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { COORDINATE_SYSTEMS } from '../types/coordinates';

export class TestProcessor extends BaseProcessor {
  constructor(options: ProcessorOptions = {}) {
    super(options);
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.test');
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    this.emitProgress(0.5);
    
    const result: AnalyzeResult = {
      layers: ['test'],
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      preview: {
        type: 'FeatureCollection',
        features: []
      }
    };

    this.emitProgress(1);
    return result;
  }

  async process(file: File): Promise<ProcessorResult> {
    this.emitProgress(0.5);
    
    const result: ProcessorResult = {
      features: {
        type: 'FeatureCollection',
        features: []
      },
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1
      },
      layers: ['test'],
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      statistics: this.createDefaultStats()
    };

    this.emitProgress(1);
    return result;
  }
}

// Register the test processor
ProcessorRegistry.register('test', TestProcessor);