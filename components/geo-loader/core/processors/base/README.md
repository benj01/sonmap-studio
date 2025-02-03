# 📂 base

## Overview
This folder contains 5 file(s) related to base processor functionality, providing core interfaces and implementations for geographic data processing.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `base-processor.ts` | Abstract base processor class implementing common functionality for file processing. Includes memory management, coordinate system handling, progress tracking, and feature transformation capabilities. |
| `interfaces.ts` | Comprehensive interface definitions for the processing system. Defines core interfaces for processors, event handling, file parsing, coordinate transformation, and PostGIS operations. |
| `processor.ts` | Base geo processor implementation and interface definition. Provides abstract base class with common functionality for file processing, analysis, and sampling. |
| `registry.ts` | Processor registry implementation managing available processors. Handles processor registration, file type matching, and processor instantiation with logging support. |
| `types.ts` | Type definitions for the processing system, including processor results, options, events, errors, and data structures. Contains comprehensive types for file processing and database operations. |

## 🔗 Dependencies
- GeoJSON types and utilities
- Memory management utilities
- Logging system
- Coordinate system manager
- PostGIS client for database operations
- Compression handler
- Error handling utilities

## ⚙️ Usage Notes
- Base classes provide common functionality for specific format implementations
- Memory management includes automatic cleanup and monitoring
- Progress tracking and event emission built-in
- Coordinate system detection and transformation supported
- Transaction management for database operations
- Comprehensive error handling and validation
- Support for streaming large datasets

## 🔄 Related Folders/Modules
- implementations/ - Format-specific processor implementations
- compression/ - Data compression utilities
- memory/ - Memory management utilities
- errors/ - Error handling system
- logging/ - Logging functionality
- coordinate-systems/ - Coordinate system management

## 🚧 TODOs / Planned Improvements
- Add support for more coordinate systems
- Enhance memory management for very large files
- Implement more sophisticated progress tracking
- Add support for parallel processing
- Improve error recovery mechanisms
- Enhance streaming capabilities
- Add more comprehensive validation options