# 📂 src

## Overview
This folder contains the core Rust source code for the WebAssembly-based shapefile processing library. It provides functionality for parsing, validating, and converting shapefile geometry data to GeoJSON format with a focus on Swiss coordinate systems.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `geojson.rs` | Implements GeoJSON data structures and serialization for various geometry types (Point, MultiPoint, LineString, Polygon, etc.). Provides builder methods for creating GeoJSON objects from coordinate data. |
| `geometry.rs` | Core geometry processing functions including coordinate bounds calculation, ring orientation detection, and conversion between shapefile geometry and GeoJSON formats. Includes comprehensive bounds checking for Swiss LV95 coordinates. |
| `lib.rs` | Main library entry point that exposes the WebAssembly interface. Defines the ShapefileProcessor struct and implements geometry processing functions. Provides re-exports of public functionality and initializes error handling. |
| `validation.rs` | Comprehensive validation functions for shapefile format compliance, including header verification, coordinate bounds checking, and geometry type validation. Implements specific validation for Swiss coordinate systems. |

## 🔗 Dependencies
- wasm-bindgen: WebAssembly binding generation and JavaScript interop
- serde: Serialization support for GeoJSON output
- serde-wasm-bindgen: WebAssembly-specific serialization
- console_error_panic_hook: Improved error handling in browser environment

## ⚙️ Usage Notes
- Initialize library with `ShapefileProcessor::new()`
- All geometry coordinates are validated against Swiss LV95 bounds
- GeoJSON output follows RFC 7946 specification
- Error messages are detailed and include context for debugging
- Ring orientation is automatically detected and preserved
- Comprehensive validation is performed on all inputs

## 🔄 Related Folders/Modules
- `wasm/`: Build configuration and output
- `pkg/`: Compiled WebAssembly and JavaScript bindings
- JavaScript/TypeScript applications consuming the library

## 🚧 TODOs / Planned Improvements
- Add support for additional shapefile types (MultiPatch, etc.)
- Implement coordinate system transformation
- Add batch processing capabilities
- Improve memory efficiency for large files
- Add support for attribute data
- Implement shapefile writing capabilities
- Add optional validation relaxation for non-Swiss coordinates
- Enhance error reporting with line numbers and context