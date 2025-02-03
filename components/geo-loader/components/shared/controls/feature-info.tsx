import React from 'react';
import { Feature, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon } from 'geojson';
import { ControlProps } from '../types';

interface FeatureInfoProps extends ControlProps {
  feature: Feature;
  onClose?: () => void;
  showGeometry?: boolean;
  showCoordinates?: boolean;
  showProperties?: boolean;
  onPropertyClick?: (key: string, value: any) => void;
}

export function FeatureInfo({
  feature,
  onClose,
  showGeometry = true,
  showCoordinates = true,
  showProperties = true,
  onPropertyClick,
  className = '',
  disabled = false
}: FeatureInfoProps) {
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const getGeometryInfo = (feature: Feature) => {
    const { type } = feature.geometry;
    switch (type) {
      case 'Point':
        return 'Point';
      case 'LineString':
        return `LineString (${feature.geometry.coordinates.length} points)`;
      case 'Polygon':
        return `Polygon (${feature.geometry.coordinates[0].length} vertices)`;
      case 'MultiPoint':
        return `MultiPoint (${feature.geometry.coordinates.length} points)`;
      case 'MultiLineString':
        return `MultiLineString (${feature.geometry.coordinates.length} lines)`;
      case 'MultiPolygon':
        return `MultiPolygon (${feature.geometry.coordinates.length} polygons)`;
      default:
        return type;
    }
  };

  const getCoordinatesPreview = (feature: Feature) => {
    const geometry = feature.geometry;
    const type = geometry.type;

    switch (type) {
      case 'Point': {
        const point = geometry as Point;
        return point.coordinates.join(', ');
      }
      case 'LineString': {
        const lineString = geometry as LineString;
        return `${lineString.coordinates.length} points`;
      }
      case 'MultiPoint': {
        const multiPoint = geometry as MultiPoint;
        return `${multiPoint.coordinates.length} points`;
      }
      case 'Polygon': {
        const polygon = geometry as Polygon;
        return `${polygon.coordinates.length} rings/lines`;
      }
      case 'MultiLineString': {
        const multiLineString = geometry as MultiLineString;
        return `${multiLineString.coordinates.length} rings/lines`;
      }
      case 'MultiPolygon': {
        const multiPolygon = geometry as MultiPolygon;
        return `${multiPolygon.coordinates.length} polygons`;
      }
      default:
        return 'Complex geometry';
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          Feature Information
        </h3>
        {onClose && !disabled && (
          <button
            type="button"
            className="text-gray-400 hover:text-gray-500"
            onClick={onClose}
          >
            <span className="sr-only">Close</span>
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Geometry Information */}
      {showGeometry && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-1">
            Geometry Type
          </h4>
          <p className="text-sm text-gray-500">{getGeometryInfo(feature)}</p>
        </div>
      )}

      {/* Coordinates Preview */}
      {showCoordinates && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-1">
            Coordinates
          </h4>
          <p className="text-sm text-gray-500">
            {getCoordinatesPreview(feature)}
          </p>
        </div>
      )}

      {/* Properties */}
      {showProperties && feature.properties && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Properties
          </h4>
          <div className="space-y-1">
            {Object.entries(feature.properties).map(([key, value]) => (
              <div
                key={key}
                className={`
                  flex justify-between items-center py-1 px-2 rounded
                  ${onPropertyClick && !disabled ? 'hover:bg-gray-50 cursor-pointer' : ''}
                `}
                onClick={() => onPropertyClick && !disabled && onPropertyClick(key, value)}
              >
                <span className="text-sm font-medium text-gray-600">{key}</span>
                <span className="text-sm text-gray-500">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
