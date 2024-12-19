import { MockErrorReporter } from './test-utils';
import {
  detectLV95Coordinates,
  detectLV03Coordinates,
  suggestCoordinateSystem
} from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { BaseCoordinate } from '../types/coordinates';
import { Severity, ErrorReport } from '../utils/errors';

describe('Coordinate System Detection', () => {
  let errorReporter: MockErrorReporter;

  beforeEach(() => {
    errorReporter = new MockErrorReporter();
  });

  describe('detectLV95Coordinates', () => {
    it('correctly identifies LV95 coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: 2600000, y: 1200000 }, // Origin of LV95
        { x: 2600100, y: 1200100 }, // Near origin
        { x: 2800000, y: 1600000 }, // Valid point in Switzerland
      ];

      const result = detectLV95Coordinates(points, errorReporter);
      expect(result).toBe(true);

      const infoReports = errorReporter.getReportsBySeverity(Severity.INFO);
      expect(infoReports[0].message).toBe('LV95 coordinate detection result');
      expect(infoReports[0].context).toEqual({
        result: true,
        validPoints: 3,
        lv95Points: 3,
        ratio: 1
      });
    });

    it('handles mixed coordinate systems', () => {
      const points: BaseCoordinate[] = [
        { x: 2600000, y: 1200000 }, // LV95
        { x: 7.45, y: 46.95 },      // WGS84
        { x: 2800000, y: 1600000 }, // LV95
      ];

      const result = detectLV95Coordinates(points, errorReporter);
      expect(result).toBe(false);

      const infoReports = errorReporter.getReportsBySeverity(Severity.INFO);
      const report = infoReports[0];
      expect(report).toBeDefined();
      expect(report.context).toBeDefined();
      expect((report.context as { ratio: number }).ratio).toBeLessThan(0.8);
    });

    it('handles empty input', () => {
      const result = detectLV95Coordinates([], errorReporter);
      expect(result).toBe(false);

      const warnings = errorReporter.getWarnings();
      expect(warnings[0].message).toBe('No points provided for LV95 detection');
    });

    it('handles invalid coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: NaN, y: 1200000 },
        { x: 2600000, y: NaN },
        { x: Infinity, y: 1200000 }
      ];

      const result = detectLV95Coordinates(points, errorReporter);
      expect(result).toBe(false);

      const warnings = errorReporter.getWarnings();
      expect(warnings[0].message).toBe('No valid points found for LV95 detection');
    });

    it('handles edge cases near LV95 bounds', () => {
      const points: BaseCoordinate[] = [
        { x: 1999999, y: 1200000 }, // Just below min x
        { x: 3000001, y: 1200000 }, // Just above max x
        { x: 2600000, y: 999999 },  // Just below min y
        { x: 2600000, y: 2000001 }  // Just above max y
      ];

      const result = detectLV95Coordinates(points, errorReporter);
      expect(result).toBe(false);
    });
  });

  describe('detectLV03Coordinates', () => {
    it('correctly identifies LV03 coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: 600000, y: 200000 }, // Valid point in Switzerland
        { x: 600100, y: 200100 }, // Near first point
        { x: 700000, y: 250000 }, // Another valid point
      ];

      const result = detectLV03Coordinates(points, errorReporter);
      expect(result).toBe(true);

      const infoReports = errorReporter.getReportsBySeverity(Severity.INFO);
      expect(infoReports[0].message).toBe('LV03 coordinate detection result');
      expect(infoReports[0].context).toEqual({
        result: true,
        validPoints: 3,
        lv03Points: 3,
        ratio: 1
      });
    });

    it('handles mixed coordinate systems', () => {
      const points: BaseCoordinate[] = [
        { x: 600000, y: 200000 }, // LV03
        { x: 7.45, y: 46.95 },    // WGS84
        { x: 600100, y: 200100 }, // LV03
      ];

      const result = detectLV03Coordinates(points, errorReporter);
      expect(result).toBe(false);

      const infoReports = errorReporter.getReportsBySeverity(Severity.INFO);
      const report = infoReports[0];
      expect(report).toBeDefined();
      expect(report.context).toBeDefined();
      expect((report.context as { ratio: number }).ratio).toBeLessThan(0.8);
    });

    it('handles edge cases near LV03 bounds', () => {
      const points: BaseCoordinate[] = [
        { x: 479999, y: 200000 }, // Just below min x
        { x: 850001, y: 200000 }, // Just above max x
        { x: 600000, y: 69999 },  // Just below min y
        { x: 600000, y: 310001 }  // Just above max y
      ];

      const result = detectLV03Coordinates(points, errorReporter);
      expect(result).toBe(false);
    });
  });

  describe('suggestCoordinateSystem', () => {
    it('suggests LV95 for valid LV95 coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: 2600000, y: 1200000 },
        { x: 2600100, y: 1200100 },
      ];

      const result = suggestCoordinateSystem(points, errorReporter);
      expect(result).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });

    it('suggests LV03 for valid LV03 coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: 600000, y: 200000 },
        { x: 600100, y: 200100 },
      ];

      const result = suggestCoordinateSystem(points, errorReporter);
      expect(result).toBe(COORDINATE_SYSTEMS.SWISS_LV03);
    });

    it('suggests WGS84 for valid WGS84 coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: 7.45892, y: 46.95127 },
        { x: 8.54226, y: 47.37174 },
      ];

      const result = suggestCoordinateSystem(points, errorReporter);
      expect(result).toBe(COORDINATE_SYSTEMS.WGS84);
    });

    it('handles integer WGS84 coordinates correctly', () => {
      const points: BaseCoordinate[] = [
        { x: 7, y: 47 }, // Integer values, but within WGS84 range
        { x: 8, y: 46 },
      ];

      const result = suggestCoordinateSystem(points, errorReporter);
      expect(result).toBe(COORDINATE_SYSTEMS.NONE); // Should not detect as WGS84 due to integer values
    });

    it('returns NONE for ambiguous coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: 2600000, y: 1200000 }, // LV95
        { x: 600000, y: 200000 },   // LV03
        { x: 7.45, y: 46.95 },      // WGS84
      ];

      const result = suggestCoordinateSystem(points, errorReporter);
      expect(result).toBe(COORDINATE_SYSTEMS.NONE);

      const warnings = errorReporter.getWarnings();
      expect(warnings[0].message).toBe('Could not determine coordinate system');
    });

    it('handles empty input', () => {
      const result = suggestCoordinateSystem([], errorReporter);
      expect(result).toBe(COORDINATE_SYSTEMS.NONE);

      const warnings = errorReporter.getWarnings();
      expect(warnings[0].message).toBe('No points provided for coordinate system detection');
    });

    it('handles invalid coordinates', () => {
      const points: BaseCoordinate[] = [
        { x: NaN, y: NaN },
        { x: Infinity, y: Infinity },
      ];

      const result = suggestCoordinateSystem(points, errorReporter);
      expect(result).toBe(COORDINATE_SYSTEMS.NONE);

      const warnings = errorReporter.getWarnings();
      expect(warnings[0].message).toBe('No valid points found for coordinate system detection');
    });
  });
});
