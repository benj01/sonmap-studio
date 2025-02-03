# 📂 utils

## Overview
This folder contains utility classes and functions for DXF file processing, geometry transformation, and PostGIS integration. The utilities handle block management, layer management, coordinate transformations, file streaming, and type conversions.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `block-manager.ts` | Manages DXF blocks and their transformations, including parsing block definitions, handling block references, and maintaining a block cache. |
| `entity-parser.ts` | Re-exports entity parsing functionality from the modular implementation. |
| `layer-manager.ts` | Manages DXF layers and their states, including visibility, freezing, and locking. Handles layer parsing and property management. |
| `matrix-transformer.ts` | Provides matrix transformation utilities for DXF entities and blocks, including rotation, scaling, and translation operations. |
| `regex-patterns.ts` | Contains regex patterns and functions for cleaning and parsing DXF content, including section finding and group code parsing. |
| `stream-reader.ts` | Implements memory-efficient streaming for DXF file reading with chunk processing and memory management. |
| `type-adapter.ts` | Handles conversion between PostGIS and GeoJSON types, with comprehensive type safety and validation. |

## 🔗 Dependencies
- GeoJSON types and interfaces
- PostGIS geometry types
- File system and streaming APIs
- Matrix manipulation utilities
- Error handling types
- Vector and coordinate system types

## ⚙️ Usage Notes
- Block manager supports nested block references with configurable max nesting level
- Layer manager maintains state for visibility, freezing, and locking
- Stream reader processes files in configurable chunk sizes with memory limits
- Matrix transformer supports compound transformations
- Type adapter ensures type safety in geometry conversions
- All managers implement caching for performance optimization

## 🔄 Related Folders/Modules
- DXF processing pipeline
- Geometry conversion system
- PostGIS database integration
- File handling services
- Error handling system

## 🚧 TODOs / Planned Improvements
- Add comprehensive unit tests for matrix transformations
- Implement more efficient block caching strategy
- Add support for additional DXF entity types
- Optimize memory usage in stream processing
- Add batch processing capabilities
- Improve error handling and recovery