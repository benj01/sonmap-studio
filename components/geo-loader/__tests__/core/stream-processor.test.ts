import { StreamProcessor, ProcessingContext, StreamProcessorOptions } from '../../core/stream-processor';
import { AnalyzeResult } from '../../processors/base-processor';
import { Feature, Point } from 'geojson';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { coordinateSystemManager } from '../../core/coordinate-system-manager';

// Test implementation of StreamProcessor
class TestStreamProcessor extends StreamProcessor {
  private testFeatures: Feature[];
  private chunkSize: number;
  private simulateError: boolean;

  constructor(options: StreamProcessorOptions = {}, testFeatures: Feature[] = [], simulateError = false) {
    super(options);
    this.testFeatures = testFeatures;
    this.chunkSize = options.chunkSize || 64 * 1024;
    this.simulateError = simulateError;
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.endsWith('.test');
  }

  protected createReadStream(file: File): ReadableStream<Buffer> {
    // Simulate file streaming by chunking test features
    const chunks: Buffer[] = [];
    const featuresPerChunk = Math.ceil(this.testFeatures.length / (file.size / this.chunkSize));
    
    for (let i = 0; i < this.testFeatures.length; i += featuresPerChunk) {
      const chunkFeatures = this.testFeatures.slice(i, i + featuresPerChunk);
      chunks.push(Buffer.from(JSON.stringify(chunkFeatures)));
    }

    return new ReadableStream({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(chunk));
        controller.close();
      }
    });
  }

  protected async processChunk(chunk: Buffer, context: ProcessingContext): Promise<Feature[]> {
    if (this.simulateError) {
      throw new Error('Simulated processing error');
    }

    const features: Feature[] = JSON.parse(chunk.toString());
    return features;
  }

  public async analyze(file: File): Promise<AnalyzeResult> {
    // Simple implementation for testing
    const preview = this.testFeatures.slice(0, 10);
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    preview.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const [x, y] = feature.geometry.coordinates;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });

    return {
      layers: ['test'],
      coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
      bounds: isFinite(minX) ? { minX, minY, maxX, maxY } : undefined,
      preview: {
        type: 'FeatureCollection',
        features: preview
      }
    };
  }
}

describe('StreamProcessor', () => {
  let processor: TestStreamProcessor;
  const createTestFeature = (id: number): Feature<Point> => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [id, id]
    },
    properties: { id }
  });

  beforeEach(async () => {
    await coordinateSystemManager.initialize();
  });

  describe('streaming processing', () => {
    it('should process features in chunks', async () => {
      const testFeatures = Array.from({ length: 100 }, (_, i) => createTestFeature(i));
      processor = new TestStreamProcessor(
        { chunkSize: 1024 },
        testFeatures
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      const result = await processor.process(file);

      expect(result.features.features).toHaveLength(100);
      expect(result.statistics.featureCount).toBe(100);
    });

    it('should handle empty files', async () => {
      processor = new TestStreamProcessor({ chunkSize: 1024 }, []);
      const file = new File([], 'empty.test', { type: 'application/octet-stream' });
      const result = await processor.process(file);

      expect(result.features.features).toHaveLength(0);
      expect(result.statistics.featureCount).toBe(0);
    });

    it('should track processing progress', async () => {
      const progressUpdates: number[] = [];
      const testFeatures = Array.from({ length: 50 }, (_, i) => createTestFeature(i));
      
      processor = new TestStreamProcessor(
        {
          chunkSize: 512,
          onProgress: (progress) => progressUpdates.push(progress)
        },
        testFeatures
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      await processor.process(file);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(Math.max(...progressUpdates)).toBeLessThanOrEqual(1);
      expect(Math.min(...progressUpdates)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('memory management', () => {
    it('should monitor memory usage', async () => {
      const testFeatures = Array.from({ length: 1000 }, (_, i) => createTestFeature(i));
      processor = new TestStreamProcessor(
        {
          chunkSize: 1024,
          maxMemoryMB: 1024,
          monitorMemory: true
        },
        testFeatures
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      const result = await processor.process(file);

      const context = processor.getContext();
      expect(context.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(context.memoryUsage.heapTotal).toBeGreaterThan(0);
    });

    it('should respect memory limits', async () => {
      const testFeatures = Array.from({ length: 10000 }, (_, i) => createTestFeature(i));
      processor = new TestStreamProcessor(
        {
          chunkSize: 1024,
          maxMemoryMB: 1, // Very low limit to trigger error
          monitorMemory: true
        },
        testFeatures
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      await expect(processor.process(file)).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle processing errors', async () => {
      processor = new TestStreamProcessor(
        { chunkSize: 1024 },
        [createTestFeature(1)],
        true // Simulate error
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      await expect(processor.process(file)).rejects.toThrow('Simulated processing error');
    });

    it('should maintain context after error', async () => {
      processor = new TestStreamProcessor(
        { chunkSize: 1024 },
        [createTestFeature(1)],
        true
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      try {
        await processor.process(file);
      } catch (error) {
        const context = processor.getContext();
        expect(context.errors).toBeGreaterThan(0);
      }
    });
  });

  describe('cancellation', () => {
    it('should handle processing cancellation', async () => {
      const testFeatures = Array.from({ length: 1000 }, (_, i) => createTestFeature(i));
      processor = new TestStreamProcessor(
        { chunkSize: 512 },
        testFeatures
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      const processPromise = processor.process(file);
      
      // Cancel after a short delay
      setTimeout(() => processor.cancel(), 10);

      const result = await processPromise;
      expect(result.features.features.length).toBeLessThan(testFeatures.length);
      expect(processor.isCancelled()).toBe(true);
    });

    it('should reset cancelled state after new processing', async () => {
      const testFeatures = Array.from({ length: 10 }, (_, i) => createTestFeature(i));
      processor = new TestStreamProcessor(
        { chunkSize: 512 },
        testFeatures
      );

      const file = new File([Buffer.from('test')], 'test.test', { type: 'application/octet-stream' });
      
      // First process with cancellation
      const firstPromise = processor.process(file);
      processor.cancel();
      await firstPromise;

      // Second process without cancellation
      const result = await processor.process(file);
      expect(result.features.features).toHaveLength(10);
      expect(processor.isCancelled()).toBe(false);
    });
  });
});
