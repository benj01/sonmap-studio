import proj4 from 'proj4';
import { initializeCoordinateSystems, needsTransformation, toMapboxCoordinates } from '../utils/coordinate-systems';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { MockErrorReporter } from './test-utils';
import { Severity } from '../utils/errors';

describe('Coordinate Systems', () => {
  let errorReporter: MockErrorReporter;
  let proj4Instance: typeof proj4;

  beforeEach(() => {
    errorReporter = new MockErrorReporter();
    proj4Instance = proj4;
  });

  describe('initializeCoordinateSystems', () => {
    it('initializes coordinate systems successfully', () => {
      const result = initializeCoordinateSystems(proj4Instance, errorReporter);
      expect(result).toBe(true);
      expect(errorReporter.hasErrors()).toBe(false);

      // Verify Swiss LV95 is properly defined
      expect(proj4Instance.defs(COORDINATE_SYSTEMS.SWISS_LV95)).toBeDefined();
      
      // Verify Swiss LV03 is properly defined
      expect(proj4Instance.defs(COORDINATE_SYSTEMS.SWISS_LV03)).toBeDefined();
    });

    it('verifies transformations with test points', () => {
      const result = initializeCoordinateSystems(proj4Instance, errorReporter);
      expect(result).toBe(true);

      // Test transformation from LV95 to WGS84
      const transformer = proj4Instance(COORDINATE_SYSTEMS.SWISS_LV95, COORDINATE_SYSTEMS.WGS84);
      const [lon, lat] = transformer.forward([2600000, 1200000]);

      // Should be approximately the origin point of Swiss LV95
      expect(lon).toBeCloseTo(7.43958, 4);
      expect(lat).toBeCloseTo(46.95241, 4);
    });

    it('handles invalid proj4 instance', () => {
      const invalidProj4 = {} as typeof proj4;
      const result = initializeCoordinateSystems(invalidProj4, errorReporter);
      
      expect(result).toBe(false);
      expect(errorReporter.hasErrors()).toBe(true);
      
      const errors = errorReporter.getErrors();
      expect(errors[0].message).toBe('Failed to initialize coordinate systems');
      expect(errors[0].severity).toBe(Severity.ERROR);
    });

    it('handles transformation verification failure', () => {
      // Mock proj4 to return incorrect coordinates
      const mockProj4 = {
        defs: jest.fn(),
        forward: jest.fn().mockReturnValue([0, 0]),
      } as unknown as typeof proj4;

      const result = initializeCoordinateSystems(mockProj4, errorReporter);
      
      expect(result).toBe(false);
      expect(errorReporter.hasErrors()).toBe(true);
      
      const errors = errorReporter.getErrors();
      expect(errors[0].message).toBe('Failed to initialize coordinate systems');
      expect(errors[0].context).toEqual(expect.objectContaining({
        error: expect.stringContaining('Coordinate transformation verification failed')
      }));
    });
  });

  describe('needsTransformation', () => {
    it('returns true when systems are different', () => {
      expect(needsTransformation(COORDINATE_SYSTEMS.WGS84, COORDINATE_SYSTEMS.SWISS_LV95)).toBe(true);
      expect(needsTransformation(COORDINATE_SYSTEMS.SWISS_LV95, COORDINATE_SYSTEMS.SWISS_LV03)).toBe(true);
    });

    it('returns false when systems are the same', () => {
      expect(needsTransformation(COORDINATE_SYSTEMS.WGS84, COORDINATE_SYSTEMS.WGS84)).toBe(false);
      expect(needsTransformation(COORDINATE_SYSTEMS.SWISS_LV95, COORDINATE_SYSTEMS.SWISS_LV95)).toBe(false);
    });

    it('returns false when either system is NONE', () => {
      expect(needsTransformation(COORDINATE_SYSTEMS.NONE, COORDINATE_SYSTEMS.WGS84)).toBe(false);
      expect(needsTransformation(COORDINATE_SYSTEMS.WGS84, COORDINATE_SYSTEMS.NONE)).toBe(false);
      expect(needsTransformation(COORDINATE_SYSTEMS.NONE, COORDINATE_SYSTEMS.NONE)).toBe(false);
    });
  });

  describe('toMapboxCoordinates', () => {
    beforeEach(() => {
      // Initialize coordinate systems before each test
      initializeCoordinateSystems(proj4Instance, errorReporter);
    });

    it('returns original coordinates for WGS84', () => {
      const coord = { x: -73.935242, y: 40.730610 };
      const result = toMapboxCoordinates(coord, COORDINATE_SYSTEMS.WGS84, errorReporter, proj4Instance);
      expect(result).toEqual([coord.x, coord.y]);
    });

    it('returns original coordinates for NONE system', () => {
      const coord = { x: 100, y: 200 };
      const result = toMapboxCoordinates(coord, COORDINATE_SYSTEMS.NONE, errorReporter, proj4Instance);
      expect(result).toEqual([coord.x, coord.y]);
    });

    it('transforms Swiss LV95 coordinates to WGS84', () => {
      const coord = { x: 2600000, y: 1200000 }; // Origin of Swiss LV95
      const result = toMapboxCoordinates(coord, COORDINATE_SYSTEMS.SWISS_LV95, errorReporter, proj4Instance);
      
      expect(result).toBeDefined();
      expect(result![0]).toBeCloseTo(7.43958, 4); // Longitude
      expect(result![1]).toBeCloseTo(46.95241, 4); // Latitude
    });

    it('handles transformation errors', () => {
      const invalidCoord = { x: NaN, y: NaN };
      const result = toMapboxCoordinates(invalidCoord, COORDINATE_SYSTEMS.SWISS_LV95, errorReporter, proj4Instance);
      
      expect(result).toBeNull();
      expect(errorReporter.hasErrors()).toBe(true);
      
      const errors = errorReporter.getErrors();
      expect(errors[0].message).toContain('Failed to convert coordinates to Mapbox format');
      expect(errors[0].context).toEqual(expect.objectContaining({ coord: invalidCoord }));
    });
  });
});
