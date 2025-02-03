# 📂 core

## Overview
This folder contains the core implementation of the Shapefile processing system, providing robust parsing, validation, and analysis capabilities. The system uses a combination of TypeScript and WebAssembly for high-performance geometry processing and validation, with comprehensive error handling and memory management.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `analysis-manager.ts` | Manages shapefile structure analysis, including component file handling, header parsing, and preview record generation. |
| `constants.ts` | Defines shared constants for shapefile processing, used by both TypeScript and WebAssembly code. |
| `file-handler.ts` | Handles shapefile component file management and validation, including DBF, SHX, and PRJ files. |
| `geometry-converter.ts` | Provides geometry conversion between shapefile records and GeoJSON features with validation and coordinate transformations. |
| `header-parser.ts` | Implements shapefile header parsing with validation and type detection for different geometry types. |
| `record-parser.ts` | Handles parsing of individual shapefile records with support for all geometry types and coordinate validation. |
| `stream-manager.ts` | Manages streaming of shapefile records and features with memory-efficient processing and batching capabilities. |
| `validator.ts` | Implements comprehensive validation using WebAssembly for high-performance geometry and structure validation. |
| `wasm-bridge.ts` | Provides TypeScript-WebAssembly bridge for geometry operations and validation with proper initialization handling. |

## 🔗 Dependencies
- WebAssembly module for geometry processing
- GeoJSON types and interfaces
- File system API
- Error handling system
- Memory management utilities
- Coordinate system types
- Logging functionality

## ⚙️ Usage Notes
- Supports all standard Shapefile geometry types
- Uses WebAssembly for performance-critical operations
- Implements memory-efficient streaming
- Provides comprehensive validation
- Handles Swiss and WGS84 coordinate systems
- Supports batch processing for large files
- Includes detailed error logging and recovery
- Manages component file relationships

## 🔄 Related Folders/Modules
- Shapefile type definitions
- Error handling system
- Memory management system
- Coordinate system management
- WebAssembly modules
- Logging framework
- File I/O utilities

## 🚧 TODOs / Planned Improvements
- Optimize WebAssembly memory usage
- Add support for compressed shapefiles
- Enhance coordinate system detection
- Implement parallel processing capabilities
- Add support for more complex geometries
- Improve error recovery mechanisms
- Enhance streaming performance
- Add geometry simplification options