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

// Type guard to ensure object has a defined, non-empty storage_path
function hasStoragePath(obj: any): obj is { storage_path: string } {
  return typeof obj?.storage_path === 'string' && obj.storage_path.length > 0;
}

export function ParseStep({ onNext, onBack }: ParseStepProps) {
  const { fileInfo, setDataset, projectId, setImportDataset } = useWizard();
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState(0);
  const [parsingStatus, setParsingStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [parseResult, setParseResult] = useState<WizardDataset | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!fileInfo?.id || !fileInfo.name) {
      setParsingStatus('idle');
      return;
    }

    let cancelled = false;
    setParseError(null);
    setParseProgress(0);
    setParsingStatus('parsing');
    setParseResult(null);

    (async () => {
      try {
        await dbLogger.debug('ParseStep: starting parse operation', {
          fileInfoId: fileInfo.id,
          fileName: fileInfo.name,
          hasCompanions: !!fileInfo.companions?.length,
          projectId,
        });

        const { data: file, error: dbError } = await supabase
          .from('project_files')
          .select('id, storage_path')
          .eq('id', fileInfo.id || '')
          .single();

        if (dbError) throw new Error(`Failed to get file info: ${dbError.message}`);
        if (!file) throw new Error('File not found in database');

        if (!hasStoragePath(file)) {
          const errorMessage = 'Main file storage_path is missing, null, empty, or not a string.';
          await dbLogger.error(errorMessage, {
            fileId: (file as { id?: string }).id,
            actualPathValue: (file as any).storage_path,
            projectId
          });
          throw new Error(errorMessage);
        }
        const typedFile = file as { id: string; storage_path: string };
        const { data: urlData, error: urlError } = await supabase.storage
          .from('project-files')
          .createSignedUrl(typedFile.storage_path, 60);
        if (urlError) throw new Error(`Failed to get file URL: ${urlError.message}`);
        if (!urlData?.signedUrl) throw new Error('No signed URL received for main file');

        const companionBuffers: Record<string, ArrayBuffer> = {};
        if (fileInfo.companions) {
          for (const companion of fileInfo.companions) {
            if (!companion.id || !companion.name) continue;

            if (!hasStoragePath(companion)) {
              const warningMessage = 'Companion file storage_path is missing, null, empty, or not a string. Skipping this companion.';
              await dbLogger.warn(warningMessage, {
                source: 'ParseStep',
                companionId: (companion as { id?: string }).id,
                companionName: (companion as { name?: string }).name,
                actualPathValue: (companion as any).storage_path,
                projectId
              });
              continue;
            }
            const typedCompanion = companion as { id: string; name: string; storage_path: string };
            const { data: companionUrlData, error: companionError } = await supabase.storage
              .from('project-files')
              .createSignedUrl(typedCompanion.storage_path, 60);
            if (companionError) {
              await dbLogger.warn('Failed to get companion file URL, skipping companion.', {
                source: 'ParseStep',
                companionId: typedCompanion.id,
                companionName: typedCompanion.name,
                error: companionError.message,
                projectId
              });
              continue;
            }
            if (companionUrlData?.signedUrl) {
              const response = await fetch(companionUrlData.signedUrl);
              if (!response.ok) {
                await dbLogger.warn(`Failed to fetch companion file ${typedCompanion.name}, status: ${response.status}. Skipping.`, {
                  source: 'ParseStep', companionId: typedCompanion.id, projectId
                });
                continue;
              }
              const extension = typedCompanion.name.slice(typedCompanion.name.lastIndexOf('.')).toLowerCase();
              companionBuffers[extension] = await response.arrayBuffer();
            }
          }
        }

        const mainFileResponse = await fetch(urlData.signedUrl);
        if (!mainFileResponse.ok) {
          throw new Error(`Failed to fetch main file ${fileInfo.name}, status: ${mainFileResponse.status}`);
        }
        const mainFileBuffer = await mainFileResponse.arrayBuffer();
        const parser = ParserFactory.createParser(fileInfo.name!);

        const onProgress = (event: ParserProgressEvent) => {
          if (!cancelled) setParseProgress(event.progress);
        };

        // Parse original (untransformed) features for import
        const resultOriginal = await parser.parse(
          mainFileBuffer,
          companionBuffers,
          {
            filename: fileInfo.name,
            transformCoordinates: false
          },
          onProgress
        );

        // Parse transformed features for preview (WGS84)
        const resultPreview = await parser.parse(
          mainFileBuffer,
          companionBuffers,
          {
            filename: fileInfo.name,
            transformCoordinates: true
          },
          onProgress
        );

        if (!resultOriginal || !resultOriginal.features || !resultPreview || !resultPreview.features) {
          throw new Error('Parsing resulted in no features or an invalid result structure.');
        }

        await dbLogger.debug('ParseStep: parser.parse completed', {
          fileName: fileInfo.name,
          projectId,
          resultSummary: {
            featuresCount: resultOriginal.features.length,
            hasMetadata: !!resultOriginal.metadata
          }
        });

        if (!cancelled) {
          // Store both datasets in context
          setDataset({
            features: (resultPreview.features || []).map((feature: ImportGeoFeature): GeoFeature => ({
              ...feature,
              type: 'Feature',
              properties: feature.properties || {}
            })),
            metadata: resultPreview.metadata ? { ...resultPreview.metadata } as Record<string, unknown> : undefined
          });
          // Store original for import (with correct SRID in metadata)
          setImportDataset({
            features: (resultOriginal.features || []).map((feature: ImportGeoFeature): GeoFeature => ({
              ...feature,
              type: 'Feature',
              properties: feature.properties || {}
            })),
            metadata: resultOriginal.metadata ? { ...resultOriginal.metadata } as Record<string, unknown> : undefined
          });
          setParseResult({
            features: (resultPreview.features || []).map((feature: ImportGeoFeature): GeoFeature => ({
              ...feature,
              type: 'Feature',
              properties: feature.properties || {}
            })),
            metadata: resultPreview.metadata ? { ...resultPreview.metadata } as Record<string, unknown> : undefined
          });
          setParsingStatus('done');
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during parsing';
          await dbLogger.error('ParseStep: error during parsing process', {
            message: errorMessage,
            fileInfoId: fileInfo?.id,
            fileName: fileInfo?.name,
            projectId,
            errorDetails: error instanceof Error ? error.stack : error
          });
          setParseError(errorMessage);
          setParsingStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fileInfo, projectId, supabase, setDataset, setImportDataset]);

  useEffect(() => {
    if (parsingStatus === 'done' && parseResult) {
      onNext();
    }
  }, [parsingStatus, parseResult, onNext]);

  return (
    <div className="space-y-4">
      {parsingStatus === 'parsing' && (
        <div>
          <p>Parsing file: {fileInfo?.name || 'selected file'}... {Math.round(parseProgress)}%</p>
          <div className="w-full h-2 bg-gray-200 rounded-full mt-2">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${parseProgress}%` }}
            />
          </div>
        </div>
      )}
      {parsingStatus === 'error' && (
        <div className="text-red-500">
          <p>Error parsing file:</p>
          <pre className="whitespace-pre-wrap text-sm">{parseError}</pre>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Go Back
          </button>
        </div>
      )}
    </div>
  );
} 