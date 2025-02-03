# 📂 core

## Overview
This folder contains 5 file(s) related to core functionality for geographic data processing, caching, error handling, and file management.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `cache-manager.ts` | Singleton manager for caching coordinate transformations and preview generation. Implements memory-efficient caching with TTL, size limits, and statistics tracking. Features automatic cache pruning and hit rate monitoring. |
| `error-manager.ts` | Global error management system for geographic operations. Provides structured error logging with severity levels, context tracking, and error grouping. Includes features for error filtering, summaries, and automatic cleanup of old errors. |
| `feature-manager.ts` | Memory-efficient manager for geographic features with chunking and streaming support. Handles large datasets through batched processing, visibility management, and memory monitoring. Includes comprehensive debugging and statistics. |
| `file-type-config.ts` | Configuration manager for different geographic file types. Defines companion file requirements, validates file relationships, and provides MIME type mapping for various geo-spatial formats like Shapefiles, DXF, and CSV. |
| `stream-processor.ts` | Base class for processing large geographic files through streaming. Implements chunk-based processing with memory monitoring, progress tracking, and cancellation support. Handles coordinate system transformations and feature collection. |

## 🔗 Dependencies
- GeoJSON types and utilities
- Performance monitoring APIs
- File system and streaming utilities
- Core coordinate system management
- Error handling types and interfaces

## ⚙️ Usage Notes
- All managers implemented as singletons for global state management
- Memory-efficient processing with automatic garbage collection
- Comprehensive error tracking and reporting system
- Support for multiple geographic file formats
- Built-in memory monitoring and usage limitations
- Automatic cache management and cleanup

## 🔄 Related Folders/Modules
- types/errors - Error type definitions
- types/coordinates - Coordinate system types
- types/geo - Geographic data types
- processors - Data processing implementations
- preview - Preview generation system

## 🚧 TODOs / Planned Improvements
- Implement more sophisticated memory management strategies
- Add support for additional geographic file formats
- Enhance streaming performance for very large datasets
- Improve error recovery mechanisms
- Add more detailed performance metrics
- Implement cross-browser memory monitoring