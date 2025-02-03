# 📂 processors

## Overview
This folder contains 3 file(s) related to file processing implementations for different geographic data formats.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `index.ts` | Central module for processor registration and exports. Manages processor implementations for different file formats (DXF, CSV, Shapefile) and provides convenient re-exports of all processor-related types and interfaces. |
| `re-processor.ts` | Feature processing utility focusing on geometry calculations and bounds determination. Includes sophisticated coordinate extraction and bounds calculation for various GeoJSON geometry types with comprehensive error handling and debugging. |
| `registry.ts` | Singleton registry for managing file processors. Provides processor registration, file type matching, format support detection, and centralized access to processing capabilities. Includes detailed logging and error handling. |

## 🔗 Dependencies
- GeoJSON types and utilities
- Base processor interfaces and types
- Logging system for debugging and error tracking
- Processor implementations for specific file formats (Shapefile, CSV, DXF)
- Geometry utility functions

## ⚙️ Usage Notes
- Processors are registered automatically on system initialization
- Supports multiple file formats including DXF, CSV, XYZ, TXT, and Shapefiles
- CSV processor handles multiple text-based format variants
- Registry provides automatic processor selection based on file type
- Includes comprehensive logging and error handling
- Processors can be extended for new file formats

## 🔄 Related Folders/Modules
- implementations/ - Format-specific processor implementations
- base/ - Core processor interfaces and types
- types/geojson - GeoJSON type definitions
- utils/geometry - Geometry calculation utilities
- logging/ - Logging system

## 🚧 TODOs / Planned Improvements
- Add support for additional file formats (KML, GML, etc.)
- Enhance bounds calculation performance for large datasets
- Implement batch processing capabilities
- Add validation for coordinate systems
- Improve error recovery mechanisms
- Add progress tracking for long-running operations