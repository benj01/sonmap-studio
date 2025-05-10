import React, { useEffect, useRef, useState } from 'react';
import { useWizard } from '../WizardContext';
import { dbLogger } from '@/utils/logging/dbLogger';
import { ParserFactory } from '@/core/processors/parser-factory';
import type { GeoFeature as ImportGeoFeature } from '@/types/geo-import';
import type { ParserProgressEvent } from '@/core/processors/base-parser';
import type { WizardDataset } from '../WizardContext';
import { createClient } from '@/utils/supabase/client';
import type { GeoFeature } from '@/types/geo';

interface ParseStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ParseStep({ onNext, onBack }: ParseStepProps) {
  const { fileInfo, setDataset, projectId } = useWizard();
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const parseAttemptRef = useRef(0);
  const supabase = createClient();

  useEffect(() => {
    mountedRef.current = true;
    
    // Use IIFE to handle async operations
    (async () => {
      try {
        await dbLogger.debug('ParseStep mounted', { source: 'ParseStep', projectId });
      } catch (error) {
        // Log error but don't throw as this is not critical
        console.error('Failed to log mount status:', error);
      }
    })();
    
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Use IIFE to handle async operations in cleanup
      (async () => {
        try {
          await dbLogger.debug('ParseStep unmounted', { source: 'ParseStep', projectId });
        } catch (error) {
          // Log error but don't throw as this is not critical
          console.error('Failed to log unmount status:', error);
        }
      })();
    };
  }, [projectId]);

  useEffect(() => {
    const currentAttempt = ++parseAttemptRef.current;

    const startParsing = async () => {
      if (!fileInfo?.id || !fileInfo.name || !mountedRef.current || isParsing) {
        return;
      }

      try {
        setIsParsing(true);
        setParseError(null);
        setParseProgress(0);

        // Create new AbortController for this parse attempt
        abortControllerRef.current = new AbortController();

        await dbLogger.debug('ParseStep: starting parse operation', {
          fileInfo,
          companions: fileInfo?.companions,
          projectId,
          fileName: fileInfo?.name
        });

        await dbLogger.debug('Starting file parsing', { 
          source: 'ParseStep',
          fileName: fileInfo.name,
          attempt: currentAttempt,
          projectId
        });

        // Get file info from database
        const { data: file, error: dbError } = await supabase
          .from('project_files')
          .select('*')
          .eq('id', fileInfo.id)
          .single();

        if (dbError) throw new Error(`Failed to get file info: ${dbError.message}`);
        if (!file) throw new Error('File not found');

        // Get download URL for main file
        const { data: urlData, error: urlError } = await supabase.storage
          .from('project-files')
          .createSignedUrl(file.storage_path, 60);

        if (urlError) throw new Error(`Failed to get file URL: ${urlError.message}`);
        if (!urlData?.signedUrl) throw new Error('No signed URL received');

        const onProgress = async (event: ParserProgressEvent) => {
          if (mountedRef.current && currentAttempt === parseAttemptRef.current) {
            setParseProgress(event.progress);
            await dbLogger.debug('ParseStep: onProgress called', {
              progress: event.progress,
              fileName: fileInfo?.name,
              projectId
            });
          }
        };

        // Create parser instance
        const parser = ParserFactory.createParser(fileInfo.name);

        // Get file data from storage
        const mainFileResponse = await fetch(urlData.signedUrl);
        const mainFileBuffer = await mainFileResponse.arrayBuffer();
        const companionBuffers: Record<string, ArrayBuffer> = {};
        
        if (fileInfo.companions) {
          for (const companion of fileInfo.companions) {
            if (!companion.id || !companion.name) continue;

            // Get companion file URL
            const { data: companionUrlData, error: companionError } = await supabase.storage
              .from('project-files')
              .createSignedUrl(companion.storage_path, 60);

            if (companionError) {
              await dbLogger.warn('Failed to get companion file URL', {
                source: 'ParseStep',
                companionId: companion.id,
                error: companionError.message,
                projectId
              });
              continue;
            }

            if (companionUrlData?.signedUrl) {
              const response = await fetch(companionUrlData.signedUrl);
              const extension = companion.name.slice(companion.name.lastIndexOf('.')).toLowerCase();
              companionBuffers[extension] = await response.arrayBuffer();
            }
          }
        }

        const result = await parser.parse(
          mainFileBuffer,
          companionBuffers,
          {
            filename: fileInfo.name,
            transformCoordinates: true
          },
          onProgress
        );
        await dbLogger.debug('ParseStep: parser.parse completed', {
          fileName: fileInfo?.name,
          projectId,
          resultSummary: {
            features: Array.isArray(result?.features) ? result.features.length : undefined,
            metadata: !!result?.metadata
          }
        });

        if (mountedRef.current && currentAttempt === parseAttemptRef.current) {
          await dbLogger.info('File parsing completed', {
            source: 'ParseStep',
            fileName: fileInfo.name,
            featureCount: result.features.length,
            projectId
          });
          await dbLogger.debug('ParseStep: calling onNext', { fileName: fileInfo?.name, projectId });
          // Convert FullDataset to WizardDataset
          const wizardDataset: WizardDataset = {
            features: result.features.map((feature: ImportGeoFeature): GeoFeature => ({
              ...feature,
              type: 'Feature',
              properties: feature.properties || {}
            })),
            metadata: result.metadata ? {
              ...result.metadata,
              // Add any additional metadata fields needed by WizardDataset
            } as Record<string, unknown> : undefined
          };

          // Update dataset in wizard context
          setDataset(wizardDataset);
          onNext();
        }
      } catch (error) {
        if (mountedRef.current && currentAttempt === parseAttemptRef.current) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          await dbLogger.error('File parsing failed', {
            source: 'ParseStep',
            error: errorMessage,
            fileName: fileInfo?.name,
            projectId
          });
          await dbLogger.debug('ParseStep: error caught in catch', { error, fileName: fileInfo?.name, projectId });
          setParseError(errorMessage);
        }
      } finally {
        if (mountedRef.current && currentAttempt === parseAttemptRef.current) {
          setIsParsing(false);
          abortControllerRef.current = null;
          await dbLogger.debug('ParseStep: finally block', { isParsing: false, fileName: fileInfo?.name, projectId });
        }
      }
    };

    // Use IIFE to handle the async operation
    (async () => {
      try {
        await startParsing();
      } catch (error) {
        console.error('Failed to start parsing:', error);
      }
    })();
  }, [fileInfo?.id, fileInfo?.name, fileInfo?.companions, onNext, projectId, isParsing, supabase, setDataset]);

  return (
    <div className="space-y-4">
      {isParsing ? (
        <div>
          <p>Parsing file... {Math.round(parseProgress)}%</p>
          <div className="w-full h-2 bg-gray-200 rounded-full mt-2">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${parseProgress}%` }}
            />
          </div>
        </div>
      ) : parseError ? (
        <div className="text-red-500">
          <p>Error parsing file:</p>
          <p>{parseError}</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Go Back
          </button>
        </div>
      ) : null}
    </div>
  );
} 