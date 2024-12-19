import proj4 from 'proj4';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { MockErrorReporter } from './test-utils';
import { Severity, CoordinateTransformationError } from '../utils/errors';

describe('CoordinateTransformer', () => {
  let errorReporter: MockErrorReporter;
  let proj4Instance: typeof proj4;

  beforeEach(() => {
    errorReporter = new MockErrorReporter();
    proj4Instance = proj4;

    // Initialize coordinate systems
    proj4Instance.defs(
      COORDINATE_SYSTEMS.SWISS_LV95,
      '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 ' +
      '+x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
    );
  });

  describe('constructor', () => {
    it('creates transformer for valid coordinate systems', () => {
      const transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        proj4Instance
      );

      expect(transformer).toBeDefined();
      expect(errorReporter.hasErrors()).toBe(false);
    });

    it('handles invalid coordinate systems', () => {
      expect(() => {
        new CoordinateTransformer(
          'INVALID_SYSTEM' as any,
          COORDINATE_SYSTEMS.WGS84,
          errorReporter,
          proj4Instance
        );
      }).toThrow('Invalid coordinate system');

      const errors = errorReporter.getErrors();
      expect(errors[0].message).toBe('Invalid coordinate system configuration');
      expect(errors[0].context).toEqual({
        fromSystem: 'INVALID_SYSTEM',
        toSystem: COORDINATE_SYSTEMS.WGS84
      });
    });
  });

  describe('transform', () => {
    let transformer: CoordinateTransformer;

    beforeEach(() => {
      transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        proj4Instance
      );
    });

    it('transforms valid coordinates', () => {
      const point = { x: 2600000, y: 1200000 }; // Origin of Swiss LV95
      const result = transformer.transform(point);

      expect(result).toBeDefined();
      expect(result!.x).toBeCloseTo(7.43958, 4); // Longitude
      expect(result!.y).toBeCloseTo(46.95241, 4); // Latitude
    });

    it('handles coordinate order correctly for Swiss systems', () => {
      // Swiss coordinates are in (E,N) format, WGS84 in (lon,lat)
      const point = { x: 2600000, y: 1200000 }; // (E,N)
      const result = transformer.transform(point);

      // Result should be in (lon,lat) format
      expect(result!.x).toBeCloseTo(7.43958, 4); // Longitude
      expect(result!.y).toBeCloseTo(46.95241, 4); // Latitude

      // Create reverse transformer
      const reverseTransformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.WGS84,
        COORDINATE_SYSTEMS.SWISS_LV95,
        errorReporter,
        proj4Instance
      );

      // Transform back to Swiss coordinates
      const reversed = reverseTransformer.transform(result!);
      expect(reversed!.x).toBeCloseTo(point.x, 0); // Easting
      expect(reversed!.y).toBeCloseTo(point.y, 0); // Northing
    });

    it('handles invalid coordinates', () => {
      const point = { x: NaN, y: 1200000 };
      
      expect(() => {
        transformer.transform(point);
      }).toThrow(CoordinateTransformationError);

      const errors = errorReporter.getErrors();
      expect(errors[0].message).toBe('Invalid coordinate value');
      expect(errors[0].context).toEqual({
        point,
        fromSystem: COORDINATE_SYSTEMS.SWISS_LV95,
        toSystem: COORDINATE_SYSTEMS.WGS84
      });
    });

    it('tracks transformation attempts', () => {
      const point = { x: NaN, y: 1200000 };
      
      // Attempt transformation multiple times
      for (let i = 0; i < 3; i++) {
        try {
          transformer.transform(point);
        } catch (error) {
          // Expected error
        }
      }

      // Fourth attempt should warn about excessive retries
      try {
        transformer.transform(point);
      } catch (error) {
        // Expected error
      }

      const warnings = errorReporter.getWarnings();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Maximum transformation attempts exceeded');
      expect(warnings[0].context).toEqual({
        point,
        attempts: 3,
        fromSystem: COORDINATE_SYSTEMS.SWISS_LV95,
        toSystem: COORDINATE_SYSTEMS.WGS84
      });
    });

    it('validates transformed coordinates', () => {
      // Mock proj4 to return invalid coordinates
      const mockProj4 = {
        defs: jest.fn(),
        Proj: jest.fn(),
        transform: jest.fn().mockReturnValue([NaN, NaN]),
      };

      const transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        mockProj4 as unknown as typeof proj4
      );

      const point = { x: 2600000, y: 1200000 };
      
      expect(() => {
        transformer.transform(point);
      }).toThrow(CoordinateTransformationError);

      const errors = errorReporter.getErrors();
      expect(errors[0].message).toBe('Transformation resulted in invalid coordinates');
      expect(errors[0].context).toEqual({
        point,
        fromSystem: COORDINATE_SYSTEMS.SWISS_LV95,
        toSystem: COORDINATE_SYSTEMS.WGS84,
        result: { x: NaN, y: NaN }
      });
    });

    it('handles z coordinates', () => {
      const point = { x: 2600000, y: 1200000, z: 500 };
      const result = transformer.transform(point);

      expect(result).toBeDefined();
      expect(result!.x).toBeCloseTo(7.43958, 4); // Longitude
      expect(result!.y).toBeCloseTo(46.95241, 4); // Latitude
      expect(result!.z).toBe(500); // Z coordinate should be unchanged
    });

    it('clears transformation attempts after successful transformation', () => {
      const point = { x: 2600000, y: 1200000 };
      
      // First transform should succeed
      const result1 = transformer.transform(point);
      expect(result1).toBeDefined();

      // Second transform of the same point should also succeed
      const result2 = transformer.transform(point);
      expect(result2).toBeDefined();

      // No warnings should be logged about excessive attempts
      expect(errorReporter.getWarnings()).toHaveLength(0);
    });
  });

  describe('transformBounds', () => {
    let transformer: CoordinateTransformer;

    beforeEach(() => {
      transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        proj4Instance
      );
    });

    it('transforms valid bounds', () => {
      const bounds = {
        minX: 2600000,
        minY: 1200000,
        maxX: 2600100,
        maxY: 1200100
      };

      const result = transformer.transformBounds(bounds);
      expect(result).toBeDefined();
      expect(result!.minX).toBeCloseTo(7.43958, 4);
      expect(result!.minY).toBeCloseTo(46.95241, 4);
      expect(result!.maxX).toBeGreaterThan(result!.minX);
      expect(result!.maxY).toBeGreaterThan(result!.minY);
    });

    it('handles invalid bounds', () => {
      const bounds = {
        minX: NaN,
        minY: 1200000,
        maxX: 2600100,
        maxY: 1200100
      };

      expect(() => {
        transformer.transformBounds(bounds);
      }).toThrow(CoordinateTransformationError);

      const errors = errorReporter.getErrors();
      expect(errors[0].message).toBe('Invalid bounds values');
      expect(errors[0].context).toEqual({
        bounds,
        fromSystem: COORDINATE_SYSTEMS.SWISS_LV95,
        toSystem: COORDINATE_SYSTEMS.WGS84
      });
    });

    it('validates transformed bounds', () => {
      const bounds = {
        minX: 2600000,
        minY: 1200000,
        maxX: 2600100,
        maxY: 1200100
      };

      // Mock proj4 to return invalid coordinates
      const mockProj4 = {
        defs: jest.fn(),
        Proj: jest.fn(),
        transform: jest.fn().mockReturnValue([NaN, NaN]),
      };

      const transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        mockProj4 as unknown as typeof proj4
      );

      expect(() => {
        transformer.transformBounds(bounds);
      }).toThrow(CoordinateTransformationError);

      const errors = errorReporter.getErrors();
      expect(errors[0].message).toBe('Transformation resulted in invalid bounds');
      expect(errors[0].context).toEqual({
        bounds,
        fromSystem: COORDINATE_SYSTEMS.SWISS_LV95,
        toSystem: COORDINATE_SYSTEMS.WGS84
      });
    });
  });
});
