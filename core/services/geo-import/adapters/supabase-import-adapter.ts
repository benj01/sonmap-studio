import { SupabaseClient } from '@supabase/supabase-js';
import { LogManager } from '@/core/logging/log-manager';
import {
  ImportAdapter,
  ImportParams,
  ImportResult,
  StreamParams,
  ImportProgress
} from '../types/index';

const SOURCE = 'SupabaseImportAdapter';

export class SupabaseImportAdapter implements ImportAdapter {
  private logger = LogManager.getInstance();

  constructor(private supabase: SupabaseClient) {}

  private getImportId(params: ImportParams): string {
    return `${params.projectFileId}-${Date.now()}`;
  }

  async importFeatures(params: ImportParams): Promise<ImportResult> {
    const importId = this.getImportId(params);
    
    try {
      const { data: result, error } = await this.supabase.rpc(
        'import_geo_features_with_transform',
        {
          p_project_file_id: params.projectFileId,
          p_collection_name: params.collectionName,
          p_features: params.features,
          p_source_srid: params.sourceSrid,
          p_target_srid: params.targetSrid,
          p_height_attribute_key: params.heightAttributeKey,
          p_batch_size: params.batchSize
        }
      );

      if (error) {
        this.logger.error('Import RPC failed', SOURCE, error);
        throw error;
      }

      if (!result || !Array.isArray(result) || result.length === 0) {
        throw new Error('No results returned from import function');
      }

      // Aggregate results from all batches
      const aggregatedResult: ImportResult = {
        importId,
        importedCount: 0,
        failedCount: 0,
        debugInfo: {
          repairedCount: 0,
          cleanedCount: 0,
          skippedCount: 0,
          repairSummary: {},
          skippedSummary: {},
          notices: []
        }
      };

      for (const batchResult of result) {
        aggregatedResult.importedCount += batchResult.imported_count || 0;
        aggregatedResult.failedCount += batchResult.failed_count || 0;
        
        if (!aggregatedResult.collectionId && batchResult.collection_id) {
          aggregatedResult.collectionId = batchResult.collection_id;
        }
        if (!aggregatedResult.layerId && batchResult.layer_id) {
          aggregatedResult.layerId = batchResult.layer_id;
        }

        if (batchResult.debug_info) {
          const debug = aggregatedResult.debugInfo!;
          debug.repairedCount += batchResult.debug_info.repaired_count || 0;
          debug.cleanedCount += batchResult.debug_info.cleaned_count || 0;
          debug.skippedCount += batchResult.debug_info.skipped_count || 0;

          // Merge summaries
          if (batchResult.debug_info.repair_summary) {
            debug.repairSummary = {
              ...debug.repairSummary,
              ...batchResult.debug_info.repair_summary
            };
          }
          if (batchResult.debug_info.skipped_summary) {
            debug.skippedSummary = {
              ...debug.skippedSummary,
              ...batchResult.debug_info.skipped_summary
            };
          }

          // Collect notices
          if (batchResult.debug_info.notices) {
            debug.notices = debug.notices.concat(batchResult.debug_info.notices);
          }
        }
      }

      return aggregatedResult;
    } catch (error) {
      this.logger.error('Import failed', SOURCE, error);
      throw error;
    }
  }

