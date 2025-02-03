# 📂 services

## Overview
This folder contains 1 file(s) related to DXF entity conversion services, providing specialized conversion functionality for various DXF entity types.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `entity-converter.ts` | Specialized service for converting raw DXF entities to internal format. Handles complex entity types including LWPOLYLINE, LINE, POINT, CIRCLE, ARC, ELLIPSE, SPLINE, and TEXT. Features robust attribute extraction, vertex handling, and comprehensive validation. |

## 🔗 Dependencies
- DXF entity type definitions
- Vector types and interfaces
- Point validation utilities
- Type checking utilities
- Entity type guards
- Geometry conversion helpers

## ⚙️ Usage Notes
- Supports multiple entity types
- Handles various coordinate formats
- Robust vertex extraction
- Attribute normalization
- Fallback handling for raw DXF data
- Comprehensive error handling
- Type-safe conversions
- Validation at each step

## 🔄 Related Folders/Modules
- types/ - Entity type definitions
- utils/ - Point utilities
- parsers/ - DXF parsing
- validation/ - Entity validation
- geometry/ - Geometry handling
- converters/ - Format converters

## 🚧 TODOs / Planned Improvements
- Add support for more entity types
- Enhance vertex extraction robustness
- Improve error reporting
- Add validation for complex geometries
- Optimize LWPOLYLINE handling
- Add support for custom attributes
- Enhance type safety
- Add conversion caching