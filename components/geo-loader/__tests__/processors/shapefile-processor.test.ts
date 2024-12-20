import { ShapefileProcessor } from '../../processors/shapefile-processor';
import { ProcessorOptions } from '../../processors/base-processor';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { ValidationError, ParseError } from '../../utils/errors';
import { Feature, Geometry, Position, Point, LineString, Polygon } from 'geojson';
import { ShapefileHeader, SHAPE_TYPE } from '../../utils/shapefile-parser';

// Helper functions for type checking
function isPoint(geometry: Geometry): geometry is Point {
  return geometry.type === 'Point';
}

function isLineString(geometry: Geometry): geometry is LineString {
  return geometry.type === 'LineString';
}

function isPolygon(geometry: Geometry): geometry is Polygon {
  return geometry.type === 'Polygon';
}

describe('ShapefileProcessor', () => {
  let processor: ShapefileProcessor;
  
  beforeEach(() => {
    processor = new ShapefileProcessor();
  });

  describe('file type detection', () => {
    test('should detect shapefile files', async () => {
      expect(await processor.canProcess(new File([''], 'test.shp'))).toBe(true);
      expect(await processor.canProcess(new File([''], 'test.txt'))).toBe(false);
    });
  });

  describe('component validation', () => {
    test('should require DBF and SHX files', async () => {
      const shpFile = new File([''], 'test.shp');
      await expect(processor.analyze(shpFile)).rejects.toThrow(ValidationError);
      
      const shpWithComponents = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      await expect(processor.analyze(shpWithComponents)).resolves.toBeDefined();
    });

    test('should warn about missing optional PRJ file', async () => {
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      await processor.analyze(shpFile);
      const warnings = processor.getWarnings();
      expect(warnings.some(w => w.includes('.prj'))).toBe(true);
    });
  });

  describe('attribute data handling', () => {
    test('should import attributes when enabled', async () => {
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      processor = new ShapefileProcessor({ importAttributes: true });
      const result = await processor.process(shpFile);
      
      expect(result.statistics.errors).toHaveLength(0);
      expect(result.features.features[0].properties).toBeDefined();
    });

    test('should handle DBF read errors', async () => {
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File(['invalid'], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      processor = new ShapefileProcessor({ importAttributes: true });
      const result = await processor.process(shpFile);
      
      expect(result.statistics.errors.some(e => 
        e.type === 'dbf_read_error'
      )).toBe(true);
    });
  });

  describe('coordinate system handling', () => {
    test('should detect coordinate system from PRJ file', async () => {
      const prjContent = 'PROJCS["CH1903+ / LV95",GEOGCS["CH1903+",DATUM["CH1903+",SPHEROID["Bessel 1841",6377397.155,299.1528128,AUTHORITY["EPSG","7004"]],TOWGS84[674.374,15.056,405.346,0,0,0,0],AUTHORITY["EPSG","6150"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.01745329251994328,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4150"]],PROJECTION["Oblique_Mercator",AUTHORITY["EPSG","9815"]],PARAMETER["latitude_of_center",46.95240555555556],PARAMETER["longitude_of_center",7.439583333333333],PARAMETER["azimuth",90],PARAMETER["scale_factor",1],PARAMETER["false_easting",2600000],PARAMETER["false_northing",1200000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Y",EAST],AXIS["X",NORTH],AUTHORITY["EPSG","2056"]]';
      
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx'),
          '.prj': new File([prjContent], 'test.prj')
        }
      });
      
      const result = await processor.analyze(shpFile);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });

    test('should detect Swiss coordinates from values', async () => {
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      // Mock the parser to return Swiss coordinates
      jest.spyOn(processor['parser'], 'streamFeatures').mockImplementation(async function*() {
        yield {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [2600000, 1200000]
          },
          properties: {}
        };
      });
      
      const result = await processor.analyze(shpFile);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });

    test('should use provided coordinate system', async () => {
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      processor = new ShapefileProcessor({
        coordinateSystem: COORDINATE_SYSTEMS.SWISS_LV95
      });
      
      const result = await processor.process(shpFile);
      expect(result.coordinateSystem).toBe(COORDINATE_SYSTEMS.SWISS_LV95);
    });
  });

  describe('error handling', () => {
    test('should handle invalid shapefile header', async () => {
      const shpFile = Object.assign(new File(['invalid'], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      await expect(processor.analyze(shpFile)).rejects.toThrow(ValidationError);
    });

    test('should handle invalid bounds', async () => {
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      // Mock the parser to return invalid bounds
      const mockHeader: ShapefileHeader = {
        fileLength: 100,
        version: 1000,
        shapeType: SHAPE_TYPE.POINT,
        bounds: {
          xMin: NaN,
          yMin: NaN,
          xMax: Infinity,
          yMax: Infinity,
          zMin: NaN,
          zMax: Infinity,
          mMin: NaN,
          mMax: Infinity
        }
      };
      
      jest.spyOn(processor['parser'], 'readShapefileHeader').mockResolvedValue(mockHeader);
      await expect(processor.analyze(shpFile)).rejects.toThrow(ValidationError);
    });

    test('should handle empty shapefile', async () => {
      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      // Mock the parser to return no features
      jest.spyOn(processor['parser'], 'streamFeatures').mockImplementation(async function*() {
        // Empty generator
      });
      
      await expect(processor.process(shpFile)).rejects.toThrow(ValidationError);
    });
  });

  describe('progress reporting', () => {
    test('should report progress during processing', async () => {
      const onProgress = jest.fn();
      processor = new ShapefileProcessor({ onProgress });

      const shpFile = Object.assign(new File([''], 'test.shp'), {
        relatedFiles: {
          '.dbf': new File([''], 'test.dbf'),
          '.shx': new File([''], 'test.shx')
        }
      });
      
      // Mock the parser to return some features
      jest.spyOn(processor['parser'], 'streamFeatures').mockImplementation(async function*() {
        yield {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [1, 2]
          },
          properties: {}
        };
      });
      
      await processor.process(shpFile);
      
      expect(onProgress).toHaveBeenCalled();
      const progressValues = onProgress.mock.calls.map(call => call[0]);
      expect(Math.min(...progressValues)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...progressValues)).toBeLessThanOrEqual(1);
    });
  });
});
