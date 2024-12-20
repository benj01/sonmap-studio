import { BaseProcessor, ProcessorOptions, ProcessorResult, AnalyzeResult } from '../../processors/base-processor';
import { Feature } from 'geojson';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { ValidationError, ParseError } from '../../utils/errors';

// Mock processor implementation for testing
class TestProcessor extends BaseProcessor {
  constructor(options: ProcessorOptions = {}) {
    super(options);
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.endsWith('.test');
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    if (!file.name.endsWith('.test')) {
      throw new ValidationError(
        'Invalid file type',
        'test_file_type',
        file.name,
        { extension: file.name.split('.').pop() }
      );
    }

    return {
      layers: ['test'],
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      preview: {
        type: 'FeatureCollection',
        features: []
      }
    };
  }

  async process(file: File): Promise<ProcessorResult> {
    if (!file.name.endsWith('.test')) {
      throw new ValidationError(
        'Invalid file type',
        'test_file_type',
        file.name,
        { extension: file.name.split('.').pop() }
      );
    }

    const stats = this.createDefaultStats();
    this.updateStats(stats, 'Point');
    this.recordError(
      stats,
      'test_error',
      'TEST_ERROR',
      'Test error message',
      { detail: 'test' }
    );

    return {
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
      statistics: stats
    };
  }
}

describe('BaseProcessor', () => {
  let processor: TestProcessor;
  let testFile: File;

  beforeEach(() => {
    processor = new TestProcessor();
    testFile = new File(['test content'], 'test.test', { type: 'text/plain' });
  });

  describe('error handling', () => {
    test('should handle validation errors', async () => {
      const invalidFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      
      await expect(processor.analyze(invalidFile)).rejects.toThrow(ValidationError);
      await expect(processor.process(invalidFile)).rejects.toThrow(ValidationError);
    });

    test('should record errors in statistics', async () => {
      const result = await processor.process(testFile);
      
      expect(result.statistics.errors).toHaveLength(1);
      expect(result.statistics.errors[0]).toEqual({
        type: 'test_error',
        code: 'TEST_ERROR',
        message: 'Test error message',
        count: 1,
        details: { detail: 'test' }
      });
    });

    test('should update statistics correctly', async () => {
      const result = await processor.process(testFile);
      
      expect(result.statistics.featureCount).toBe(1);
      expect(result.statistics.featureTypes).toHaveProperty('Point', 1);
    });
  });

  describe('progress reporting', () => {
    test('should call onProgress callback', async () => {
      const onProgress = jest.fn();
      processor = new TestProcessor({ onProgress });

      await processor.process(testFile);
      
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(expect.any(Number));
      expect(onProgress.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
      expect(onProgress.mock.calls[0][0]).toBeLessThanOrEqual(1);
    });
  });

  describe('error reporting', () => {
    test('should collect errors and warnings', async () => {
      await processor.process(testFile);
      
      const errors = processor.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Test error message');
    });

    test('should clear errors', async () => {
      await processor.process(testFile);
      processor.clear();
      
      const errors = processor.getErrors();
      expect(errors).toHaveLength(0);
    });
  });

  describe('file type detection', () => {
    test('should detect supported file types', async () => {
      expect(await processor.canProcess(testFile)).toBe(true);
      expect(await processor.canProcess(new File([''], 'test.txt'))).toBe(false);
    });
  });

  describe('coordinate system handling', () => {
    test('should use provided coordinate system', async () => {
      processor = new TestProcessor({
        coordinateSystem: COORDINATE_SYSTEMS.SWISS_LV95
      });

      const result = await processor.process(testFile);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });
  });
});
