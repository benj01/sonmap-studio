'use client';

import { LogManager } from '@/core/logging/log-manager';
import { processStoredLv95Coordinates } from '@/core/utils/coordinates';
import { getHeightTransformationStatus, HeightTransformationStatus } from './heightTransformService';
import type { Feature, FeatureCollection } from 'geojson';

const SOURCE = 'HeightTransformBatchService';
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

export interface BatchProgressCallback {
  (progress: BatchProgress): void;
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
    cache: boolean;
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
   * 
   * @param layerId The layer ID to process
   * @param heightSourceType The type of height source ('z_coord', 'attribute', 'none')
   * @param heightSourceAttribute Optional attribute name for attribute type
   * @param featureCollection Optional GeoJSON feature collection with in-memory features (not yet persisted to database)
   * @returns Batch ID if successful, 'NO_FEATURES' if layer has no features, or null on error
   */
  public async initializeBatch(
    layerId: string,
    heightSourceType: 'z_coord' | 'attribute' | 'none',
    heightSourceAttribute?: string,
    featureCollection?: any
  ): Promise<string | 'NO_FEATURES' | null> {
    try {
      // Set unique batch ID for logging purposes
      const batchTraceId = `batch_init_${Date.now()}`;
      
      logger.info('Initializing height transformation batch', { 
        batchTraceId,
        layerId, 
        heightSourceType, 
        heightSourceAttribute,
        hasFeatureCollection: !!featureCollection
      });
      
      // Skip initialization for 'none' height source type as it doesn't require processing
      if (heightSourceType === 'none') {
        logger.info('Skipping batch initialization for "none" height source type', { 
          batchTraceId,
          layerId 
        });
        return null;
      }
      
      // Log API call attempt
      logger.info('Calling height transformation initialization API', {
        batchTraceId,
        endpoint: '/api/height-transformation/initialize',
        requestBody: {
          layerId,
          heightSourceType,
          heightSourceAttribute,
          hasFeatureCollection: !!featureCollection
        }
      });
      
      // Prepare the request body - include featureCollection if provided
      const requestBody: any = {
        layerId,
        heightSourceType,
        heightSourceAttribute
      };
      
      // Only include featureCollection if provided
      if (featureCollection) {
        requestBody.featureCollection = featureCollection;
      }
      
      const response = await fetch('/api/height-transformation/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      // Log API response status
      logger.info('Received initialization API response', {
        batchTraceId,
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to initialize batch', { 
          batchTraceId,
          layerId, 
          status: response.status,
          error: errorText
        });
        
        // Handle specific error cases
        if (response.status === 404) {
          // Call the diagnostic endpoint for more information
          try {
            logger.info('Calling diagnostic endpoint for feature counts', {
              batchTraceId,
              endpoint: `/api/height-transformation/feature-counts?layerId=${layerId}`
            });
            
            const diagResponse = await fetch(`/api/height-transformation/feature-counts?layerId=${layerId}`);
            
            if (diagResponse.ok) {
              const diagData = await diagResponse.json();
              logger.info('Feature counts diagnostic information', {
                batchTraceId,
                diagData
              });
              
              // Log specific counts for Swiss coordinates features
              if (diagData.height_mode_counts) {
                logger.info('Swiss coordinates feature counts', {
                  batchTraceId,
                  total_features: diagData.total_features,
                  lv95_stored_features: diagData.lv95_stored_features,
                  height_mode_counts: diagData.height_mode_counts
                });
              }
            } else {
              logger.warn('Failed to get diagnostic information', {
                batchTraceId,
                status: diagResponse.status,
                statusText: diagResponse.statusText
              });
            }
          } catch (diagError) {
            logger.error('Error calling diagnostic endpoint', { 
              batchTraceId,
              error: diagError 
            });
          }
          
          logger.warn('No features found in layer, skipping transformation', { 
            batchTraceId,
            layerId 
          });
          // Return a special flag to indicate no features instead of null (error)
          return 'NO_FEATURES';
        }
        
        // Handle other error cases
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error && errorData.error.includes('No features found')) {
            logger.warn('No features found in layer, skipping transformation', { 
              batchTraceId,
              layerId,
              errorMessage: errorData.error
            });
            // Return a special flag to indicate no features instead of null (error)
            return 'NO_FEATURES';
          }
        } catch (parseError) {
          // Not JSON or other parsing error, continue with normal error handling
          logger.warn('Could not parse error response', {
            batchTraceId,
            errorText,
            parseError
          });
        }
        
        return null;
      }
      
      const data = await response.json();
      
