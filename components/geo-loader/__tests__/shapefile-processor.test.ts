import { ShapefileProcessor } from '../processors/shapefile-processor';
import { createMockErrorReporter, createMockFile } from './test-utils';
import { ProcessorOptions } from '../processors/base-processor';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { ErrorReporter } from '../utils/errors';

describe('ShapefileProcessor', () => {
  let errorReporter: ErrorReporter;
  let processor: ShapefileProcessor;
  let options: ProcessorOptions;

  beforeEach(() => {
    errorReporter = createMockErrorReporter();
    options = {
      errorReporter,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84
    };
    processor = new ShapefileProcessor(options);
  });

  describe('canProcess', () => {
    it('should return true for .shp files', async () => {
      const file = createMockFile('test.shp', 'application/x-shapefile', '');
      const result = await processor.canProcess(file);
      expect(result).toBe(true);
    });

    it('should return false for non-shp files', async () => {
      const file = createMockFile('test.txt', 'text/plain', '');
      const result = await processor.canProcess(file);
      expect(result).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should report error for missing required components', async () => {
      const file = createMockFile('test.shp', 'application/x-shapefile', '');
      
      await expect(processor.analyze(file)).rejects.toThrow();
      
      const errors = (errorReporter as any).getReportsByType('MISSING_COMPONENTS');
      expect(errors.length).toBe(1);
      expect(errors[0].context).toHaveProperty('missingComponents');
      expect(errors[0].context.missingComponents).toContain('.dbf');
      expect(errors[0].context.missingComponents).toContain('.shx');
    });

    it('should report warning for missing optional components', async () => {
      const file = Object.assign(
        createMockFile('test.shp', 'application/x-shapefile', ''),
        {
          relatedFiles: {
            '.dbf': createMockFile('test.dbf', 'application/x-dbf', ''),
            '.shx': createMockFile('test.shx', 'application/x-shx', '')
          }
        }
      );
      
      try {
        await processor.analyze(file);
      } catch (error) {
        // Ignore other errors
      }
      
      const warnings = (errorReporter as any).getReportsByType('MISSING_OPTIONAL');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].context).toHaveProperty('component', '.prj');
      expect(warnings[0].context).toHaveProperty('impact');
    });

    it('should report coordinate system detection results', async () => {
      const file = Object.assign(
        createMockFile('test.shp', 'application/x-shapefile', ''),
        {
          relatedFiles: {
            '.dbf': createMockFile('test.dbf', 'application/x-dbf', ''),
            '.shx': createMockFile('test.shx', 'application/x-shx', ''),
            '.prj': createMockFile('test.prj', 'text/plain', 'PROJCS["CH1903+')
          }
        }
      );
      
      try {
        await processor.analyze(file);
      } catch (error) {
        // Ignore other errors
      }
      
      const info = (errorReporter as any).getReportsByType('COORDINATE_SYSTEM');
      expect(info.length).toBeGreaterThan(0);
      expect(info[0].context).toHaveProperty('system');
      expect(info[0].context).toHaveProperty('source', 'prj');
    });
  });

  describe('process', () => {
    it('should report error for failed DBF reading', async () => {
      const file = Object.assign(
        createMockFile('test.shp', 'application/x-shapefile', ''),
        {
          relatedFiles: {
            '.dbf': createMockFile('test.dbf', 'application/x-dbf', 'invalid'),
            '.shx': createMockFile('test.shx', 'application/x-shx', '')
          }
        }
      );
      
      options.importAttributes = true;
      
      try {
        await processor.process(file);
      } catch (error) {
        // Ignore other errors
      }
      
      const warnings = (errorReporter as any).getReportsByType('DBF_ERROR');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].context).toHaveProperty('error');
    });

    it('should report error for failed feature processing', async () => {
      const file = Object.assign(
        createMockFile('test.shp', 'application/x-shapefile', ''),
        {
          relatedFiles: {
            '.dbf': createMockFile('test.dbf', 'application/x-dbf', ''),
            '.shx': createMockFile('test.shx', 'application/x-shx', '')
          }
        }
      );
      
      // Mock the parser to return a feature that will fail processing
      jest.spyOn(processor['parser'], 'streamFeatures').mockImplementation(async function*() {
        yield {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [NaN, NaN]
          },
          properties: {}
        };
      });
      
      const result = await processor.process(file);
      
      const errors = (errorReporter as any).getReportsByType('FEATURE_ERROR');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].context).toHaveProperty('featureIndex', 0);
      expect(result.statistics.failedTransformations).toBeGreaterThan(0);
    });

    it('should track failed transformations in statistics', async () => {
      const file = Object.assign(
        createMockFile('test.shp', 'application/x-shapefile', ''),
        {
          relatedFiles: {
            '.dbf': createMockFile('test.dbf', 'application/x-dbf', ''),
            '.shx': createMockFile('test.shx', 'application/x-shx', '')
          }
        }
      );
      
      // Mock the parser to return both valid and invalid features
      jest.spyOn(processor['parser'], 'streamFeatures').mockImplementation(async function*() {
        yield {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [NaN, NaN]
          },
          properties: {}
        };
        yield {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [0, 0]
          },
          properties: {}
        };
      });
      
      const result = await processor.process(file);
      
      expect(result.statistics.failedTransformations).toBe(1);
      expect(result.statistics.featureCount).toBe(1);
    });
  });
});
