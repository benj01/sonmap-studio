import { processFeatureCollectionHeights, needsHeightTransformation } from '../heightTransformService';
import { processStoredLv95Coordinates } from '@/core/utils/coordinates';

// Mock dependencies
jest.mock('@/core/utils/coordinates', () => ({
  processStoredLv95Coordinates: jest.fn()
}));

jest.mock('@/core/logging/log-manager', () => ({
  LogManager: {
    getInstance: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      setComponentLogLevel: jest.fn()
    })
  }
}));

describe('HeightTransformService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('needsHeightTransformation', () => {
    it('should return true if any feature has height_mode=lv95_stored', () => {
      const featureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { height_mode: 'absolute' }
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { height_mode: 'lv95_stored' }
          }
        ]
      };

      const result = needsHeightTransformation(featureCollection as any);
      expect(result).toBe(true);
    });

    it('should return false if no feature has height_mode=lv95_stored', () => {
      const featureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { height_mode: 'absolute' }
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { height_mode: 'relative' }
          }
        ]
      };

      const result = needsHeightTransformation(featureCollection as any);
      expect(result).toBe(false);
    });
  });

  describe('processFeatureCollectionHeights', () => {
    it('should process features with lv95_stored height mode', async () => {
      // Mock implementation of processStoredLv95Coordinates
      const mockTransformedFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [8.5, 47.5, 500] },
        properties: { 
          height_mode: 'absolute_ellipsoidal',
          base_elevation_ellipsoidal: 500
        }
      };
      
      (processStoredLv95Coordinates as jest.Mock).mockResolvedValue(mockTransformedFeature);

      const featureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [8.5, 47.5] },
            properties: { 
              height_mode: 'lv95_stored',
              lv95_easting: 2600000,
              lv95_northing: 1200000,
              lv95_height: 450
            }
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [8.6, 47.6] },
            properties: { height_mode: 'absolute' }
          }
        ]
      };

      const result = await processFeatureCollectionHeights(featureCollection as any);
      
      expect(processStoredLv95Coordinates).toHaveBeenCalledTimes(1);
      expect(result.features.length).toBe(2);
      expect(result.features[0]).toEqual(mockTransformedFeature);
      expect(result.features[1]).toEqual(featureCollection.features[1]);
    });

    it('should handle errors during transformation', async () => {
      // Mock implementation to throw an error
      (processStoredLv95Coordinates as jest.Mock).mockRejectedValue(new Error('Transformation failed'));

      const originalFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [8.5, 47.5] },
        properties: { 
          height_mode: 'lv95_stored',
          lv95_easting: 2600000,
          lv95_northing: 1200000,
          lv95_height: 450
        }
      };

      const featureCollection = {
        type: 'FeatureCollection',
        features: [originalFeature]
      };

      const result = await processFeatureCollectionHeights(featureCollection as any);
      
      expect(processStoredLv95Coordinates).toHaveBeenCalledTimes(1);
      expect(result.features.length).toBe(1);
      // Feature should remain unchanged if transformation fails
      expect(result.features[0]).toEqual(originalFeature);
    });
  });
}); 