      if (!data.success || !data.batchId) {
        logger.error('Invalid response from batch initialization', { 
          batchTraceId,
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
      
      logger.info('Batch initialized successfully', { 
        batchTraceId,
        batchId, 
        layerId 
      });
      return batchId;
    } catch (error) {
      logger.error('Error initializing batch', { 
        layerId, 
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
    // Default options
    const {
      chunkSize = 50,
      maxRetries = 3,
      pollingInterval = 1000,
      cancelToken
    } = options;
    
    // Validate batch ID is a valid UUID (not 'NO_FEATURES' or other special string)
    if (typeof batchId !== 'string' || batchId.length !== 36) {
      logger.error('Invalid batch ID format', { batchId });
      return false;
    }
    
    const batch = this.activeBatches.get(batchId);
    if (!batch) {
      logger.error('Batch not found', { batchId });
      return false;
    }
    
    const { layerId } = batch;
    
    try {
      // Create a local abort controller if none provided
      const abortController = new AbortController();
      this.abortControllers.set(batchId, abortController);
      
      // Use the provided cancel token if available
      if (cancelToken) {
        cancelToken.addEventListener('abort', () => {
          abortController.abort();
        });
      }
      
      // Get initial status to determine total features
      const initialStatus = await getHeightTransformationStatus(layerId);
      if (!initialStatus) {
        logger.error('Failed to get initial batch status', { batchId, layerId });
        this.updateBatchProgress(batchId, {
          status: 'failed',
          errorMessage: 'Failed to get initial batch status'
        });
        return false;
      }
      
      const totalFeatures = initialStatus.feature_status.total;
      const featuresNeedingTransformation = featureCollection.features.filter(
        feature => feature.properties?.height_mode === 'lv95_stored'
      );
      
      // Calculate total chunks
      const totalChunks = Math.ceil(featuresNeedingTransformation.length / chunkSize);
      
      // Update batch progress
      this.updateBatchProgress(batchId, {
        status: 'in_progress',
        totalFeatures,
        totalChunks
      });
      
      // Start processing in the background
      this.processFeatureChunks(
        batchId,
        featuresNeedingTransformation,
        chunkSize,
        maxRetries,
        pollingInterval,
        abortController.signal,
        options
      );
      
      return true;
    } catch (error) {
      logger.error('Error starting batch processing', { batchId, layerId, error });
      this.updateBatchProgress(batchId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error starting batch'
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
    if (!batch) return;
    
    const { layerId } = batch;
    let currentChunk = 0;
    const totalChunks = Math.ceil(features.length / chunkSize);
    
    try {
      // Check if using Swiss delta-based transformation
      const useDeltaTransformation = options.swissTransformation?.method === 'delta';
      
      if (useDeltaTransformation) {
        // Use spatial grouping and delta-based processing for more efficiency
        await this.processFeaturesWithDelta(features, batchId, options);
        return; // Skip standard processing
      }
      
      // Process chunks sequentially to avoid overwhelming the API
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        // Check if processing was cancelled
        if (abortSignal.aborted) {
          logger.info('Batch processing cancelled', { batchId, layerId });
          this.updateBatchProgress(batchId, {
            status: 'cancelled'
          });
          return;
        }
        
        currentChunk = chunkIndex + 1;
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, features.length);
        const chunkFeatures = features.slice(start, end);
        
        this.updateBatchProgress(batchId, {
          currentChunk
        });
        
        logger.debug('Processing feature chunk', { 
          batchId, 
          layerId, 
          chunk: currentChunk, 
          featuresInChunk: chunkFeatures.length 
        });
        
        // Process each feature in the chunk with retries
        await Promise.all(
          chunkFeatures.map(async (feature) => {
            let retries = 0;
            let success = false;
            
            while (!success && retries < maxRetries && !abortSignal.aborted) {
              try {
                // Transform feature heights using coordinate utility
                await this.processFeature(feature, batchId, options);
                success = true;
              } catch (error) {
                retries++;
                if (retries >= maxRetries) {
                  logger.error('Failed to process feature after max retries', { 
                    featureId: feature.id,
                    batchId,
                    error
                  });
                } else {
                  // Wait before retry
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }
            }
          })
        );
        
        // Check progress after each chunk
        const status = await getHeightTransformationStatus(layerId);
        if (status) {
          this.updateBatchProgress(batchId, {
            processedFeatures: status.feature_status.complete,
            failedFeatures: status.feature_status.failed,
            percentComplete: status.feature_status.total > 0
              ? Math.round((status.feature_status.complete / status.feature_status.total) * 100)
              : 0
          });
        }
        
        // Small delay between chunks to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      }
      
      // Final status check
      const finalStatus = await getHeightTransformationStatus(layerId);
      if (finalStatus) {
        const isComplete = finalStatus.feature_status.pending === 0 && 
                          finalStatus.feature_status.in_progress === 0;
        
        this.updateBatchProgress(batchId, {
          status: isComplete ? 'complete' : 'in_progress',
          processedFeatures: finalStatus.feature_status.complete,
          failedFeatures: finalStatus.feature_status.failed,
          percentComplete: finalStatus.feature_status.total > 0
            ? Math.round((finalStatus.feature_status.complete / finalStatus.feature_status.total) * 100)
            : 0
        });
      }
      
      logger.info('Batch processing completed', { batchId, layerId });
    } catch (error) {
      logger.error('Error in batch processing', { batchId, layerId, error });
      this.updateBatchProgress(batchId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error in batch processing'
      });
    } finally {
      // Clean up
      this.abortControllers.delete(batchId);
    }
  }
  
  /**
   * Process a single feature's height transformation
   */
  private async processFeature(feature: Feature, batchId?: string, options?: BatchProcessOptions): Promise<Feature> {
    const featureId = feature.id || 'unknown';
    
    // Check if this feature needs transformation
    if (feature.properties?.height_mode === 'lv95_stored') {
      logger.info('Processing feature with LV95 stored coordinates', {
        featureId,
        batchId,
        lv95_coordinates: {
          easting: feature.properties?.lv95_easting,
          northing: feature.properties?.lv95_northing,
          height: feature.properties?.lv95_height
        }
      });
      
      // Apply transformation with appropriate method
      if (options?.swissTransformation) {
        logger.debug('Using specified Swiss transformation method', {
          featureId,
          method: options.swissTransformation.method,
          cache: options.swissTransformation.cache
        });
        
        const startTime = Date.now();
        const transformedFeature = await processStoredLv95Coordinates(feature, {
          transformationMethod: options.swissTransformation.method,
          cacheResults: options.swissTransformation.cache
        });
        const duration = Date.now() - startTime;
        
        logger.info('Feature transformation completed', {
          featureId,
          batchId,
          duration: `${duration}ms`,
          transformationMethod: options.swissTransformation.method,
          original_height: feature.properties?.lv95_height,
          transformed_height: transformedFeature.properties?.base_elevation_ellipsoidal,
          height_mode_changed: feature.properties?.height_mode !== transformedFeature.properties?.height_mode
        });
        
        // Save the transformed feature data to the database
        await this.saveTransformedFeatureToDatabase(transformedFeature, feature.id, batchId);
        
        return transformedFeature;
      } else {
        // Use default transformation
        logger.debug('Using default transformation method', { featureId, batchId });
        
        const startTime = Date.now();
        const transformedFeature = await processStoredLv95Coordinates(feature);
        const duration = Date.now() - startTime;
        
        logger.info('Feature transformation completed with default method', {
          featureId,
          batchId,
          duration: `${duration}ms`,
          original_height: feature.properties?.lv95_height,
          transformed_height: transformedFeature.properties?.base_elevation_ellipsoidal,
          height_mode_changed: feature.properties?.height_mode !== transformedFeature.properties?.height_mode
        });
        
        // Save the transformed feature data to the database
        await this.saveTransformedFeatureToDatabase(transformedFeature, feature.id, batchId);
        
        return transformedFeature;
      }
    }
    
    logger.debug('Feature skipped - not eligible for transformation', {
      featureId,
      height_mode: feature.properties?.height_mode
    });
    
    return feature;
  }
  
  /**
   * Saves transformed feature data back to the database
   */
  private async saveTransformedFeatureToDatabase(
    transformedFeature: Feature, 
    featureId?: string | number,
    batchId?: string
  ): Promise<boolean> {
    if (!featureId) {
      logger.warn('Cannot save transformed feature without ID', { feature: transformedFeature });
      return false;
    }

    try {
      // Extract the transformed properties we need to save
      const { 
        base_elevation_ellipsoidal, 
        height_mode,
        height_transformed,
        height_transformed_at
      } = transformedFeature.properties || {};
      
      // Skip if we don't have the necessary height data
      if (base_elevation_ellipsoidal === undefined || !height_mode) {
        logger.warn('Transformed feature missing required height data', { 
          featureId,
          base_elevation_ellipsoidal,
          height_mode
        });
        return false;
      }
      
      logger.debug('Saving transformed feature to database', {
        featureId,
        batchId,
        height_mode,
        base_elevation_ellipsoidal
      });
      
      // Call our update API endpoint
      const response = await fetch('/api/height-transformation/update-feature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureId,
          batchId,
          transformedData: {
            base_elevation_ellipsoidal,
            height_mode,
            height_transformed,
            height_transformed_at
          }
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to save transformed feature', { 
          featureId,
          status: response.status,
          error: errorText
        });
        return false;
      }
      
      const result = await response.json();
      
      logger.info('Feature transformed data saved to database', { 
        featureId,
        height_mode: result.updated.height_mode,
        base_elevation_ellipsoidal: result.updated.base_elevation_ellipsoidal 
      });
      
      return true;
    } catch (error) {
      logger.error('Error saving transformed feature', { 
        featureId,
        error 
      });
      return false;
    }
  }
  
  /**
   * Update the progress of a batch and notify callbacks
   */
  private updateBatchProgress(batchId: string, updates: Partial<BatchProgress>): void {
    const currentProgress = this.activeBatches.get(batchId);
    if (!currentProgress) return;
    
    // Update progress with new values
    const updatedProgress: BatchProgress = {
      ...currentProgress,
      ...updates
    };
    
    // Store updated progress
    this.activeBatches.set(batchId, updatedProgress);
    
    // Notify callbacks
    const callbacks = this.progressCallbacks.get(batchId) || [];
    callbacks.forEach(callback => {
      try {
        callback(updatedProgress);
      } catch (error) {
        logger.error('Error in progress callback', { batchId, error });
      }
    });
  }
  
  /**
   * Register a callback for batch progress updates
   * 
   * @param batchId The batch ID to monitor
   * @param callback The callback function to receive progress updates
   * @returns A function to unregister the callback
   */
  public registerProgressCallback(
    batchId: string, 
    callback: BatchProgressCallback
  ): () => void {
    // Initialize callback array if needed
    if (!this.progressCallbacks.has(batchId)) {
      this.progressCallbacks.set(batchId, []);
    }
    
    // Add callback
    const callbacks = this.progressCallbacks.get(batchId)!;
    callbacks.push(callback);
    
    // Send initial progress if available
    const currentProgress = this.activeBatches.get(batchId);
    if (currentProgress) {
      try {
        callback(currentProgress);
      } catch (error) {
        logger.error('Error in initial progress callback', { batchId, error });
      }
    }
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.progressCallbacks.get(batchId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }
  
  /**
   * Cancel an active batch process
   * 
   * @param batchId The batch ID to cancel
   * @returns True if the batch was cancelled
   */
  public cancelBatch(batchId: string): boolean {
    const abortController = this.abortControllers.get(batchId);
    if (!abortController) {
      logger.warn('No active abort controller for batch', { batchId });
      return false;
    }
    
    try {
      abortController.abort();
      this.updateBatchProgress(batchId, {
        status: 'cancelled'
      });
      this.abortControllers.delete(batchId);
      return true;
    } catch (error) {
      logger.error('Error cancelling batch', { batchId, error });
      return false;
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
    try {
      const batch = this.activeBatches.get(batchId);
      if (!batch) return;
      
      const { layerId } = batch;
      
      // Group features by spatial proximity
      const { groupFeaturesByProximity } = await import('@/core/utils/coordinates');
      const spatialGroups = groupFeaturesByProximity(features);
      
      logger.info('Processing features with delta-based transformation', {
        batchId,
        layerId,
        totalFeatures: features.length,
        groupCount: spatialGroups.length
      });
      
      // Track progress
      let processedCount = 0;
      let failedCount = 0;
      
      // Process each spatial group
      for (const group of spatialGroups) {
        // Process reference feature first using direct API call
        try {
          await this.processFeature(group.referenceFeature, batchId, {
            ...options,
            // Force API call for reference feature to establish accurate baseline
            swissTransformation: {
              method: 'api',
              cache: options.swissTransformation?.cache ?? true
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
                    cache: options.swissTransformation?.cache ?? true
                  }
                });
                processedCount++;
              } catch (error) {
                logger.error('Failed to process related feature', {
                  featureId: feature.id,
                  error
                });
                failedCount++;
              }
            }
          }
        } catch (error) {
          logger.error('Failed to process reference feature', {
            featureId: group.referenceFeature.id,
            error
          });
          failedCount++;
          
          // If reference feature failed, try each related feature individually with API method
          for (const feature of group.relatedFeatures) {
            try {
              await this.processFeature(feature, batchId, {
                ...options,
                swissTransformation: {
                  method: 'api',
                  cache: options.swissTransformation?.cache ?? true
                }
              });
              processedCount++;
            } catch (error) {
              logger.error('Failed to process feature after reference failure', {
                featureId: feature.id,
                error
              });
              failedCount++;
            }
          }
        }
        
        // Update batch progress after each group
        this.updateBatchProgress(batchId, {
          processedFeatures: processedCount,
          failedFeatures: failedCount,
          percentComplete: Math.round((processedCount / features.length) * 100)
        });
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      logger.info('Delta-based transformation completed', {
        batchId,
        layerId,
        processed: processedCount,
        failed: failedCount
      });
    } catch (error) {
      logger.error('Error in delta-based transformation', { error });
      throw error;
    }
  }
} 