import { ProcessorRegistry } from './base/registry';

// Import new processor implementations
import { CsvProcessor } from './implementations/csv/processor';
import { DxfProcessor } from './implementations/dxf/dxf-processor';
import { ShapefileProcessor } from './implementations/shapefile/processor';

// Get registry instance
const registry = ProcessorRegistry.getInstance();

// Register all processors
registry.register('dxf', new DxfProcessor());
registry.register('csv', new CsvProcessor());
registry.register('xyz', new CsvProcessor()); // Support CSV variants
registry.register('txt', new CsvProcessor());
registry.register('shp', new ShapefileProcessor());

// Re-export everything for convenience
export * from './base/interfaces';
export * from './base/types';
export * from './base/registry';
export * from './implementations/csv/processor';
export * from './implementations/dxf/dxf-processor';
export * from './implementations/shapefile/processor';
