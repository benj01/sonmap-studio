# 📂 modules

## Overview
This folder contains 9 file(s) related to DXF processing modules, providing core functionality for analyzing, transforming, and managing DXF entities with PostGIS integration.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `analyzer.ts` | DXF analysis module for coordinate system detection and bounds calculation. Features sophisticated coordinate range analysis and confidence-based system detection. |
| `coordinate-handler.ts` | Manages coordinate system transformations and validations. Handles initialization, verification, and coordinate system conversions with debug logging. |
| `database-manager.ts` | PostGIS database operations manager for DXF data. Handles feature collections, layer management, and batch imports with transaction support. |
| `entity-processor.ts` | Processes DXF entities into GeoJSON features. Provides comprehensive validation, geometry conversion, and property handling with detailed logging. |
| `file-processor.ts` | Core file processing implementation with chunk-based handling. Manages file parsing, validation, and coordinate system detection. |
| `layer-processor.ts` | Layer management module with caching and validation. Handles layer extraction, system layer filtering, and attribute management. |
| `postgis-converter.ts` | Converts DXF entities to PostGIS geometries. Implements sophisticated geometry transformations including arcs, ellipses, and splines. |
| `state-manager.ts` | Manages processing state and statistics tracking. Handles feature counts, transformations, and error tracking with system property filtering. |
| `transformer.ts` | Coordinate transformation implementation with detailed validation. Handles entity-specific transformations and bounds conversion with comprehensive error handling. |

## 🔗 Dependencies
- PostGIS database client
- Coordinate system manager
- GeoJSON types and utilities
- Stream processing base classes
- Error handling system
- Logging utilities
- Geometry transformation libraries
- UUID generation for feature IDs

## ⚙️ Usage Notes
- Comprehensive coordinate system handling
- Memory-efficient chunk processing
- Layer-based organization
- Detailed debug logging
- Transaction management
- Error tracking and validation
- Geometry interpolation for curves
- Cache management for layers
- Progress tracking and statistics

## 🔄 Related Folders/Modules
- types/ - Type definitions
- errors/ - Error handling
- coordinate-systems/ - Coordinate transformations
- parsers/ - DXF parsing
- utils/ - Utility functions
- stream/ - Stream processing
- compression/ - File compression
- preview/ - Preview generation

## 🚧 TODOs / Planned Improvements
- Implement parallel processing for large files
- Add more coordinate system validations
- Enhance geometry interpolation accuracy
- Optimize batch processing performance
- Add more sophisticated caching strategies
- Improve error recovery mechanisms
- Enhance memory management for large files
- Add support for more complex geometry types