  async streamFeatures(params: StreamParams): Promise<ReadableStream> {
    const importId = this.getImportId(params);
    const totalFeatures = params.features.length;
    const batchSize = params.batchSize || 100;
    const totalBatches = Math.ceil(totalFeatures / batchSize);
    const supabase = this.supabase;
    const logger = this.logger;
    
    // Add validation and early error handling
    if (!params.projectFileId) {
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Project file ID is required',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    
    if (!params.collectionName) {
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Collection name is required',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    
    if (!params.features || !Array.isArray(params.features) || params.features.length === 0) {
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Features array is required and must not be empty',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    
    if (!params.sourceSrid) {
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Source SRID is required',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    
    try {
      // Log setup information
      logger.debug('Setting up import stream', SOURCE, {
        importId,
        projectFileId: params.projectFileId,
        collectionName: params.collectionName,
        features: totalFeatures,
        batchSize,
        totalBatches,
        sourceSrid: params.sourceSrid,
        targetSrid: params.targetSrid
      });
      
      // Create the transform stream with improved error handling
      const stream = new TransformStream({
        async start(controller) {
          // Stream initialization code goes here if needed
          logger.debug('Stream started', SOURCE, { importId });
        },
        async transform(chunk, controller) {
          try {
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
              const start = batchIndex * batchSize;
              const end = Math.min(start + batchSize, totalFeatures);
              const batchFeatures = params.features.slice(start, end);

              logger.debug('Processing batch', SOURCE, {
                importId,
                batchIndex,
                start,
                end,
                featureCount: batchFeatures.length
              });

              const { data: result, error } = await supabase.rpc(
                'import_geo_features_with_transform',
                {
                  p_project_file_id: params.projectFileId,
                  p_collection_name: params.collectionName,
                  p_features: batchFeatures,
                  p_source_srid: params.sourceSrid,
                  p_target_srid: params.targetSrid,
                  p_height_attribute_key: params.heightAttributeKey,
                  p_batch_size: batchFeatures.length
                }
              );

              if (error) {
                logger.error('Batch import failed', SOURCE, {
                  importId,
                  batchIndex,
                  error: error.message,
                  details: error.details
                });

                // Retry with smaller batch if possible
                if (batchFeatures.length > 1) {
                  const midPoint = Math.floor(batchFeatures.length / 2);
                  const firstHalf = batchFeatures.slice(0, midPoint);
                  const secondHalf = batchFeatures.slice(midPoint);

                  logger.info('Retrying with smaller batches', SOURCE, {
                    importId,
                    batchIndex,
                    originalSize: batchFeatures.length,
                    newSize: midPoint
                  });

                  // Process each half
                  for (const subBatch of [firstHalf, secondHalf]) {
                    const { data: retryResult, error: retryError } = await supabase.rpc(
                      'import_geo_features_with_transform',
                      {
                        p_project_file_id: params.projectFileId,
                        p_collection_name: params.collectionName,
                        p_features: subBatch,
                        p_source_srid: params.sourceSrid,
                        p_target_srid: params.targetSrid,
                        p_height_attribute_key: params.heightAttributeKey,
                        p_batch_size: subBatch.length
                      }
                    );

                    if (retryError) {
                      logger.error('Retry failed', SOURCE, {
                        importId,
                        batchIndex,
                        error: retryError.message,
                        batchSize: subBatch.length
                      });
                    } else {
                      logger.info('Retry succeeded', SOURCE, {
                        importId,
                        batchIndex,
                        result: retryResult
                      });
                    }
                  }
                } else {
                  // Single feature failed, log and continue
                  logger.error('Single feature import failed', SOURCE, {
                    importId,
                    batchIndex,
                    featureId: batchFeatures[0].id
                  });
                }
              }

              if (!result || !Array.isArray(result) || result.length === 0) {
                const errorMessage = 'No results returned from import function';
                const errorDetails = {
                  message: errorMessage,
                  batchIndex: String(batchIndex),
                  start: String(start),
                  end: String(end),
                  phase: 'feature_import'
                };
                
                logger.error('Empty result in streamFeatures', SOURCE, {
                  error: errorMessage,
                  details: JSON.stringify(errorDetails),
                  importId
                });
                
                throw new Error(JSON.stringify({
                  type: 'ImportError',
                  message: errorMessage,
                  details: errorDetails
                }));
              }

              // Process batch results
              const batchResult = result[0];
              const progress: ImportProgress = {
                importId,
                imported: batchResult.imported_count || 0,
                failed: batchResult.failed_count || 0,
                total: totalFeatures,
                currentBatch: batchIndex + 1,
                totalBatches,
                collectionId: batchResult.collection_id,
                layerId: batchResult.layer_id,
                debugInfo: batchResult.debug_info
              };

              // Send progress event
              controller.enqueue(
                `data: ${JSON.stringify({
                  type: 'progress',
                  ...progress
                })}\n\n`
              );

              // Call progress callback if provided
              if (params.onProgress) {
                try {
                  await params.onProgress(progress);
                } catch (progressError) {
                  logger.error('Error in progress callback', SOURCE, {
                    error: progressError instanceof Error ? progressError.message : String(progressError),
                    batch: batchIndex
                  });
                  // Continue processing despite progress callback error
                }
              }

              // Add a small delay between batches
              if (batchIndex < totalBatches - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }

            // Send complete event
            const finalResult: ImportResult = {
              importId,
              importedCount: 0, // Aggregate from progress events
              failedCount: 0,
              collectionId: undefined,
              layerId: undefined
            };

            controller.enqueue(
              `data: ${JSON.stringify({
                type: 'complete',
                result: finalResult
              })}\n\n`
            );

            // Call complete callback if provided
            if (params.onComplete) {
              try {
                await params.onComplete(finalResult);
              } catch (completeError) {
                logger.error('Error in complete callback', SOURCE, {
                  error: completeError instanceof Error ? completeError.message : String(completeError)
                });
              }
            }
          } catch (error) {
            // Begin a completely rewritten error handling section
            let errorMessage = '';
            let errorDetails = {};
            
            // First, determine what kind of error we're dealing with
            if (error instanceof Error) {
              // For standard Error objects
              errorMessage = error.message;
              
              // Try to parse JSON error message
              if (error.message.startsWith('{') && error.message.endsWith('}')) {
                try {
                  const parsedError = JSON.parse(error.message);
                  errorMessage = parsedError.message || errorMessage;
                  errorDetails = parsedError.details || {};
                } catch {
                  // If parsing fails, use the original error message
                  errorDetails = {
                    name: error.name,
                    stack: error.stack ? error.stack.split("\n")[0] : undefined
                  };
                }
              } else {
                errorDetails = {
                  name: error.name,
                  stack: error.stack ? error.stack.split("\n")[0] : undefined
                };
              }
            } else if (typeof error === 'object' && error !== null) {
              // For non-Error objects, safely convert to string representation
              try {
                errorMessage = 'Non-standard error object';
                errorDetails = Object.entries(error).reduce((acc, [key, value]) => {
                  // Convert each property to a string to ensure serializability
                  try {
                    if (typeof value === 'object' && value !== null) {
                      acc[key] = JSON.stringify(value);
                    } else {
                      acc[key] = String(value);
                    }
                  } catch (e) {
                    acc[key] = `[Unserializable ${typeof value}]`;
                  }
                  return acc;
                }, {} as Record<string, string>);
              } catch (e) {
                errorMessage = 'Unserializable error object';
                errorDetails = { conversionError: String(e) };
              }
            } else {
              // For primitives or undefined/null
              errorMessage = String(error);
            }
            
            // Log with safe values
            logger.error('Stream import failed', SOURCE, {
              errorMessage,
              errorDetails: JSON.stringify(errorDetails)
            });
            
            // Create a serialized error for the callback
            const callbackError = new Error(JSON.stringify({
              type: 'ImportError',
              message: errorMessage,
              details: errorDetails
            }));
            
            // Call the error callback with the properly formatted error
            if (params.onError) {
              try {
                await params.onError(callbackError);
              } catch (callbackErr) {
                logger.error('Error in error callback', SOURCE, {
                  originalError: errorMessage,
                  callbackError: callbackErr instanceof Error ? callbackErr.message : String(callbackErr)
                });
              }
            }
            
            // Send error through the stream
            try {
              controller.enqueue(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: {
                    message: errorMessage,
                    code: 'STREAM_FEATURES_ERROR',
                    details: {
                      ...errorDetails,
                      timestamp: new Date().toISOString()
                    }
                  }
                })}\n\n`
              );
            } catch (streamError) {
              // If we can't serialize the error for the stream, send a fallback
              controller.enqueue(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: {
                    message: 'An error occurred but could not be fully serialized',
                    code: 'SERIALIZATION_ERROR',
                    details: { 
                      errorType: typeof error, 
                      timestamp: new Date().toISOString() 
                    }
                  }
                })}\n\n`
              );
            }
            
            // Signal stream error
            controller.error(callbackError);
          }
        }
      });

      return stream.readable;
    } catch (setupError) {
      // Handle errors that occur during stream setup
      let errorMessage = '';
      let errorDetails = {};
      
      // Enhanced error detail extraction
      if (setupError instanceof Error) {
        errorMessage = setupError.message;
        
        // Try to parse if it's already a JSON error
        if (setupError.message.startsWith('{') && setupError.message.endsWith('}')) {
          try {
            const parsedError = JSON.parse(setupError.message);
            errorMessage = parsedError.message || errorMessage;
            errorDetails = {
              ...parsedError.details,
              originalError: parsedError
            };
          } catch (parseError) {
            // If parsing fails, capture the original error details
            errorDetails = {
              name: setupError.name,
              stack: setupError.stack ? setupError.stack.split('\n')[0] : undefined,
              cause: setupError.cause ? String(setupError.cause) : undefined
            };
          }
        } else {
          // For non-JSON Error objects, capture all available properties
          errorDetails = {
            name: setupError.name,
            stack: setupError.stack ? setupError.stack.split('\n')[0] : undefined,
            cause: setupError.cause ? String(setupError.cause) : undefined
          };
          
          // Capture any enumerable properties from the error
          const errorProps = Object.getOwnPropertyNames(setupError).reduce((acc, prop) => {
            try {
              const value = (setupError as any)[prop];
              if (prop !== 'stack' && prop !== 'message') {
                acc[prop] = typeof value === 'object' ? JSON.stringify(value) : String(value);
              }
              return acc;
            } catch (e) {
              acc[prop] = '[Unserializable]';
              return acc;
            }
          }, {} as Record<string, string>);
          
          errorDetails = { ...errorDetails, ...errorProps };
        }
      } else if (typeof setupError === 'object' && setupError !== null) {
        // For non-Error objects, safely convert to string representation
        try {
          errorMessage = 'Non-standard error object during stream setup';
          errorDetails = Object.entries(setupError).reduce((acc, [key, value]) => {
            try {
              if (typeof value === 'object' && value !== null) {
                acc[key] = JSON.stringify(value);
              } else {
                acc[key] = String(value);
              }
            } catch (e) {
              acc[key] = `[Unserializable ${typeof value}]`;
            }
            return acc;
          }, {} as Record<string, string>);
        } catch (e) {
          errorMessage = 'Unserializable error object during stream setup';
          errorDetails = { conversionError: String(e) };
        }
      } else {
        // For primitives or undefined/null
        errorMessage = String(setupError);
      }

      // Enhanced logging with full context
      logger.error('Failed to set up import stream', SOURCE, {
        error: errorMessage,
        details: JSON.stringify(errorDetails),
        importId,
        context: {
          totalFeatures,
          batchSize,
          totalBatches,
          projectFileId: params.projectFileId,
          collectionName: params.collectionName
        }
      });
      
      // Format the error with enhanced details
      const formattedError = new Error(JSON.stringify({
        type: 'StreamSetupError',
        message: errorMessage,
        details: {
          ...errorDetails,
          importId,
          phase: 'stream_setup',
          timestamp: new Date().toISOString(),
          context: {
            totalFeatures,
            batchSize,
            totalBatches
          }
        }
      }));
      
      // Make sure callbacks are notified even if stream setup fails
      if (params.onError) {
        try {
          await params.onError(formattedError);
        } catch (callbackErr) {
          logger.error('Error in setup error callback', SOURCE, {
            originalError: errorMessage,
            errorDetails: JSON.stringify(errorDetails),
            callbackError: callbackErr instanceof Error ? callbackErr.message : String(callbackErr)
          });
        }
      }
      
      throw formattedError;
    }
  }
} 