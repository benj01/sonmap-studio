# 📂 modules

## Overview
This folder contains functional modules for reading and processing shapefiles, with a focus on efficient streaming and metadata extraction. The implementation includes support for all standard shapefile components and geometry types.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `shapefile-reader.ts` | Core module for reading shapefiles with support for metadata extraction, feature streaming, and sample generation. Handles companion files (DBF, PRJ) and provides comprehensive logging. |

## 🔗 Dependencies
- GeoJSON types for feature representation
- Shapefile parsing library
- Logging management system
- File system APIs
- Buffer handling utilities
- Stream processing utilities

## ⚙️ Usage Notes
- Supports streaming for memory-efficient processing
- Handles companion files (DBF, PRJ) automatically
- Provides metadata extraction without full file loading
- Includes feature sampling capabilities
- Supports all standard shapefile geometry types
- Comprehensive error handling and logging
- Handles empty and test files gracefully
- Provides projection information when available

## 🔄 Related Folders/Modules
- Logging system
- Error handling
- File processing utilities
- Geometry conversion
- Type definitions
- Feature processing
- Stream management

## 🚧 TODOs / Planned Improvements
- Add support for compressed shapefiles
- Implement parallel processing for large files
- Enhance memory optimization
- Add progress tracking for streams
- Implement caching mechanisms
- Add support for custom encodings
- Enhance error recovery strategies
- Add validation options