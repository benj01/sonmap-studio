# 📂 shapefile

## Overview
This folder contains utilities for processing ESRI Shapefiles, including companion file handling, parsing, coordinate system detection, and memory-efficient processing. The implementation supports both standard and worker-based processing with comprehensive error handling and validation.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `companion-handler.ts` | Manages Shapefile companion files (DBF, SHX, PRJ), handles file discovery and validation. |
| `parser.ts` | Core Shapefile parsing implementation with support for all geometry types, coordinate validation, and error recovery. |
| `processor.ts` | Main Shapefile processing logic including analysis, sampling, and full file processing with coordinate system detection. |
| `types.ts` | Type definitions for Shapefile structures, records, processor options, and analysis results. |
| `worker-processor.ts` | Worker-based implementation for memory-efficient processing of large Shapefiles with automatic resource management. |

## 🔗 Dependencies
- GeoJSON types and interfaces
- Base processor framework
- Coordinate system manager
- Memory management utilities
- Worker thread infrastructure
- Error handling system
- Logging functionality

## ⚙️ Usage Notes
- Supports standard Shapefile formats (.shp, .dbf, .shx, .prj)
- Handles all standard geometry types (Point, Polyline, Polygon, MultiPoint)
- Provides memory-efficient processing for large files
- Implements automatic coordinate system detection
- Includes progress tracking and error recovery
- Supports both synchronous and worker-based processing
- Validates geometry and coordinates during parsing

## 🔄 Related Folders/Modules
- Base processing framework
- Coordinate system management
- Memory monitoring system
- Worker thread management
- Error handling framework
- Logging system
- File I/O utilities

## 🚧 TODOs / Planned Improvements
- Add support for compressed Shapefiles
- Implement streaming processing for very large files
- Add advanced geometry repair capabilities
- Enhance coordinate system detection accuracy
- Improve memory usage optimization
- Add support for additional Shapefile extensions
- Implement batch processing capabilities