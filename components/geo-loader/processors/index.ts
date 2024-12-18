// Import ProcessorRegistry and all processors
import { ProcessorRegistry } from './base-processor';
import { DxfProcessor } from './dxf-processor';
import { CsvProcessor } from './csv-processor';
import { ShapefileProcessor } from './shapefile-processor';

// Register all processors
ProcessorRegistry.register('dxf', DxfProcessor);
ProcessorRegistry.register('csv', CsvProcessor);
ProcessorRegistry.register('xyz', CsvProcessor);
ProcessorRegistry.register('txt', CsvProcessor);
ProcessorRegistry.register('shp', ShapefileProcessor);

// Re-export everything for convenience
export * from './base-processor';
export * from './dxf-processor';
export * from './csv-processor';
export * from './shapefile-processor';
