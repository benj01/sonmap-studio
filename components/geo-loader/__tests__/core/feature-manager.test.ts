import { FeatureManager } from '../../core/feature-manager';
import { Feature, Point } from 'geojson';

describe('FeatureManager', () => {
  let manager: FeatureManager;

  const createTestFeature = (id: number): Feature<Point> => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [id, id]
    },
    properties: { id }
  });

  beforeEach(() => {
    manager = new FeatureManager({
      chunkSize: 10,
      maxMemoryMB: 256,
      monitorMemory: true
    });
  });

  describe('feature storage', () => {
    it('should store and retrieve features', async () => {
      const feature = createTestFeature(1);
      await manager.addFeature(feature);

      const features: Feature[] = [];
      for await (const f of manager.getFeatures()) {
        features.push(f);
      }

      expect(features).toHaveLength(1);
      expect(features[0]).toEqual(feature);
    });

    it('should store multiple features', async () => {
      const features = Array.from({ length: 5 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      const retrieved: Feature[] = [];
      for await (const feature of manager.getFeatures()) {
        retrieved.push(feature);
      }

      expect(retrieved).toHaveLength(5);
      expect(retrieved).toEqual(features);
    });

    it('should handle empty feature list', async () => {
      await manager.addFeatures([]);

      const features: Feature[] = [];
      for await (const f of manager.getFeatures()) {
        features.push(f);
      }

      expect(features).toHaveLength(0);
    });
  });

  describe('chunking', () => {
    it('should create new chunk when limit reached', async () => {
      const features = Array.from({ length: 15 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      expect(manager.getChunkCount()).toBe(2); // 10 in first chunk, 5 in second
    });

    it('should retrieve features across chunks', async () => {
      const features = Array.from({ length: 25 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      const retrieved: Feature[] = [];
      for await (const feature of manager.getFeatures()) {
        retrieved.push(feature);
      }

      expect(retrieved).toHaveLength(25);
      expect(retrieved).toEqual(features);
    });

    it('should get specific chunk', async () => {
      const features = Array.from({ length: 15 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      const firstChunk = manager.getChunk(0);
      expect(firstChunk).toHaveLength(10);

      const secondChunk = manager.getChunk(1);
      expect(secondChunk).toHaveLength(5);
    });

    it('should return null for invalid chunk index', () => {
      expect(manager.getChunk(-1)).toBeNull();
      expect(manager.getChunk(999)).toBeNull();
    });
  });

  describe('memory management', () => {
    it('should track feature count', async () => {
      const features = Array.from({ length: 5 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      expect(manager.getFeatureCount()).toBe(5);
    });

    it('should clear all features', async () => {
      const features = Array.from({ length: 5 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);
      
      manager.clear();

      expect(manager.getFeatureCount()).toBe(0);
      expect(manager.getChunkCount()).toBe(0);
      expect(manager.isEmpty()).toBe(true);
    });

    it('should report memory usage', async () => {
      const features = Array.from({ length: 1000 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      const memoryUsage = manager.getMemoryUsageMB();
      expect(memoryUsage).toBeGreaterThan(0);
    });

    it('should provide feature statistics', async () => {
      const features = Array.from({ length: 25 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      const stats = manager.getStats();
      expect(stats.totalFeatures).toBe(25);
      expect(stats.chunkCount).toBeGreaterThan(0);
      expect(stats.memoryUsage.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('finalization', () => {
    it('should finalize current chunk', async () => {
      const features = Array.from({ length: 5 }, (_, i) => createTestFeature(i));
      await manager.addFeatures(features);

      const initialChunkCount = manager.getChunkCount();
      await manager.finalize();
      
      // Should create a new chunk even if not full
      expect(manager.getChunkCount()).toBe(initialChunkCount + 1);
    });

    it('should not create empty chunk on finalize', async () => {
      await manager.finalize();
      expect(manager.getChunkCount()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle invalid features gracefully', async () => {
      const invalidFeature = { type: 'Invalid' } as any;
      await expect(manager.addFeature(invalidFeature)).resolves.not.toThrow();
    });

    it('should maintain consistency after error', async () => {
      const validFeature = createTestFeature(1);
      const invalidFeature = { type: 'Invalid' } as any;

      await manager.addFeature(validFeature);
      await manager.addFeature(invalidFeature);
      await manager.addFeature(validFeature);

      const features: Feature[] = [];
      for await (const f of manager.getFeatures()) {
        features.push(f);
      }

      expect(features).toHaveLength(2);
      expect(features[0]).toEqual(validFeature);
      expect(features[1]).toEqual(validFeature);
    });
  });
});
