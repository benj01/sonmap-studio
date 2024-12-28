// Main processor
export { DxfProcessor } from './dxf-processor';

// Types
export * from './types';

// Modules
export { DxfAnalyzer } from './modules/analyzer';
export { DxfTransformer } from './modules/transformer';
export { DxfEntityProcessor } from './modules/entity-processor';
export { DxfLayerProcessor } from './modules/layer-processor';

// Parser
export { DxfParserWrapper } from './parsers/dxf-parser-wrapper';

/**
 * DXF Processing Module
 * 
 * This module provides functionality for processing DXF (Drawing Exchange Format) files.
 * It includes:
 * 
 * - DxfProcessor: Main processor class for handling DXF files
 * - DxfAnalyzer: Handles coordinate system detection and bounds calculation
 * - DxfTransformer: Handles coordinate transformations between different systems
 * - DxfEntityProcessor: Handles entity validation and conversion to GeoJSON
 * - DxfLayerProcessor: Handles layer management and validation
 * - DxfParserWrapper: Wraps the dxf-parser library for compatibility
 * 
 * The processing is split into several focused modules to improve maintainability
 * and make the code easier to understand and modify.
 * 
 * Usage:
 * ```typescript
 * const processor = new DxfProcessor();
 * const result = await processor.analyze(file);
 * ```
 */
