import { MockErrorReporter } from './test-utils';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { Severity } from '../utils/errors';
import proj4 from 'proj4';

describe('Coordinate Order Handling', () => {
  let errorReporter: MockErrorReporter;
  let proj4Instance: typeof proj4;

  beforeEach(() => {
    errorReporter = new MockErrorReporter();
    proj4Instance = proj4;

    // Initialize Swiss coordinate systems
    proj4Instance.defs(
      COORDINATE_SYSTEMS.SWISS_LV95,
      '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 ' +
      '+x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
    );
  });

  describe('Swiss LV95 to WGS84', () => {
    let transformer: CoordinateTransformer;

    beforeEach(() => {
      transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        proj4Instance
      );
    });

    it('correctly transforms coordinates from E,N to lon,lat', () => {
      // LV95 coordinates for Bern (E: 2600000, N: 1200000)
      const point = { x: 2600000, y: 1200000 };
      const result = transformer.transform(point);

      expect(result).toBeDefined();
      // Should be approximately lon: 7.4396, lat: 46.9524
      expect(result!.x).toBeCloseTo(7.4396, 4); // Longitude
      expect(result!.y).toBeCloseTo(46.9524, 4); // Latitude
    });

    it('maintains correct order when transforming multiple points', () => {
      const points = [
        { x: 2600000, y: 1200000 }, // Bern
        { x: 2683147, y: 1248127 }, // Zurich
        { x: 2537725, y: 1152548 }  // Geneva
      ];

      const results = points.map(p => transformer.transform(p));

      // Verify Bern coordinates
      expect(results[0]!.x).toBeCloseTo(7.4396, 4);  // Longitude
      expect(results[0]!.y).toBeCloseTo(46.9524, 4); // Latitude

      // Verify Zurich coordinates
      expect(results[1]!.x).toBeCloseTo(8.5500, 4);  // Longitude
      expect(results[1]!.y).toBeCloseTo(47.3667, 4); // Latitude

      // Verify Geneva coordinates
      expect(results[2]!.x).toBeCloseTo(6.1500, 4);  // Longitude
      expect(results[2]!.y).toBeCloseTo(46.2000, 4); // Latitude
    });

    it('handles edge cases near coordinate system boundaries', () => {
      // Test points near the edges of Switzerland
      const points = [
        { x: 2485000, y: 1070000 }, // Southwest corner
        { x: 2834000, y: 1296000 }, // Northeast corner
      ];

      const results = points.map(p => transformer.transform(p));

      // All results should be valid coordinates
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result!.x).toBeGreaterThanOrEqual(-180); // Valid longitude range
        expect(result!.x).toBeLessThanOrEqual(180);
        expect(result!.y).toBeGreaterThanOrEqual(-90);  // Valid latitude range
        expect(result!.y).toBeLessThanOrEqual(90);
      });
    });
  });

  describe('WGS84 to Swiss LV95', () => {
    let transformer: CoordinateTransformer;

    beforeEach(() => {
      transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.WGS84,
        COORDINATE_SYSTEMS.SWISS_LV95,
        errorReporter,
        proj4Instance
      );
    });

    it('correctly transforms coordinates from lon,lat to E,N', () => {
      // WGS84 coordinates for Bern (lon: 7.4396, lat: 46.9524)
      const point = { x: 7.4396, y: 46.9524 };
      const result = transformer.transform(point);

      expect(result).toBeDefined();
      // Should be approximately E: 2600000, N: 1200000
      expect(result!.x).toBeCloseTo(2600000, 0); // Easting
      expect(result!.y).toBeCloseTo(1200000, 0); // Northing
    });

    it('maintains correct order in round-trip transformations', () => {
      // Create both transformers for round-trip
      const toWgs84 = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        proj4Instance
      );
      const toLv95 = new CoordinateTransformer(
        COORDINATE_SYSTEMS.WGS84,
        COORDINATE_SYSTEMS.SWISS_LV95,
        errorReporter,
        proj4Instance
      );

      // Original LV95 coordinates
      const original = { x: 2600000, y: 1200000 };

      // Transform to WGS84
      const wgs84 = toWgs84.transform(original);
      expect(wgs84).toBeDefined();

      // Transform back to LV95
      const roundTrip = toLv95.transform(wgs84!);
      expect(roundTrip).toBeDefined();

      // Should match original coordinates within reasonable tolerance
      expect(roundTrip!.x).toBeCloseTo(original.x, 0);
      expect(roundTrip!.y).toBeCloseTo(original.y, 0);
    });

    it('handles invalid WGS84 coordinates gracefully', () => {
      const invalidPoints = [
        { x: -180.1, y: 46.9524 }, // Invalid longitude
        { x: 7.4396, y: 90.1 },    // Invalid latitude
        { x: NaN, y: 46.9524 },    // NaN coordinate
        { x: 7.4396, y: Infinity } // Infinite coordinate
      ];

      invalidPoints.forEach(point => {
        expect(() => transformer.transform(point)).toThrow();
        
        const errors = errorReporter.getErrors();
        expect(errors[errors.length - 1].message).toContain('Invalid coordinate');
      });
    });
  });

  describe('Coordinate Order Validation', () => {
    it('validates coordinate order before transformation', () => {
      const transformer = new CoordinateTransformer(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        errorReporter,
        proj4Instance
      );

      // Try to transform with swapped coordinates (N,E instead of E,N)
      const swappedPoint = { x: 1200000, y: 2600000 }; // Swapped Bern coordinates
      const result = transformer.transform(swappedPoint);

      // The result should be obviously invalid (outside Switzerland)
      expect(result).toBeDefined();
      expect(result!.x < -180 || result!.x > 180 || result!.y < -90 || result!.y > 90).toBe(true);

      // Should have logged a warning about potentially swapped coordinates
      const warnings = errorReporter.getWarnings();
      expect(warnings.some(w => 
        w.message.includes('coordinate order') || 
        w.message.includes('invalid range')
      )).toBe(true);
    });
  });
});
