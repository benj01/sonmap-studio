'use client';

import { dbLogger } from '@/utils/logging/dbLogger';
import { processStoredLv95Coordinates } from '@/core/utils/coordinates';
import type { Feature, FeatureCollection, Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon } from 'geojson';
import { summarizeFeaturesForLogging } from '../utils/logging';

const LOG_SOURCE = 'HeightTransformBatchService';

export interface BatchProgressCallback {
  (progress: BatchProgress): Promise<void>;
}

export interface BatchProgress {
  layerId: string;
  batchId: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed' | 'cancelled';
  totalFeatures: number;
  processedFeatures: number;
  failedFeatures: number;
  percentComplete: number;
  currentChunk: number;
  totalChunks: number;
  errorMessage?: string;
}

export interface BatchProcessOptions {
  chunkSize?: number;
  maxRetries?: number;
  pollingInterval?: number;
  cancelToken?: AbortSignal;
  swissTransformation?: {
    method: 'api' | 'delta';
    deltaThreshold?: number;
  };
}

export interface TransformationResult {
  success: boolean;
  error?: string;
  feature?: Feature;
}

export type HeightTransformationGeometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon;

export interface HeightTransformationFeature extends Feature<HeightTransformationGeometry> {
  properties: {
    height_mode?: string;
    base_elevation_ellipsoidal?: number;
    lv95_easting?: number;
    lv95_northing?: number;
    lv95_height?: number;
    [key: string]: unknown;
  };
}

/**
 * Manages batch processing of height transformations for large feature collections
 */
export class HeightTransformBatchService {
  private static instance: HeightTransformBatchService;
  private activeBatches: Map<string, BatchProgress> = new Map();
  private progressCallbacks: Map<string, BatchProgressCallback[]> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  
  private constructor() {}
  
  /**
   * Gets the singleton instance of the batch service
   */
  public static getInstance(): HeightTransformBatchService {
    if (!HeightTransformBatchService.instance) {
      HeightTransformBatchService.instance = new HeightTransformBatchService();
    }
    return HeightTransformBatchService.instance;
  }
  
  /**
   * Initializes a height transformation batch
   */
  public async initializeBatch(
    layerId: string,
    heightSourceType: 'z_coord' | 'attribute' | 'none',
    heightSourceAttribute?: string,
    featureCollection?: FeatureCollection<HeightTransformationGeometry>
  ): Promise<string | 'NO_FEATURES' | null> {
    const context = {
      source: LOG_SOURCE,
      batchTraceId: `batch_init_${Date.now()}`,
      layerId,
      heightSourceType,
      heightSourceAttribute,
      hasFeatureCollection: !!featureCollection,
      ...(featureCollection && featureCollection.features ? { summary: summarizeFeaturesForLogging(featureCollection.features, 'info') } : {})
    };

    try {
      await dbLogger.info('Initializing height transformation batch', context);
      
      // Skip initialization for 'none' height source type as it doesn't require processing
      if (heightSourceType === 'none') {
        await dbLogger.info('Skipping batch initialization for "none" height source type', context);
        return null;
      }
      
      // Log API call attempt
      await dbLogger.info('Calling height transformation initialization API', {
        ...context,
        endpoint: '/api/height-transformation/initialize',
        requestBody: {
          layerId,
          heightSourceType,
          heightSourceAttribute,
          hasFeatureCollection: !!featureCollection
        }
      });
      
      // Prepare the request body
      const requestBody = {
        layerId,
        heightSourceType,
        heightSourceAttribute,
        ...(featureCollection && { featureCollection })
      };
      
      const response = await fetch('/api/height-transformation/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      // Log API response status
      await dbLogger.info('Received initialization API response', {
        ...context,
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        await dbLogger.error('Failed to initialize batch', { 
          ...context,
          status: response.status,
          error: errorText
        });
        
        // Handle specific error cases
        if (response.status === 404) {
          // Call the diagnostic endpoint for more information
          try {
            await dbLogger.info('Calling diagnostic endpoint for feature counts', {
              ...context,
              endpoint: `/api/height-transformation/feature-counts?layerId=${layerId}`
            });
            
            const diagResponse = await fetch(`/api/height-transformation/feature-counts?layerId=${layerId}`);
            
            if (diagResponse.ok) {
              const diagData = await diagResponse.json();
              await dbLogger.info('Feature counts diagnostic information', {
                ...context,
                diagData
              });
              
              // Log specific counts for Swiss coordinates features
              if (diagData.height_mode_counts) {
                await dbLogger.info('Swiss coordinates feature counts', {
                  ...context,
                  total_features: diagData.total_features,
                  lv95_stored_features: diagData.lv95_stored_features,
                  height_mode_counts: diagData.height_mode_counts
                });
              }
            } else {
              await dbLogger.warn('Failed to get diagnostic information', {
                ...context,
                status: diagResponse.status,
                statusText: diagResponse.statusText
              });
            }
          } catch (diagError) {
            await dbLogger.error('Error calling diagnostic endpoint', { 
              ...context,
              error: diagError instanceof Error ? {
                message: diagError.message,
                stack: diagError.stack,
                name: diagError.name
              } : diagError
            });
          }
          
          await dbLogger.warn('No features found in layer, skipping transformation', { 
            ...context,
            layerId 
          });
          // Return a special flag to indicate no features instead of null (error)
          return 'NO_FEATURES';
        }
        
        // Handle other error cases
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error && errorData.error.includes('No features found')) {
            await dbLogger.warn('No features found in layer, skipping transformation', { 
              ...context,
              errorMessage: errorData.error
            });
            // Return a special flag to indicate no features instead of null (error)
            return 'NO_FEATURES';
          }
        } catch (parseError) {
          // Not JSON or other parsing error, continue with normal error handling
          await dbLogger.warn('Could not parse error response', {
            ...context,
            errorText,
            parseError
          });
        }
        
        return null;
      }
      
      const data = await response.json();
      
      if (!data.success || !data.batchId) {
        await dbLogger.error('Invalid response from batch initialization', { 
          ...context,
          data 
        });
        return null;
      }
      
      const batchId = data.batchId;
      
      // Initialize progress tracking
      this.activeBatches.set(batchId, {
        layerId,
        batchId,
        status: 'pending',
        totalFeatures: 0,
        processedFeatures: 0,
        failedFeatures: 0,
        percentComplete: 0,
        currentChunk: 0,
        totalChunks: 0
      });
      
      await dbLogger.info('Batch initialized successfully', { 
        ...context,
        batchId, 
        layerId 
      });
      return batchId;
    } catch (error) {
      await dbLogger.error('Error initializing batch', { 
        ...context,
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : error
      });
      return null;
    }
  }
  
