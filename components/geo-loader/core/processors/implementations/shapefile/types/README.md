# 📂 types

## Overview
This folder contains type definitions for shapefile record structures, providing strongly-typed interfaces for handling shapefile data, geometry, and attributes.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `records.ts` | Defines core type interfaces for shapefile records, including record structure, geometry data, and attribute handling. Provides typing for both geometric and attribute data with comprehensive bounding box support. |

## 🔗 Dependencies
- GeoJSON Position types
- Base type definitions
- Geometry type interfaces
- Attribute type definitions
- Bounding box types

## ⚙️ Usage Notes
- Provides strict typing for shapefile records
- Supports all shapefile geometry types
- Includes comprehensive bounding box definitions
- Handles both 2D and 3D coordinates
- Supports M-values in geometries
- Flexible attribute type handling
- Record number tracking built-in
- Compatible with GeoJSON position types

## 🔄 Related Folders/Modules
- Shapefile processing
- Geometry conversion
- Attribute handling
- Record parsing
- Data validation
- File processing
- Type conversion utilities

## 🚧 TODOs / Planned Improvements
- Add validation type guards
- Extend support for complex geometries
- Add type conversion utilities
- Enhance documentation comments
- Add serialization interfaces
- Include more specific attribute types
- Add geometry type constants
- Implement type testing utilities