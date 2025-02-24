import { GeoDataParser } from './base-parser';
import { ShapefileParser } from './shapefile-parser';
import { GeoJsonParser } from './geojson-parser';
import { FileTypeUtil } from '@/components/files/utils/file-types';

/**
 * Factory for creating appropriate parser instances based on file type
 */
export class ParserFactory {
  /**
   * Create a parser instance for the given file type
   */
  static createParser(fileName: string): GeoDataParser {
    const fileType = FileTypeUtil.getConfigForFile(fileName);
    if (!fileType) {
      throw new Error(`Unsupported file type: ${fileName}`);
    }

    switch (fileType.mainExtension.toLowerCase()) {
      case '.shp':
        return new ShapefileParser();
      case '.geojson':
        return new GeoJsonParser();
      default:
        throw new Error(`No parser available for file type: ${fileType.mainExtension}`);
    }
  }
} 