  /**
   * Starts processing a batch
   * 
   * @param batchId The ID of the batch to process
   * @param featureCollection The feature collection to process
   * @param options Processing options
   * @returns True if processing started successfully
   */
  public async startBatchProcessing(
    batchId: string, 
    featureCollection: FeatureCollection,
    options: BatchProcessOptions = {}
  ): Promise<boolean> {
    const context = {
      source: LOG_SOURCE,
      batchId,
      layerId: featureCollection.features[0]?.properties?.layer_id || 'unknown'
    };

    // Validate batch ID is a valid UUID (not 'NO_FEATURES' or other special string)
    if (typeof batchId !== 'string' || batchId.length !== 36) {
      await dbLogger.error('Invalid batch ID format', context);
      return false;
    }
    
    const batch = this.activeBatches.get(batchId);
    if (!batch) {
      await dbLogger.error('Batch not found', context);
      return false;
    }

    try {
      const features = featureCollection.features;
      const totalFeatures = features.length;

      if (totalFeatures === 0) {
        await dbLogger.warn('No features to process', context);
        await this.updateBatchProgress(batchId, {
          status: 'complete',
          totalFeatures: 0,
          processedFeatures: 0,
          failedFeatures: 0,
          percentComplete: 100
        });
        return true;
      }

      const chunkSize = options.chunkSize || 100;
      const maxRetries = options.maxRetries || 3;
      const pollingInterval = options.pollingInterval || 1000;
      const abortController = new AbortController();
      this.abortControllers.set(batchId, abortController);

      await this.updateBatchProgress(batchId, {
        status: 'in_progress',
        totalFeatures,
        processedFeatures: 0,
        failedFeatures: 0,
        percentComplete: 0,
        currentChunk: 0,
        totalChunks: Math.ceil(totalFeatures / chunkSize)
      });

      await this.processFeatureChunks(
        batchId,
        features,
        chunkSize,
        maxRetries,
        pollingInterval,
        abortController.signal,
        options
      );

      return true;
    } catch (error) {
      await dbLogger.error('Error starting batch processing', {
        ...context,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });

      await this.updateBatchProgress(batchId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });

      return false;
    }
  }
  
  /**
   * Process feature chunks asynchronously
   */
  private async processFeatureChunks(
    batchId: string,
    features: Feature[],
    chunkSize: number,
    maxRetries: number,
    pollingInterval: number,
    abortSignal: AbortSignal,
    options: BatchProcessOptions
  ): Promise<void> {
    const batch = this.activeBatches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const baseContext = {
      source: LOG_SOURCE,
      batchId,
      layerId: batch.layerId
    };

    try {
      // Check if processing was cancelled
      if (abortSignal.aborted) {
        await dbLogger.info('Batch processing cancelled', baseContext);
        await this.updateBatchProgress(batchId, {
          status: 'cancelled'
        });
        return;
      }

      const chunks = this.chunkArray(features, chunkSize);
      let processedFeatures = 0;
      let failedFeatures = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkContext = {
          ...baseContext,
          chunkIndex: i,
          chunkSize: chunk.length
        };

        try {
          await dbLogger.debug('Processing chunk', chunkContext);

          const results = await Promise.all(
            chunk.map(async (feature) => {
              try {
                const transformedFeature = await processStoredLv95Coordinates(feature, {
                  transformationMethod: options.swissTransformation?.method || 'api',
                  cacheResults: true
                });

                return {
                  success: true,
                  feature: transformedFeature
                } as TransformationResult;
              } catch (error) {
                await dbLogger.error('Error transforming feature', {
                  ...chunkContext,
                  featureId: feature.id,
                  error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                  } : error
                });

                return {
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error'
                } as TransformationResult;
              }
            })
          );

          const chunkStats = results.reduce(
            (stats, result) => {
              if (result.success) {
                stats.succeeded++;
              } else {
                stats.failed++;
              }
              return stats;
            },
            { succeeded: 0, failed: 0 }
          );

          processedFeatures += chunkStats.succeeded;
          failedFeatures += chunkStats.failed;

          await this.updateBatchProgress(batchId, {
            processedFeatures,
            failedFeatures,
            percentComplete: Math.round((processedFeatures + failedFeatures) / features.length * 100),
            currentChunk: i + 1
          });

          // Check for cancellation after each chunk
          if (abortSignal.aborted) {
            await dbLogger.info('Batch processing cancelled during chunk processing', chunkContext);
            await this.updateBatchProgress(batchId, {
              status: 'cancelled'
            });
            return;
          }

          // Add delay between chunks to prevent overwhelming the API
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
          }
        } catch (error) {
          await dbLogger.error('Error processing chunk', {
            ...chunkContext,
            error: error instanceof Error ? {
              message: error.message,
              stack: error.stack,
              name: error.name
            } : error
          });

          failedFeatures += chunk.length;
          await this.updateBatchProgress(batchId, {
            failedFeatures,
            percentComplete: Math.round((processedFeatures + failedFeatures) / features.length * 100),
            currentChunk: i + 1
          });
        }
      }

      await this.updateBatchProgress(batchId, {
        status: failedFeatures === 0 ? 'complete' : 'failed',
        errorMessage: failedFeatures > 0 ? `Failed to process ${failedFeatures} features` : undefined
      });
    } catch (error) {
      await dbLogger.error('Error in batch processing', {
        ...baseContext,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });

      await this.updateBatchProgress(batchId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  /**
   * Update the progress of a batch and notify callbacks
   */
  private async updateBatchProgress(batchId: string, updates: Partial<BatchProgress>): Promise<void> {
    const currentProgress = this.activeBatches.get(batchId);
    if (!currentProgress) {
      return;
    }

    const updatedProgress: BatchProgress = {
      ...currentProgress,
      ...updates
    };

    this.activeBatches.set(batchId, updatedProgress);

    // Notify all registered callbacks
    const callbacks = this.progressCallbacks.get(batchId) || [];
    await Promise.all(callbacks.map(async (callback) => {
      try {
        await callback(updatedProgress);
      } catch (error) {
        await dbLogger.error('Error in progress callback', {
          source: LOG_SOURCE,
          batchId,
          layerId: currentProgress.layerId,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        });
      }
    }));
  }
  
  /**
   * Registers a callback to receive progress updates for a batch
   */
  public async registerProgressCallback(batchId: string, callback: BatchProgressCallback): Promise<void> {
    const callbacks = this.progressCallbacks.get(batchId) || [];
    callbacks.push(callback);
    this.progressCallbacks.set(batchId, callbacks);
  }
  
  /**
   * Unregisters a callback from receiving progress updates for a batch
   */
  public async unregisterProgressCallback(batchId: string, callback: BatchProgressCallback): Promise<void> {
    const callbacks = this.progressCallbacks.get(batchId) || [];
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
      this.progressCallbacks.set(batchId, callbacks);
    }
  }
  
  /**
   * Attempts to cancel an active batch process
   */
  public async cancelBatchProcessing(batchId: string): Promise<void> {
    const context = {
      source: LOG_SOURCE,
      batchId
    };

    try {
      const abortController = this.abortControllers.get(batchId);
      if (abortController) {
        abortController.abort();
        this.abortControllers.delete(batchId);
        await dbLogger.info('Batch processing cancellation requested', context);
      } else {
        await dbLogger.warn('No active abort controller found for batch', context);
      }
    } catch (error) {
      await dbLogger.error('Error cancelling batch processing', {
        ...context,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });
    }
  }
  
  /**
   * Gets the current progress of a batch
   * 
   * @param batchId The batch ID to check
   * @returns The current batch progress or null if batch not found
   */
  public getBatchProgress(batchId: string): BatchProgress | null {
    return this.activeBatches.get(batchId) || null;
  }
  
  /**
   * Gets all active batches
   * 
   * @returns Map of batch IDs to batch progress
   */
  public getActiveBatches(): Map<string, BatchProgress> {
    return new Map(this.activeBatches);
  }
  
  /**
   * Process features with delta-based transformation using spatial groups
   * This is more efficient for large datasets
   */
  private async processFeaturesWithDelta(
    features: Feature[],
    batchId: string,
    options: BatchProcessOptions = {}
  ): Promise<void> {
    const context: {
      source: string;
      batchId: string;
      layerId?: string;
    } = {
      source: LOG_SOURCE,
      batchId
    };

    try {
      const batch = this.activeBatches.get(batchId);
      if (!batch) {
        await dbLogger.warn('Batch not found for delta processing', context);
        return;
      }
      
      const { layerId } = batch;
      context.layerId = layerId;
      
      // Group features by spatial proximity
      const { groupFeaturesByProximity } = await import('@/core/utils/coordinates');
      const spatialGroups = groupFeaturesByProximity(features);
      
      await dbLogger.info('Processing features with delta-based transformation', {
        ...context,
        totalFeatures: features.length,
        groupCount: spatialGroups.length
      });
      
      // Track progress
      let processedCount = 0;
      let failedCount = 0;
      
      // Process each spatial group
      for (const group of spatialGroups) {
        const groupContext = {
          ...context,
          referenceFeatureId: group.referenceFeature.id,
          relatedFeatureCount: group.relatedFeatures.length
        };

        // Process reference feature first using direct API call
        try {
          await this.processFeature(group.referenceFeature, batchId, {
            ...options,
            // Force API call for reference feature to establish accurate baseline
            swissTransformation: {
              method: 'api',
              deltaThreshold: options.swissTransformation?.deltaThreshold
            }
          });
          
          processedCount++;
          
          // Get the transformed data from the reference feature
          const referenceProps = group.referenceFeature.properties;
          if (referenceProps && 
              referenceProps.height_transformed &&
              referenceProps.base_elevation_ellipsoidal !== undefined) {
            
            // Now process related features using delta approach
            for (const feature of group.relatedFeatures) {
              try {
                await this.processFeature(feature, batchId, {
                  ...options,
                  swissTransformation: {
                    method: 'delta',
                    deltaThreshold: options.swissTransformation?.deltaThreshold
                  }
                });
                processedCount++;
              } catch (error) {
                await dbLogger.error('Failed to process related feature', {
                  ...groupContext,
                  featureId: feature.id,
                  error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                  } : error
                });
                failedCount++;
              }
            }
          }
        } catch (error) {
          await dbLogger.error('Failed to process reference feature', {
            ...groupContext,
            error: error instanceof Error ? {
              message: error.message,
              stack: error.stack,
              name: error.name
            } : error
          });
          failedCount++;
          
          // If reference feature failed, try each related feature individually with API method
          for (const feature of group.relatedFeatures) {
            try {
              await this.processFeature(feature, batchId, {
                ...options,
                swissTransformation: {
                  method: 'api',
                  deltaThreshold: options.swissTransformation?.deltaThreshold
                }
              });
              processedCount++;
            } catch (error) {
              await dbLogger.error('Failed to process feature after reference failure', {
                ...groupContext,
                featureId: feature.id,
                error: error instanceof Error ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name
                } : error
              });
              failedCount++;
            }
          }
        }
        
        // Update batch progress after each group
        await this.updateBatchProgress(batchId, {
          processedFeatures: processedCount,
          failedFeatures: failedCount,
          percentComplete: Math.round((processedCount / features.length) * 100)
        });
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      await dbLogger.info('Delta-based transformation completed', {
        ...context,
        processed: processedCount,
        failed: failedCount
      });
    } catch (error) {
      await dbLogger.error('Error in delta-based transformation', { 
        ...context,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });
      throw error;
    }
  }

  /**
   * Process a single feature with height transformation
   */
  private async processFeature(
    feature: Feature,
    batchId: string,
    options: BatchProcessOptions = {}
  ): Promise<Feature> {
    const context = {
      source: LOG_SOURCE,
      batchId,
      featureId: feature.id
    };

    try {
      const transformedFeature = await processStoredLv95Coordinates(feature, {
        transformationMethod: options.swissTransformation?.method || 'api',
        cacheResults: true
      });

      return transformedFeature;
    } catch (error) {
      await dbLogger.error('Error processing feature', {
        ...context,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });
      throw error;
    }
  }
} 