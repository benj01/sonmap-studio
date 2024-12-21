import { ProcessorOptions } from '../core/processors/base/types';

/**
 * Extended options for CSV/XYZ/TXT files
 */
export interface TextFileOptions extends ProcessorOptions {
  /** Field delimiter */
  delimiter?: string;
  /** Number of rows to skip */
  skipRows?: number;
  /** Number of columns to skip */
  skipColumns?: number;
  /** Point cloud simplification tolerance */
  simplificationTolerance?: number;
}

/**
 * Extended options for DXF files
 */
export interface DxfOptions extends ProcessorOptions {
  /** Layers to show in preview */
  visibleLayers?: string[];
}

/**
 * Combined format options
 */
export type FormatOptions = ProcessorOptions & TextFileOptions & DxfOptions;
