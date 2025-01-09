import {
  Feature,
  Geometry,
  GeoJsonProperties,
  Point,
  MultiPoint,
  LineString,
  MultiLineString,
  Polygon,
  MultiPolygon,
  GeometryCollection,
  Position
} from 'geojson';
import { 
  PostGISFeature, 
  PostGISGeometry,
  PostGISPoint,
  PostGISLineString,
  PostGISPolygon,
  PostGISMultiPoint,
  PostGISMultiLineString,
  PostGISMultiPolygon,
  PostGISGeometryCollection,
  PostGISPreview,
  PostGISFeatureCollection,
  isPostGISPoint,
  isPostGISMultiPoint,
  isPostGISLineString,
  isPostGISMultiLineString,
  isPostGISPolygon,
  isPostGISMultiPolygon,
  isPostGISGeometryCollection
} from '../types/postgis';
import { CoordinateSystemWithSRID } from '../types/bounds';

type GeoJSONGeometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon | GeometryCollection;

/**
 * Adapts PostGIS types to GeoJSON types and vice versa
 */
export class TypeAdapter {
  /**
   * Convert PostGIS geometry to GeoJSON geometry with proper type narrowing
   */
  private static convertGeometry(geometry: PostGISGeometry): GeoJSONGeometry {
    if (isPostGISPoint(geometry)) {
      return {
        type: 'Point',
        coordinates: geometry.coordinates
      };
    }

    if (isPostGISMultiPoint(geometry)) {
      return {
        type: 'MultiPoint',
        coordinates: geometry.coordinates
      };
    }

    if (isPostGISLineString(geometry)) {
      return {
        type: 'LineString',
        coordinates: geometry.coordinates
      };
    }

    if (isPostGISMultiLineString(geometry)) {
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates
      };
    }

    if (isPostGISPolygon(geometry)) {
      return {
        type: 'Polygon',
        coordinates: geometry.coordinates
      };
    }

    if (isPostGISMultiPolygon(geometry)) {
      return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates
      };
    }

    if (isPostGISGeometryCollection(geometry)) {
      return {
        type: 'GeometryCollection',
        geometries: geometry.geometries.map(g => this.convertGeometry(g))
      };
    }

    // This error will be thrown if none of the type guards match
    // This should never happen if the type system is working correctly
    throw new Error(`Invalid PostGIS geometry type: ${(geometry as any).type}`);
  }

  /**
   * Convert GeoJSON geometry to PostGIS geometry with type-safe coordinates
   */
  private static convertToPostGISGeometry(geometry: Geometry, srid: number = 4326): PostGISGeometry {
    const baseGeometry = {
      srid,
      wkt: '', // Will be set by database
    };

    if (geometry.type === 'Point') {
      const point: PostGISPoint = {
        ...baseGeometry,
        type: 'POINT',
        coordinates: geometry.coordinates as [number, number]
      };
      return point;
    }

    if (geometry.type === 'LineString') {
      const lineString: PostGISLineString = {
        ...baseGeometry,
        type: 'LINESTRING',
        coordinates: geometry.coordinates as [number, number][]
      };
      return lineString;
    }

    if (geometry.type === 'Polygon') {
      const polygon: PostGISPolygon = {
        ...baseGeometry,
        type: 'POLYGON',
        coordinates: geometry.coordinates as [number, number][][]
      };
      return polygon;
    }

    if (geometry.type === 'MultiPoint') {
      const multiPoint: PostGISMultiPoint = {
        ...baseGeometry,
        type: 'MULTIPOINT',
        coordinates: geometry.coordinates as [number, number][]
      };
      return multiPoint;
    }

    if (geometry.type === 'MultiLineString') {
      const multiLineString: PostGISMultiLineString = {
        ...baseGeometry,
        type: 'MULTILINESTRING',
        coordinates: geometry.coordinates as [number, number][][]
      };
      return multiLineString;
    }

    if (geometry.type === 'MultiPolygon') {
      const multiPolygon: PostGISMultiPolygon = {
        ...baseGeometry,
        type: 'MULTIPOLYGON',
        coordinates: geometry.coordinates as [number, number][][][]
      };
      return multiPolygon;
    }

    if (geometry.type === 'GeometryCollection') {
      const collection: PostGISGeometryCollection = {
        ...baseGeometry,
        type: 'GEOMETRYCOLLECTION',
        geometries: (geometry as GeometryCollection).geometries.map(g => 
          this.convertToPostGISGeometry(g, srid)
        )
      };
      return collection;
    }

    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  /**
   * Convert PostGIS feature to GeoJSON feature
   */
  static toGeoJSON(feature: PostGISFeature): Feature<Geometry, GeoJsonProperties> {
    return {
      type: 'Feature',
      id: feature.id,
      geometry: this.convertGeometry(feature.geometry),
      properties: {
        ...feature.properties,
        layerId: feature.layerId
      }
    };
  }

  /**
   * Convert GeoJSON feature to PostGIS feature
   */
  static toPostGIS(feature: Feature<Geometry, GeoJsonProperties>, srid: number = 4326): PostGISFeature {
    const layerId = feature.properties?.layerId as string;
    if (!layerId) {
      throw new Error('Feature missing required layerId property');
    }

    return {
      type: 'Feature',
      id: feature.id as string,
      layerId,
      geometry: this.convertToPostGISGeometry(feature.geometry, srid),
      properties: feature.properties || {}
    };
  }

  /**
   * Convert array of PostGIS features to GeoJSON features
   */
  static toGeoJSONArray(features: PostGISFeature[]): Array<Feature<Geometry, GeoJsonProperties>> {
    return features.map(f => this.toGeoJSON(f));
  }

  /**
   * Convert array of GeoJSON features to PostGIS features
   */
  static toPostGISArray(features: Array<Feature<Geometry, GeoJsonProperties>>, srid: number = 4326): PostGISFeature[] {
    return features.map(f => this.toPostGIS(f, srid));
  }

  /**
   * Convert coordinate system to PostGIS format
   */
  static toPostGISCoordinateSystem(system: any): CoordinateSystemWithSRID {
    return {
      name: system.name || 'Unknown',
      code: system.code,
      srid: system.srid || 4326,
      units: system.units,
      description: system.description
    };
  }

  /**
   * Create PostGIS preview collection
   */
  static createPreview(features: PostGISFeature[]): PostGISPreview {
    const collection: PostGISFeatureCollection = {
      type: 'FeatureCollection',
      id: 'preview',
      name: 'Preview Collection',
      description: 'Generated preview of imported features',
      srid: features[0]?.geometry.srid || 4326,
      properties: {},
      features: features.slice(0, 100) // Limit preview size
    };

    return {
      type: 'PostGISFeatureCollection',
      collection,
      features: features.slice(0, 100)
    };
  }
}
