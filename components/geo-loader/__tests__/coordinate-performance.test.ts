import { MockErrorReporter } from './test-utils';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { BaseCoordinate } from '../types/coordinates';
import { Severity } from '../utils/errors';
import proj4 from 'proj4';

// Helper function to generate test points
const generatePoints = (count: number): BaseCoordinate[] => {
  return Array.from({ length: count }, (_, i) => ({
    x: 2600000 + i * 100,
    y: 1200000 + i * 100
  }));
};

describe('Coordinate Transformation Performance', () => {
  let errorReporter: MockErrorReporter;
  let proj4Instance: typeof proj4;
  let transformer: CoordinateTransformer;

  beforeEach(() => {
    errorReporter = new MockErrorReporter();
    proj4Instance = proj4;

    // Initialize Swiss coordinate systems
    proj4Instance.defs(
      COORDINATE_SYSTEMS.SWISS_LV95,
      '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 ' +
      '+x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
    );

    transformer = new CoordinateTransformer(
      COORDINATE_SYSTEMS.SWISS_LV95,
      COORDINATE_SYSTEMS.WGS84,
      errorReporter,
      proj4Instance
    );
  });

  describe('Large Dataset Performance', () => {
    it('handles large datasets efficiently', () => {
      const points = generatePoints(1000);
      const startTime = performance.now();

      points.forEach((point: BaseCoordinate) => {
        const result = transformer.transform(point);
        expect(result).toBeDefined();
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Log performance metrics
      console.log(`Transformed 1000 points in ${duration}ms (${duration / 1000}ms per point)`);

      // Performance should be reasonable (adjust threshold based on your needs)
      expect(duration).toBeLessThan(1000); // Should process 1000 points in less than 1 second
    });

    it('maintains accuracy with large datasets', () => {
      const points = generatePoints(1000);
      const results = points.map((point: BaseCoordinate) => transformer.transform(point));

      // Check a sample of points for accuracy
      const sampleIndices = [0, 250, 500, 750, 999];
      sampleIndices.forEach(index => {
        const result = results[index];
        expect(result).toBeDefined();
        expect(result!.x).toBeGreaterThanOrEqual(-180);
        expect(result!.x).toBeLessThanOrEqual(180);
        expect(result!.y).toBeGreaterThanOrEqual(-90);
        expect(result!.y).toBeLessThanOrEqual(90);
      });
    });

    it('handles concurrent transformations efficiently', async () => {
      const points = generatePoints(100);
      const startTime = performance.now();

      // Transform points concurrently
      const promises = points.map((point: BaseCoordinate) => 
        new Promise<void>(resolve => {
          const result = transformer.transform(point);
          expect(result).toBeDefined();
          resolve();
        })
      );

      await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`Concurrent transformation of 100 points took ${duration}ms`);
      expect(duration).toBeLessThan(500); // Should be faster than sequential
    });
  });

  describe('Memory Usage', () => {
    it('maintains reasonable memory usage with large datasets', () => {
      const points = generatePoints(10000);
      const initialMemory = process.memoryUsage().heapUsed;

      points.forEach((point: BaseCoordinate) => {
        transformer.transform(point);
      });

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory increase: ${memoryIncrease / 1024 / 1024} MB`);
      
      // Memory increase should be reasonable (adjust threshold based on your needs)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
    });

    it('releases memory after large transformations', () => {
      const points = generatePoints(10000);
      const initialMemory = process.memoryUsage().heapUsed;

      points.forEach((point: BaseCoordinate) => {
        transformer.transform(point);
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory increase after GC: ${memoryIncrease / 1024 / 1024} MB`);
      
      // Memory should be mostly released
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB retained
    });
  });

  describe('Error Handling Under Load', () => {
    it('maintains error reporting quality under load', () => {
      const points = [
        ...generatePoints(98), // Valid points
        { x: NaN, y: 1200000 }, // Invalid point
        { x: 2600000, y: NaN }  // Invalid point
      ];

      points.forEach((point: BaseCoordinate) => {
        try {
          transformer.transform(point);
        } catch (error) {
          // Expected for invalid points
        }
      });

      const errors = errorReporter.getErrors();
      expect(errors).toHaveLength(2); // Should have exactly 2 errors
      errors.forEach(error => {
        expect(error.message).toContain('Invalid coordinate');
      });
    });

    it('handles mixed valid and invalid coordinates efficiently', () => {
      const points = [
        ...generatePoints(48), // Valid points
        { x: NaN, y: 1200000 }, // Invalid point
        ...generatePoints(48),  // More valid points
        { x: 2600000, y: NaN }, // Invalid point
        ...generatePoints(2)    // Final valid points
      ];

      const startTime = performance.now();

      points.forEach((point: BaseCoordinate) => {
        try {
          transformer.transform(point);
        } catch (error) {
          // Expected for invalid points
        }
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`Mixed coordinate processing took ${duration}ms`);
      expect(duration).toBeLessThan(500); // Should still be reasonably fast
    });
  });

  describe('Batch Processing', () => {
    it('processes batches of points efficiently', () => {
      const batchSize = 100;
      const totalPoints = 1000;
      const points = generatePoints(totalPoints);
      const batches = Array.from({ length: totalPoints / batchSize }, (_, i) =>
        points.slice(i * batchSize, (i + 1) * batchSize)
      );

      const startTime = performance.now();

      batches.forEach(batch => {
        batch.forEach((point: BaseCoordinate) => {
          const result = transformer.transform(point);
          expect(result).toBeDefined();
        });
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`Batch processing took ${duration}ms (${duration / totalPoints}ms per point)`);
      expect(duration).toBeLessThan(1000); // Should process all batches in less than 1 second
    });
  });
});
