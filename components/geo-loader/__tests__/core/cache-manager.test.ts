import { cacheManager } from '../../core/cache-manager';
import { CoordinatePoint } from '../../types/coordinates';
import { Feature, Point, FeatureCollection } from 'geojson';

describe('CacheManager', () => {
  beforeEach(() => {
    cacheManager.clear();
  });

  const createTestPoint = (x: number, y: number): CoordinatePoint => ({ x, y });
  
  const createTestPreview = (id: number): any => ({
    features: {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [id, id]
        },
        properties: { id }
      }]
    },
    bounds: {
      minX: id,
      minY: id,
      maxX: id + 1,
      maxY: id + 1
    },
    layers: ['test'],
    featureCount: 1,
    coordinateSystem: 'WGS84'
  });

  describe('transformation caching', () => {
    it('should cache and retrieve transformation results', () => {
      const point = createTestPoint(1, 1);
      const result = createTestPoint(2, 2);
      
      cacheManager.cacheTransformation(point, 'SRC', 'DST', result);
      const cached = cacheManager.getCachedTransformation(point, 'SRC', 'DST');

      expect(cached).toEqual(result);
    });

    it('should return null for uncached transformations', () => {
      const point = createTestPoint(1, 1);
      const cached = cacheManager.getCachedTransformation(point, 'SRC', 'DST');

      expect(cached).toBeNull();
    });

    it('should handle cache size limits', () => {
      // Add many transformations to trigger cache pruning
      for (let i = 0; i < 15000; i++) {
        const point = createTestPoint(i, i);
        const result = createTestPoint(i * 2, i * 2);
        cacheManager.cacheTransformation(point, 'SRC', 'DST', result);
      }

      const stats = cacheManager.getStats();
      expect(stats.transformationCacheSize).toBeLessThan(15000);
    });

    it('should track cache hits and misses', () => {
      const point = createTestPoint(1, 1);
      const result = createTestPoint(2, 2);

      // First access - miss
      cacheManager.getCachedTransformation(point, 'SRC', 'DST');
      
      // Cache the result
      cacheManager.cacheTransformation(point, 'SRC', 'DST', result);
      
      // Second access - hit
      cacheManager.getCachedTransformation(point, 'SRC', 'DST');

      const stats = cacheManager.getStats();
      expect(stats.transformationHits).toBe(1);
      expect(stats.transformationMisses).toBe(1);
    });
  });

  describe('preview caching', () => {
    it('should cache and retrieve preview results', () => {
      const preview = createTestPreview(1);
      const fileId = 'test.csv';
      const options = { maxFeatures: 100 };

      cacheManager.cachePreview(fileId, options, preview);
      const cached = cacheManager.getCachedPreview(fileId, options);

      expect(cached?.features).toEqual(preview.features);
      expect(cached?.bounds).toEqual(preview.bounds);
    });

    it('should return null for uncached previews', () => {
      const fileId = 'test.csv';
      const options = { maxFeatures: 100 };
      const cached = cacheManager.getCachedPreview(fileId, options);

      expect(cached).toBeNull();
    });

    it('should handle different options as unique cache keys', () => {
      const preview1 = createTestPreview(1);
      const preview2 = createTestPreview(2);
      const fileId = 'test.csv';
      const options1 = { maxFeatures: 100 };
      const options2 = { maxFeatures: 200 };

      cacheManager.cachePreview(fileId, options1, preview1);
      cacheManager.cachePreview(fileId, options2, preview2);

      const cached1 = cacheManager.getCachedPreview(fileId, options1);
      const cached2 = cacheManager.getCachedPreview(fileId, options2);

      expect(cached1?.features).toEqual(preview1.features);
      expect(cached2?.features).toEqual(preview2.features);
    });

    it('should handle cache size limits', () => {
      // Add many previews to trigger cache pruning
      for (let i = 0; i < 200; i++) {
        const preview = createTestPreview(i);
        cacheManager.cachePreview(`file${i}.csv`, {}, preview);
      }

      const stats = cacheManager.getStats();
      expect(stats.previewCacheSize).toBeLessThan(200);
    });

    it('should track cache hits and misses', () => {
      const preview = createTestPreview(1);
      const fileId = 'test.csv';
      const options = { maxFeatures: 100 };

      // First access - miss
      cacheManager.getCachedPreview(fileId, options);
      
      // Cache the result
      cacheManager.cachePreview(fileId, options, preview);
      
      // Second access - hit
      cacheManager.getCachedPreview(fileId, options);

      const stats = cacheManager.getStats();
      expect(stats.previewHits).toBe(1);
      expect(stats.previewMisses).toBe(1);
    });
  });

  describe('cache management', () => {
    it('should clear all caches', () => {
      // Add some test data
      const point = createTestPoint(1, 1);
      const result = createTestPoint(2, 2);
      cacheManager.cacheTransformation(point, 'SRC', 'DST', result);

      const preview = createTestPreview(1);
      cacheManager.cachePreview('test.csv', {}, preview);

      // Clear caches
      cacheManager.clear();

      // Verify caches are empty
      const transformCached = cacheManager.getCachedTransformation(point, 'SRC', 'DST');
      const previewCached = cacheManager.getCachedPreview('test.csv', {});

      expect(transformCached).toBeNull();
      expect(previewCached).toBeNull();
    });

    it('should clear expired entries', () => {
      jest.useFakeTimers();

      // Add test data
      const point = createTestPoint(1, 1);
      const result = createTestPoint(2, 2);
      cacheManager.cacheTransformation(point, 'SRC', 'DST', result);

      const preview = createTestPreview(1);
      cacheManager.cachePreview('test.csv', {}, preview);

      // Advance time past TTL
      jest.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

      // Clear expired entries
      cacheManager.clearExpired();

      // Verify expired entries are removed
      const transformCached = cacheManager.getCachedTransformation(point, 'SRC', 'DST');
      const previewCached = cacheManager.getCachedPreview('test.csv', {});

      expect(transformCached).toBeNull();
      expect(previewCached).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('cache statistics', () => {
    it('should calculate hit rates', () => {
      const point = createTestPoint(1, 1);
      const result = createTestPoint(2, 2);

      // Transformation cache: 1 miss, 1 hit
      cacheManager.getCachedTransformation(point, 'SRC', 'DST');
      cacheManager.cacheTransformation(point, 'SRC', 'DST', result);
      cacheManager.getCachedTransformation(point, 'SRC', 'DST');

      // Preview cache: 2 misses
      cacheManager.getCachedPreview('test.csv', {});
      cacheManager.getCachedPreview('test2.csv', {});

      const hitRates = cacheManager.getHitRates();
      expect(hitRates.transformation).toBe(0.5); // 1 hit / 2 total
      expect(hitRates.preview).toBe(0); // 0 hits / 2 total
    });

    it('should handle zero access statistics', () => {
      const hitRates = cacheManager.getHitRates();
      expect(hitRates.transformation).toBe(0);
      expect(hitRates.preview).toBe(0);
    });
  });
});
