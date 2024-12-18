import { useState, useCallback, useEffect } from 'react';
import { ViewStateChangeEvent } from 'react-map-gl';
import { Feature, BBox, Geometry, Position } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem, Bounds } from '../types/coordinates';
import { ViewState, UseMapViewResult } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import proj4 from 'proj4';

const DEFAULT_PADDING = 0.1; // 10% padding
const MIN_ZOOM = 1;
const MAX_ZOOM = 20;
const SWISS_CENTER = { longitude: 8.2275, latitude: 46.8182, zoom: 7 };

type Coordinates = Position | Position[] | Position[][] | Position[][][];

export function useMapView(
  initialBounds?: Bounds,
  coordinateSystem: CoordinateSystem = COORDINATE_SYSTEMS.WGS84
): UseMapViewResult {
  const [viewState, setViewState] = useState<ViewState>({
    longitude: 0,
    latitude: 0,
    zoom: 1,
    bearing: 0,
    pitch: 0
  });

  // Verify coordinate system is registered
  useEffect(() => {
    if (coordinateSystem && !proj4.defs(coordinateSystem)) {
      console.error(`Coordinate system ${coordinateSystem} is not registered with proj4`);
      // Set a default view of Switzerland if we're using Swiss coordinates
      if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
          coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03) {
        setViewState(prev => ({
          ...prev,
          ...SWISS_CENTER
        }));
      }
    }
  }, [coordinateSystem]);

  const processCoordinates = useCallback((
    coords: Coordinates,
    updateBounds: (lon: number, lat: number) => void
  ) => {
    if (!Array.isArray(coords)) return;

    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords as Position;
      updateBounds(lon, lat);
    } else {
      (coords as any[]).forEach(coord => processCoordinates(coord as Coordinates, updateBounds));
    }
  }, []);

  const calculateBoundsFromFeatures = useCallback((features: Feature[]): Bounds | null => {
    if (!features.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (lon: number, lat: number) => {
      if (isFinite(lon) && isFinite(lat)) {
        minX = Math.min(minX, lon);
        minY = Math.min(minY, lat);
        maxX = Math.max(maxX, lon);
        maxY = Math.max(maxY, lat);
      }
    };

    features.forEach(feature => {
      const geometry = feature.geometry;
      switch (geometry.type) {
        case 'Point':
          updateBounds(geometry.coordinates[0], geometry.coordinates[1]);
          break;
        case 'MultiPoint':
        case 'LineString':
          geometry.coordinates.forEach(coord => {
            updateBounds(coord[0], coord[1]);
          });
          break;
        case 'MultiLineString':
        case 'Polygon':
          geometry.coordinates.forEach(line => {
            line.forEach(coord => {
              updateBounds(coord[0], coord[1]);
            });
          });
          break;
        case 'MultiPolygon':
          geometry.coordinates.forEach(poly => {
            poly.forEach(line => {
              line.forEach(coord => {
                updateBounds(coord[0], coord[1]);
              });
            });
          });
          break;
        case 'GeometryCollection':
          geometry.geometries.forEach(geom => {
            if ('coordinates' in geom) {
              processCoordinates(geom.coordinates as Coordinates, updateBounds);
            }
          });
          break;
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }, [processCoordinates]);

  const updateViewFromBounds = useCallback((bounds: Bounds, padding: number = DEFAULT_PADDING) => {
    try {
      // Verify coordinate system is registered before attempting transformation
      if (coordinateSystem && !proj4.defs(coordinateSystem)) {
        throw new Error(`Coordinate system ${coordinateSystem} is not registered with proj4`);
      }

      let transformedBounds = bounds;
      
      // Only transform if we're not already in WGS84
      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          const transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
          const result = transformer.transformBounds(bounds);
          if (!result) {
            throw new Error(`Failed to transform bounds from ${coordinateSystem} to WGS84`);
          }
          transformedBounds = result;
        } catch (error) {
          console.error('Coordinate transformation error:', error);
          // If transformation fails, try to use original bounds but constrained to valid ranges
          transformedBounds = {
            minX: Math.max(Math.min(bounds.minX, 180), -180),
            minY: Math.max(Math.min(bounds.minY, 90), -90),
            maxX: Math.max(Math.min(bounds.maxX, 180), -180),
            maxY: Math.max(Math.min(bounds.maxY, 90), -90)
          };
        }
      }

      // Add padding
      const width = transformedBounds.maxX - transformedBounds.minX;
      const height = transformedBounds.maxY - transformedBounds.minY;
      const padX = width * padding;
      const padY = height * padding;

      transformedBounds = {
        minX: transformedBounds.minX - padX,
        minY: transformedBounds.minY - padY,
        maxX: transformedBounds.maxX + padX,
        maxY: transformedBounds.maxY + padY
      };

      // Constrain to valid WGS84 ranges
      const validMinLat = Math.max(transformedBounds.minY, -85);
      const validMaxLat = Math.min(transformedBounds.maxY, 85);
      const validMinLon = Math.max(transformedBounds.minX, -180);
      const validMaxLon = Math.min(transformedBounds.maxX, 180);

      // Calculate center point
      const center = {
        lng: (validMinLon + validMaxLon) / 2,
        lat: (validMinLat + validMaxLat) / 2
      };

      // Calculate zoom level based on bounds size
      const latZoom = Math.log2(360 / (validMaxLat - validMinLat)) - 1;
      const lonZoom = Math.log2(360 / (validMaxLon - validMinLon)) - 1;
      let zoom = Math.min(latZoom, lonZoom);

      // Adjust zoom for coordinate system
      if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
          coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03) {
        // For Swiss coordinates, adjust zoom based on meter-based scale
        const metersPerPixel = width / 900; // Assuming 900px viewport width
        zoom = Math.log2(40075016.686 / (metersPerPixel * Math.cos(center.lat * Math.PI / 180) * 256));
      }

      // Ensure zoom is within valid range and add slight zoom out for context
      zoom = Math.min(Math.max(zoom - 0.5, MIN_ZOOM), MAX_ZOOM);

      setViewState(prev => ({
        ...prev,
        longitude: center.lng,
        latitude: center.lat,
        zoom
      }));
    } catch (error) {
      console.error('Error setting map view state:', error);
      // Set a default view of Switzerland if we're using Swiss coordinates
      if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
          coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03) {
        setViewState(prev => ({
          ...prev,
          ...SWISS_CENTER
        }));
      }
      throw error;
    }
  }, [coordinateSystem]);

  const focusOnFeatures = useCallback((features: Feature[], padding: number = DEFAULT_PADDING * 100) => {
    const bounds = calculateBoundsFromFeatures(features);
    if (bounds) {
      updateViewFromBounds(bounds, padding / 100);
    }
  }, [calculateBoundsFromFeatures, updateViewFromBounds]);

  const onMove = useCallback((evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState as ViewState);
  }, []);

  const getViewportBounds = useCallback((): BBox | undefined => {
    if (!viewState) return undefined;

    const { longitude, latitude, zoom } = viewState;
    
    // Calculate viewport bounds based on zoom level
    const latRange = 360 / Math.pow(2, zoom + 1);
    const lonRange = 360 / Math.pow(2, zoom);
    
    return [
      longitude - lonRange / 2,  // minLon
      latitude - latRange / 2,   // minLat
      longitude + lonRange / 2,  // maxLon
      latitude + latRange / 2    // maxLat
    ];
  }, [viewState]);

  // Initialize view when bounds change
  useEffect(() => {
    if (initialBounds) {
      updateViewFromBounds(initialBounds);
    }
  }, [initialBounds, updateViewFromBounds]);

  return {
    viewState,
    onMove,
    updateViewFromBounds,
    focusOnFeatures,
    getViewportBounds
  };
}
