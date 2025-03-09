import { LogManager } from '@/core/logging/log-manager';
import { ImportResult } from '../types';

const SOURCE = 'ImportStreamService';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

interface StreamProcessingOptions {
  onProgress?: (progress: number, message: string) => void;
  onComplete?: (results: ImportResult) => void;
}

export async function processImportStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: StreamProcessingOptions = {}
): Promise<ImportResult> {
  const decoder = new TextDecoder();
  const allEvents: Array<{type: string; [key: string]: any}> = [];
  let importCompleted = false;
  const importResults: ImportResult = {
    totalImported: 0,
    totalFailed: 0,
    collectionId: '',
    layerId: ''
  };

  try {
    logger.info('Starting stream processing');
    while (true) {
      let readResult;
      try {
        readResult = await reader.read();
        
        logger.debug('Stream read operation', {
          done: readResult.done,
          hasValue: !!readResult.value,
          valueSize: readResult.value ? readResult.value.length : 0,
          importCompleted
        });
        
        if (readResult.done || !readResult.value) {
          logger.info('Stream complete or cancelled', { 
            importResults,
            totalEventsReceived: allEvents.length,
            eventTypes: allEvents.map(e => e.type),
            importCompleted
          });
          break;
        }

        const chunk = decoder.decode(readResult.value);
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          const eventLine = line.split('\n').find(l => l.startsWith('data: '));
          if (!eventLine) continue;
          
          try {
            const eventData = JSON.parse(eventLine.slice(6));
            allEvents.push(eventData);
            
            switch (eventData.type) {
              case 'batch_complete':
                importResults.totalImported += eventData.importedCount;
                importResults.totalFailed += eventData.failedCount;
                importResults.collectionId = eventData.collectionId;
                importResults.layerId = eventData.layerId;
                
                if (options.onProgress) {
                  const progress = Math.round((eventData.batchIndex + 1) * 100 / eventData.totalBatches);
                  const message = `Imported ${importResults.totalImported} features (${progress}%)`;
                  options.onProgress(progress, message);
                }
                break;
                
              case 'import_complete':
                logger.info('Received import_complete event', { eventData });
                
                if (eventData.finalStats) {
                  if (eventData.finalStats.totalImported !== undefined) {
                    importResults.totalImported = eventData.finalStats.totalImported;
                  }
                  if (eventData.finalStats.totalFailed !== undefined) {
                    importResults.totalFailed = eventData.finalStats.totalFailed;
                  }
                }

                // Add browser console logging for import completion
                console.log('✨ Import stream processing complete:', {
                  totalImported: importResults.totalImported,
                  totalFailed: importResults.totalFailed,
                  collectionId: importResults.collectionId,
                  layerId: importResults.layerId,
                  timestamp: new Date().toISOString()
                });

                importCompleted = true;
                if (options.onComplete) {
                  options.onComplete(importResults);
                }
                break;
                
              case 'notice':
                logger.info(`Import ${eventData.level}:`, eventData.message);
                // Also log to browser console with appropriate icon
                const icon = eventData.level === 'info' ? 'ℹ️' : 
                           eventData.level === 'warning' ? '⚠️' : 
                           eventData.level === 'error' ? '❌' : '📝';
                console.log(`${icon} ${eventData.message}`, eventData.details);
                break;
                
              case 'feature_errors':
                logger.warn('Feature import failures:', {
                  errors: eventData.errors,
                  batchInfo: {
                    currentImported: importResults.totalImported,
                    currentFailed: importResults.totalFailed
                  }
                });
                break;
                
              case 'error':
                throw new Error(eventData.message);
            }
          } catch (parseError) {
            logger.error('Error parsing event data', {
              error: parseError instanceof Error ? parseError.message : String(parseError),
              line: eventLine.substring(0, 100)
            });
            throw parseError;
          }
        }
      } catch (streamError) {
        logger.error('Error in stream reading process', {
          error: streamError instanceof Error ? streamError.message : String(streamError)
        });
        throw streamError;
      }
    }
  } finally {
    reader.releaseLock();
    logger.info('Stream reader released', {
      totalEvents: allEvents.length,
      importCompleted
    });
  }

  if (!importCompleted) {
    throw new Error('Import did not complete successfully - no completion event received');
  }

  return importResults;
} 