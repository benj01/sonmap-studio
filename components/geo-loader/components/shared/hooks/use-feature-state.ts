import { useState, useCallback, useEffect } from 'react';
import { Feature } from 'geojson';
import { FeatureState, ProcessingOptions } from '../types';
import { CoordinateSystemService } from '../services/coordinate-system';

export function useFeatureState(
  initialFeatures: Feature[] = [],
  options: ProcessingOptions = {}
) {
  const [state, setState] = useState<FeatureState>({
    features: initialFeatures,
    filteredFeatures: initialFeatures,
    bounds: calculateBounds(initialFeatures),
    coordinateSystem: options.coordinateSystem
  });

  // Update features with new coordinate system
  useEffect(() => {
    if (options.coordinateSystem && options.coordinateSystem !== state.coordinateSystem) {
      const coordService = CoordinateSystemService.getInstance();
      coordService
        .transform(state.features, state.coordinateSystem!, options.coordinateSystem)
        .then(transformed => {
          setState(prev => ({
            ...prev,
            features: transformed,
            filteredFeatures: transformed,
            coordinateSystem: options.coordinateSystem
          }));
        })
        .catch(error => {
          console.error('Failed to transform coordinates:', error);
        });
    }
  }, [options.coordinateSystem]);

  const updateFeatures = useCallback((newFeatures: Feature[]) => {
    setState(prev => ({
      ...prev,
      features: newFeatures,
      filteredFeatures: newFeatures,
      bounds: calculateBounds(newFeatures)
    }));
  }, []);

  const filterFeatures = useCallback((predicate: (feature: Feature) => boolean) => {
    setState(prev => ({
      ...prev,
      filteredFeatures: prev.features.filter(predicate)
    }));
  }, []);

  const selectFeature = useCallback((feature: Feature | undefined) => {
    setState(prev => ({
      ...prev,
      selectedFeature: feature
    }));
  }, []);

  const setBounds = useCallback((bounds: FeatureState['bounds']) => {
    setState(prev => ({
      ...prev,
      bounds
    }));
  }, []);

  return {
    ...state,
    updateFeatures,
    filterFeatures,
    selectFeature,
    setBounds
  };
}

function calculateBounds(features: Feature[]): FeatureState['bounds'] | undefined {
  if (features.length === 0) {
    return undefined;
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };

  features.forEach(feature => {
    const coordinates = getAllCoordinates(feature);
    coordinates.forEach(([x, y]) => {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    });
  });

  return bounds;
}

function getAllCoordinates(feature: Feature): number[][] {
  const coords: number[][] = [];
  
  switch (feature.geometry.type) {
    case 'Point':
      coords.push(feature.geometry.coordinates);
      break;
    case 'LineString':
    case 'MultiPoint':
      coords.push(...feature.geometry.coordinates);
      break;
    case 'Polygon':
    case 'MultiLineString':
      feature.geometry.coordinates.forEach(line => {
        coords.push(...line);
      });
      break;
    case 'MultiPolygon':
      feature.geometry.coordinates.forEach(polygon => {
        polygon.forEach(line => {
          coords.push(...line);
        });
      });
      break;
  }

  return coords;
}
