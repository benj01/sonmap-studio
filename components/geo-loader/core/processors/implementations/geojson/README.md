# 📂 geojson

## Overview
This folder contains the GeoJSON processing implementation for handling geographic data in GeoJSON format. The processor provides functionality for analyzing, sampling, and transforming GeoJSON files with support for coordinate system transformations and large file streaming.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `processor.ts` | Implements GeoJSON file processing with features including metadata extraction, feature sampling, coordinate system detection and transformation, and memory-efficient streaming for large files. |

## 🔗 Dependencies
- GeoJSON types from `geojson` package
- BaseProcessor from base processing framework
- File system utilities (`fs`)
- LogManager for logging functionality
- Processing interfaces and types from base module

## ⚙️ Usage Notes
- Supports both .geojson and .json file extensions
- Handles large files through streaming with configurable sample sizes
- Default sample size is 1000 features
- Automatically detects and transforms coordinate systems
- Includes progress tracking and cancellation support
- Maintains schema detection for feature properties
- Memory-efficient processing for large datasets

## 🔄 Related Folders/Modules
- Base processing framework
- Coordinate system transformation services
- Logging system
- Feature processing pipeline
- File handling utilities

## 🚧 TODOs / Planned Improvements
- Implement batch processing for multiple files
- Add support for GeoJSON Feature Collections with multiple layers
- Optimize memory usage for very large files
- Add validation for GeoJSON format compliance
- Implement more sophisticated property type detection
- Add support for complex CRS definitions
- Consider adding compression support for large files