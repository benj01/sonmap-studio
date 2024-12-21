import { ProcessorRegistry } from './base/registry';

// Import new processor implementations
import { CsvProcessor } from './implementations/csv/processor';
import { DxfProcessor } from './implementations/dxf/processor';
import { ShapefileProcessor } from './implementations/shapefile/processor';

// Register all processors
ProcessorRegistry.register('dxf', DxfProcessor);
ProcessorRegistry.register('csv', CsvProcessor);
ProcessorRegistry.register('xyz', CsvProcessor); // Support CSV variants
ProcessorRegistry.register('txt', CsvProcessor);
ProcessorRegistry.register('shp', ShapefileProcessor);

// Re-export everything for convenience
export * from './base/interfaces';
export * from './base/types';
export * from './base/registry';
export * from './implementations/csv/processor';
export * from './implementations/dxf/processor';
export * from './implementations/shapefile/processor';
