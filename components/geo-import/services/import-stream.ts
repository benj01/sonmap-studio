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
  onNotice?: (level: string, message: string, details: any) => void;
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
    layerId: '',
    notices: [],
    featureErrors: []
  };

  try {
    logger.info('Starting stream processing');
    while (true) {
      let readResult;
      try {
        logger.debug('Attempting to read from stream');
        readResult = await reader.read();
        
        logger.debug('Stream read operation', {
          done: readResult.done,
          hasValue: !!readResult.value,
          valueSize: readResult.value ? readResult.value.length : 0,
          importCompleted,
          totalEventsReceived: allEvents.length,
          lastEventType: allEvents.length > 0 ? allEvents[allEvents.length - 1].type : null
        });
        
        if (readResult.done || !readResult.value) {
          logger.info('Stream complete or cancelled', { 
            importResults,
            totalEventsReceived: allEvents.length,
            eventTypes: allEvents.map(e => e.type),
            importCompleted,
            lastEvent: allEvents.length > 0 ? allEvents[allEvents.length - 1] : null,
            hasCompletionEvent: allEvents.some(e => e.type === 'import_complete')
          });
          break;
        }

        const chunk = decoder.decode(readResult.value);
        const lines = chunk.split('\n\n');
        
        logger.debug('Processing chunk', {
          chunkSize: chunk.length,
          lineCount: lines.length,
          firstLine: lines[0]?.substring(0, 100)
        });
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          const eventLine = line.split('\n').find(l => l.startsWith('data: '));
          if (!eventLine) {
            logger.debug('Skipping non-event line', { line: line.substring(0, 100) });
            continue;
          }
          
          try {
            const eventData = JSON.parse(eventLine.slice(6));
            allEvents.push(eventData);
            
            logger.debug('Received event', {
              type: eventData.type,
              totalEvents: allEvents.length,
              importCompleted
            });
            
            switch (eventData.type) {
              case 'notice':
                importResults.notices.push({
                  level: eventData.level,
                  message: eventData.message,
                  details: eventData.details
                });

                switch (eventData.level) {
                  case 'warning':
                    logger.warn(eventData.message, eventData.details);
                    break;
                  case 'error':
                    logger.error(eventData.message, eventData.details);
                    break;
                  default:
                    logger.info(eventData.message, eventData.details);
                }

                if (options.onNotice) {
                  options.onNotice(eventData.level, eventData.message, eventData.details);
                }

                if (options.onProgress && eventData.details?.currentImported !== undefined) {
                  const total = eventData.details.currentImported + eventData.details.currentFailed;
                  const progress = total > 0 ? (eventData.details.currentImported / total * 100) : 0;
                  options.onProgress(progress, eventData.message);
                }
                break;

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
                logger.info('Received import_complete event', { 
                  eventData,
                  totalEventsReceived: allEvents.length,
                  previousEvent: allEvents.length > 1 ? allEvents[allEvents.length - 2].type : null
                });
                importCompleted = true;
                
                if (eventData.finalStats) {
                  logger.debug('Updating final stats', {
                    current: {
                      totalImported: importResults.totalImported,
                      totalFailed: importResults.totalFailed,
                      collectionId: importResults.collectionId,
                      layerId: importResults.layerId
                    },
                    new: eventData.finalStats
                  });
                  
                  if (eventData.finalStats.totalImported !== undefined) {
                    importResults.totalImported = eventData.finalStats.totalImported;
                  }
                  if (eventData.finalStats.totalFailed !== undefined) {
                    importResults.totalFailed = eventData.finalStats.totalFailed;
                  }
                  if (eventData.finalStats.collectionId) {
                    importResults.collectionId = eventData.finalStats.collectionId;
                  }
                  if (eventData.finalStats.layerId) {
                    importResults.layerId = eventData.finalStats.layerId;
                  }
                }

                if (options.onProgress) {
                  options.onProgress(100, `Import complete. Imported ${importResults.totalImported} features.`);
                }

                if (options.onComplete) {
                  logger.debug('Calling onComplete callback', { importResults });
                  options.onComplete(importResults);
                }
                break;

              case 'error':
                logger.error('Received error event', eventData);
                throw new Error(eventData.message || 'Unknown import error');
                
              case 'feature_errors':
                if (eventData.errors) {
                  logger.warn('Feature processing errors', { errors: eventData.errors });
                  importResults.featureErrors = (importResults.featureErrors || []).concat(eventData.errors);
                }
                break;
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