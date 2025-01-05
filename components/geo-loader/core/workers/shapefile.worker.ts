import { ShapefileParser } from '../processors/implementations/shapefile/parser';
import { ShapefileParseOptions } from '../processors/implementations/shapefile/types';
import { Feature } from 'geojson';

/**
 * Worker message types
 */
type WorkerMessage = {
  type: 'parse';
  file: ArrayBuffer;
  options: ShapefileParseOptions;
} | {
  type: 'analyze';
  file: ArrayBuffer;
  options: {
    previewRecords?: number;
    parseDbf?: boolean;
  };
};

/**
 * Handle incoming messages
 */
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const parser = new ShapefileParser();

  try {
    switch (e.data.type) {
      case 'parse': {
        const { file, options } = e.data;
        const features: Feature[] = [];
        
        // Process in chunks to avoid blocking
        const CHUNK_SIZE = 1000;
        let processed = 0;

        for await (const record of parser.streamRecords(file, options)) {
          features.push(parser.recordToFeature(record));
          processed++;

          // Send progress updates
          if (processed % CHUNK_SIZE === 0) {
            self.postMessage({
              type: 'progress',
              processed,
              total: parser.getRecordCount()
            });
          }
        }

        self.postMessage({
          type: 'complete',
          features
        });
        break;
      }

      case 'analyze': {
        const { file, options } = e.data;
        const result = await parser.analyzeStructure(file, options);
        self.postMessage({
          type: 'complete',
          result
        });
        break;
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error as any).toJSON?.()
      } : String(error)
    });
  }
};

// Prevent typescript error about self
export {};
