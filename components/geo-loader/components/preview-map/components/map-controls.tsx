import React from 'react';
import { AttributionControl } from 'react-map-gl';
import { MapFeature } from '../../../types/map';

interface StatsControlProps {
  visibleCount: number;
  totalCount: number;
  pointsCount: number;
  zoomLevel: number;
  minZoomForUnclustered: number;
  cacheHitRate: number;
}

export const StatsControl: React.FC<StatsControlProps> = ({
  visibleCount,
  totalCount,
  pointsCount,
  zoomLevel,
  minZoomForUnclustered,
  cacheHitRate
}) => (
  <div className="absolute top-2 right-2 bg-background/80 text-xs p-2 rounded flex flex-col gap-1">
    <div>
      Showing {visibleCount} of {totalCount} features
    </div>
    {zoomLevel < minZoomForUnclustered && pointsCount > 0 && (
      <div className="text-muted-foreground">
        Zoom in to view individual points
      </div>
    )}
    <div className="text-muted-foreground">
      Cache hit rate: {(cacheHitRate * 100).toFixed(1)}%
    </div>
  </div>
);

interface CoordinatesControlProps {
  coordinates: { lng: number; lat: number } | null;
}

export const CoordinatesControl: React.FC<CoordinatesControlProps> = ({ coordinates }) => {
  if (!coordinates) return null;

  return (
    <div className="absolute bottom-8 left-2 bg-background/80 text-xs p-2 rounded">
      Coordinates: {coordinates.lng.toFixed(6)}, {coordinates.lat.toFixed(6)}
    </div>
  );
};

interface FeatureTooltipProps {
  feature: MapFeature | null;
}

export const FeatureTooltip: React.FC<FeatureTooltipProps> = ({ feature }) => {
  if (!feature || !feature.point) return null;

  return (
    <div
      className="absolute z-50 bg-background/90 p-2 rounded shadow-lg text-xs"
      style={{
        left: feature.point[0],
        top: feature.point[1],
        transform: 'translate(-50%, -100%)',
        marginTop: -8
      }}
    >
      <div className="font-medium">
        {feature.properties?.layer || 'Unknown Layer'}
      </div>
      {feature.properties?.hasWarning && (
        <div className="text-destructive mt-1">
          {feature.properties?.warningMessage}
        </div>
      )}
    </div>
  );
};

export const MapAttribution: React.FC = () => (
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
);

export const LoadingOverlay: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-4 w-4 animate-spin" />
        <div className="text-sm text-muted-foreground">
          Loading preview...
        </div>
      </div>
    </div>
  );
};

export const ErrorOverlay: React.FC<{ error: string | null }> = ({ error }) => {
  if (!error) return null;

  return (
    <div className="absolute top-2 left-2 right-2 z-50 bg-destructive text-destructive-foreground p-2 rounded text-sm">
      {error}
    </div>
  );
};

export const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  if (progress <= 0 || progress >= 100) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-50">
      <div className="h-1 bg-primary" style={{ width: `${progress}%` }} />
    </div>
  );
};
