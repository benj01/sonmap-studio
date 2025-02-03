# 📂 postgis

## Overview
This folder contains utilities for converting shapefile data to PostGIS format, including geometry conversion, SQL generation for database operations, and import statistics calculation.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `postgis-converter.ts` | Implements conversion from shapefile records to PostGIS features, including geometry type conversion, SQL generation for table creation and indexing, and import statistics calculation. |

## 🔗 Dependencies
- GeoJSON types and interfaces
- PostGIS geometry types
- Shapefile type definitions
- Error handling system
- SQL generation utilities
- Database schema types
- JSON handling utilities

## ⚙️ Usage Notes
- Supports all standard shapefile geometry types
- Handles SRID management for geometries
- Generates optimized SQL for batch inserts
- Creates spatial indexes automatically
- Manages table schema and triggers
- Provides detailed import statistics
- Handles properties as JSONB data
- Includes timestamp management for records

## 🔄 Related Folders/Modules
- Shapefile type definitions
- Error handling system
- Database schema management
- Geometry type conversion
- SQL query generation
- Statistics calculation
- Data validation

## 🚧 TODOs / Planned Improvements
- Add support for custom column mappings
- Implement geometry simplification options
- Add support for additional geometry types
- Enhance batch insert performance
- Add transaction management
- Implement schema validation
- Add support for custom indexes
- Enhance statistics reporting