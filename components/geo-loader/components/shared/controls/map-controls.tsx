import React from 'react';
import { AttributionControl } from 'react-map-gl';
import { Feature } from 'geojson';
import { ControlProps } from '../types';
import { ProgressBar } from './progress-bar';
import { ErrorDisplay } from './error-display';
import { StatusMessage } from './status-message';

interface MapControlsProps extends ControlProps {
  coordinates?: { lng: number; lat: number } | null;
  selectedFeature?: Feature | null;
  stats?: {
    visibleCount: number;
    totalCount: number;
    pointsCount: number;
    zoomLevel: number;
    minZoomForUnclustered: number;
    cacheHitRate: number;
  };
  loading?: boolean;
  error?: string | null;
  progress?: number;
  onFeatureClick?: (feature: Feature) => void;
  showStats?: boolean;
  showCoordinates?: boolean;
  showAttribution?: boolean;
}

export function MapControls({
  coordinates,
  selectedFeature,
  stats,
  loading = false,
  error = null,
  progress = 0,
  onFeatureClick,
  showStats = true,
  showCoordinates = true,
  showAttribution = true,
  className = '',
  disabled = false
}: MapControlsProps) {
  return (
    <>
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-4 w-4 animate-spin" />
            <div className="text-sm text-muted-foreground">
              Loading...
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="absolute top-2 left-2 right-2 z-50">
          <ErrorDisplay
            error={{
              message: error,
              code: 'MAP_ERROR'
            }}
          />
        </div>
      )}

      {/* Progress Bar */}
      {progress > 0 && progress < 100 && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <ProgressBar
            info={{
              progress: progress / 100,
              status: 'Loading map data...'
            }}
          />
        </div>
      )}

      {/* Stats Display */}
      {showStats && stats && (
        <div className="absolute top-2 right-2 bg-background/80 text-xs p-2 rounded flex flex-col gap-1">
          <div>
            Showing {stats.visibleCount} of {stats.totalCount} features
          </div>
          {stats.zoomLevel < stats.minZoomForUnclustered && stats.pointsCount > 0 && (
            <div className="text-muted-foreground">
              Zoom in to view individual points
            </div>
          )}
          <div className="text-muted-foreground">
            Cache hit rate: {(stats.cacheHitRate * 100).toFixed(1)}%
          </div>
        </div>
      )}

      {/* Coordinates Display */}
      {showCoordinates && coordinates && (
        <div className="absolute bottom-8 left-2 bg-background/80 text-xs p-2 rounded">
          Coordinates: {coordinates.lng.toFixed(6)}, {coordinates.lat.toFixed(6)}
        </div>
      )}

      {/* Feature Tooltip */}
      {selectedFeature && selectedFeature.geometry.type === 'Point' && (
        <div
          className="absolute z-50 bg-background/90 p-2 rounded shadow-lg text-xs"
          style={{
            left: (selectedFeature as any).point?.[0],
            top: (selectedFeature as any).point?.[1],
            transform: 'translate(-50%, -100%)',
            marginTop: -8
          }}
        >
          <div className="font-medium">
            {selectedFeature.properties?.layer || 'Unknown Layer'}
          </div>
          {selectedFeature.properties?.hasWarning && (
            <div className="text-destructive mt-1">
              {selectedFeature.properties?.warningMessage}
            </div>
          )}
        </div>
      )}

      {/* Attribution */}
      {showAttribution && (
        <div className="absolute bottom-0 right-0 z-10">
          <AttributionControl
            compact={true}
            style={{
              margin: '0 8px 8px 0',
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              fontSize: '10px'
            }}
          />
        </div>
      )}
    </>
  );
}
