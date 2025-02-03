# 📂 converters

## Overview
This folder contains format converters for transforming shapefile records between different geometry formats, including GeoJSON and PostGIS. The converters provide robust validation, error handling, and support for various geometry types with comprehensive coordinate and structure verification.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `geojson.ts` | Implements bidirectional conversion between Shapefile records and GeoJSON features, with support for all geometry types, coordinate validation, and error recovery. |
| `index.ts` | Entry point that exports the conversion functionality for GeoJSON and PostGIS formats. |
| `postgis.ts` | Handles conversion of Shapefile records to PostGIS format, including geometry transformation and batch processing support. |

## 🔗 Dependencies
- GeoJSON types and interfaces
- PostGIS geometry types
- Shapefile record types
- Base geometry types
- Coordinate system types
- Logging functionality

## ⚙️ Usage Notes
- Supports all standard geometry types (Point, LineString, Polygon, MultiPoint)
- Implements robust coordinate validation
- Handles multi-part geometries
- Provides detailed error logging and recovery
- Supports batch processing for PostGIS conversions
- Maintains bbox information during conversions
- Includes comprehensive type checking and validation

## 🔄 Related Folders/Modules
- Shapefile processing system
- PostGIS integration
- Type definitions
- Logging system
- Error handling
- Geometry validation

## 🚧 TODOs / Planned Improvements
- Add support for additional geometry types
- Implement conversion streaming for large datasets
- Add coordinate system transformation during conversion
- Enhance error recovery mechanisms
- Add geometry simplification options
- Implement geometry repair capabilities
- Add support for 3D geometries
- Optimize batch processing for large datasets