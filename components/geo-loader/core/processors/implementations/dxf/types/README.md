# 📂 types

## Overview
This folder contains TypeScript type definitions and interfaces for geometry processing, coordinate systems, and PostGIS integration. It provides type safety and structure for handling geographic data, coordinate transformations, and database operations.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `bounds.ts` | Defines interfaces for geometric bounds, coordinate systems with SRID, and compressed DXF file handling. |
| `coordinate-system.ts` | Implements PostGIS coordinate system types and utilities, including SRID mappings and conversion functions for different coordinate systems (WGS84, Swiss LV95, Swiss LV03). |
| `database.ts` | Contains interfaces for database import operations, including result tracking and statistics. |
| `postgis.ts` | Comprehensive PostGIS type definitions and utilities, including geometry types, feature collections, and import/export interfaces. |
| `stream.ts` | Defines interfaces for stream processing state and statistics tracking during data processing operations. |

## 🔗 Dependencies
- TypeScript type system
- GeoJSON compatibility types
- PostGIS database types
- Vector and coordinate system types from parent modules

## ⚙️ Usage Notes
- All geometry types are strictly typed for type safety
- PostGIS geometries include SRID tracking for coordinate system awareness
- Coordinate system conversions handle WGS84, Swiss LV95, and Swiss LV03
- Stream processing includes detailed progress and error tracking
- Feature collections maintain GeoJSON compatibility

## 🔄 Related Folders/Modules
- Geometry processing modules
- Database integration layers
- DXF processing utilities
- Coordinate transformation services
- Stream processing handlers

## 🚧 TODOs / Planned Improvements
- Add validation schemas for each interface
- Expand coordinate system support beyond current systems
- Implement additional geometry type guards
- Add comprehensive JSDocs for all interfaces
- Consider adding serialization utilities for complex types