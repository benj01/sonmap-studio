# 📂 parsers

## Overview
This folder contains 5 file(s) related to DXF file parsing, providing specialized parsers for different DXF file sections and entities.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `block-parser.ts` | Parser for DXF block definitions. Handles block extraction, validation, and reference management with comprehensive property handling. Includes utilities for block lookup and validation. |
| `dxf-parser-wrapper.ts` | Core wrapper around the dxf-parser library. Manages initialization, parsing, and conversion of DXF content to internal structures. Includes extensive debug logging and validation checks. |
| `entity-parser.ts` | Parser for DXF entities with support for various entity types (points, lines, polylines, etc.). Handles coordinate parsing, attribute extraction, and conversion to GeoJSON features. |
| `header-parser.ts` | Parser for DXF header section. Extracts essential file metadata including extents and measurement systems. Provides type-safe header property access. |
| `layer-parser.ts` | Parser for DXF layer definitions. Handles layer extraction, property parsing, and validation. Includes support for layer flags, colors, and line types. |

## 🔗 Dependencies
- dxf-parser library
- GeoJSON types and interfaces
- Regex pattern utilities
- Validation utilities
- Structure validators
- Type definitions
- Geometry conversion utilities
- Debug logging system

## ⚙️ Usage Notes
- Comprehensive error handling
- Detailed debug logging
- Group code parsing
- Section detection
- Entity type validation
- Coordinate system handling
- Memory-efficient parsing
- Layer management
- Block reference handling
- Geometry conversion

## 🔄 Related Folders/Modules
- utils/ - Parsing utilities
- modules/ - Processing modules
- types/ - Type definitions
- errors/ - Error handling
- validation/ - Validation utilities
- regex/ - Pattern matching
- coordinate-systems/ - Coordinate handling
- geometry/ - Geometry utilities

## 🚧 TODOs / Planned Improvements
- Enhance memory efficiency for large files
- Add support for more entity types
- Improve error recovery mechanisms
- Add streaming parser support
- Enhance validation coverage
- Optimize regex patterns
- Add more geometry types
- Improve block handling