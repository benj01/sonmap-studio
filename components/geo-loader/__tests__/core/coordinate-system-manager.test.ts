import { coordinateSystemManager } from '../../core/coordinate-system-manager';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { CoordinateSystemError } from '../../utils/errors';

describe('CoordinateSystemManager', () => {
  beforeEach(async () => {
    coordinateSystemManager.reset();
    await coordinateSystemManager.initialize();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(coordinateSystemManager.isInitialized()).toBe(true);
    });

    it('should register default coordinate systems', () => {
      const systems = coordinateSystemManager.getSupportedSystems();
      expect(systems).toContain(COORDINATE_SYSTEMS.WGS84);
      expect(systems).toContain(COORDINATE_SYSTEMS.SWISS_LV95);
      expect(systems).toContain(COORDINATE_SYSTEMS.SWISS_LV03);
    });
  });

  describe('coordinate system registration', () => {
    it('should register a custom coordinate system', () => {
      const customSystem = {
        code: 'CUSTOM_SYSTEM',
        proj4def: '+proj=longlat +datum=WGS84 +no_defs',
        bounds: {
          minX: -180,
          minY: -90,
          maxX: 180,
          maxY: 90
        }
      };

      coordinateSystemManager.registerSystem(customSystem);
      const systems = coordinateSystemManager.getSupportedSystems();
      expect(systems).toContain(customSystem.code);
    });

    it('should throw on invalid system definition', () => {
      const invalidSystem = {
        code: 'INVALID'
        // Missing proj4def
      };

      expect(() => {
        coordinateSystemManager.registerSystem(invalidSystem as any);
      }).toThrow(CoordinateSystemError);
    });
  });

  describe('coordinate transformation', () => {
    it('should transform WGS84 to Swiss LV95', async () => {
      const point = { x: 8.0, y: 47.4 }; // Somewhere in Switzerland
      const transformed = await coordinateSystemManager.transform(
        point,
        COORDINATE_SYSTEMS.WGS84,
        COORDINATE_SYSTEMS.SWISS_LV95
      );

      // Expected values from swisstopo reference
      expect(transformed.x).toBeCloseTo(2645021, -3);
      expect(transformed.y).toBeCloseTo(1249991, -3);
    });

    it('should transform Swiss LV95 to WGS84', async () => {
      const point = { x: 2645021, y: 1249991 };
      const transformed = await coordinateSystemManager.transform(
        point,
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84
      );

      expect(transformed.x).toBeCloseTo(8.0, 1);
      expect(transformed.y).toBeCloseTo(47.4, 1);
    });

    it('should handle invalid coordinates', async () => {
      const point = { x: NaN, y: 47.4 };
      await expect(
        coordinateSystemManager.transform(
          point,
          COORDINATE_SYSTEMS.WGS84,
          COORDINATE_SYSTEMS.SWISS_LV95
        )
      ).rejects.toThrow();
    });

    it('should validate coordinate bounds', () => {
      const outOfBounds = { x: 200, y: 100 }; // Outside WGS84 bounds
      expect(
        coordinateSystemManager.validateBounds(outOfBounds, COORDINATE_SYSTEMS.WGS84)
      ).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw on unknown source system', async () => {
      const point = { x: 0, y: 0 };
      await expect(
        coordinateSystemManager.transform(
          point,
          'UNKNOWN_SYSTEM',
          COORDINATE_SYSTEMS.WGS84
        )
      ).rejects.toThrow(CoordinateSystemError);
    });

    it('should throw on unknown target system', async () => {
      const point = { x: 0, y: 0 };
      await expect(
        coordinateSystemManager.transform(
          point,
          COORDINATE_SYSTEMS.WGS84,
          'UNKNOWN_SYSTEM'
        )
      ).rejects.toThrow(CoordinateSystemError);
    });

    it('should throw if not initialized', async () => {
      coordinateSystemManager.reset();
      const point = { x: 0, y: 0 };
      await expect(
        coordinateSystemManager.transform(
          point,
          COORDINATE_SYSTEMS.WGS84,
          COORDINATE_SYSTEMS.SWISS_LV95
        )
      ).rejects.toThrow(CoordinateSystemError);
    });
  });

  describe('system information', () => {
    it('should return system definition', () => {
      const definition = coordinateSystemManager.getSystemDefinition(COORDINATE_SYSTEMS.WGS84);
      expect(definition).toBeDefined();
      expect(definition?.code).toBe(COORDINATE_SYSTEMS.WGS84);
    });

    it('should return system units', () => {
      const units = coordinateSystemManager.getSystemUnits(COORDINATE_SYSTEMS.SWISS_LV95);
      expect(units).toBe('meters');
    });
  });
});
