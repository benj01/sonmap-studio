import { getConfigForFile } from '@/components/files/utils/file-types';
import { ImportGeoFeature, LoaderGeoFeature } from '../types';

/**
 * Convert an import feature to a loader feature
 */
export function convertFeature(feature: ImportGeoFeature): LoaderGeoFeature {
  return {
    type: 'Feature',
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      ...feature.properties,
      originalIndex: feature.originalIndex
    }
  };
}

/**
 * Get a descriptive name for the file type
 */
export function getFileTypeDescription(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension) return 'Unknown';
  
  const fileType = getConfigForFile(fileName);
  return fileType?.description || 'Unknown';
}

/**
 * Format file size in a human-readable way
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
} 