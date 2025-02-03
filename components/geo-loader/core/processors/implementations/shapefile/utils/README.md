# 📂 utils

## Overview
This folder contains utility modules for processing and analyzing geospatial data files, particularly focusing on Shapefile format components (DBF, PRJ, SHX) and related calculations.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `bounds.ts` | Provides functions for calculating and managing geographical bounds from shapefile records and GeoJSON features. Includes utilities for calculating bounds from single features, updating bounds with new records, and handling coordinate pairs. |
| `dbf-reader.ts` | Implements a reader for DBF (dBase) files, handling the parsing of headers, field descriptors, and records. Includes type conversion utilities for various DBF field types (numeric, logical, date, character). |
| `prj-reader.ts` | Handles reading and parsing of PRJ (projection) files to detect coordinate systems. Includes support for various coordinate systems including Swiss LV95, Swiss LV03, and WGS84, with WKT projection string parsing. |
| `shx-reader.ts` | Manages reading and parsing of SHX (shape index) files, providing utilities to read record offsets, header information, and record locations. Helps in navigating the structure of Shapefile datasets. |
| `stats.ts` | Provides utilities for tracking and managing statistics about processed features, including feature counts, layer counts, feature types, and error tracking. Includes functions for creating, updating, and resetting statistics. |

## 🔗 Dependencies
- GeoJSON types for feature handling
- Base processor types for statistics and results
- Coordinate system definitions for projection handling

## ⚙️ Usage Notes
- The readers (DBF, PRJ, SHX) are exported as singleton instances
- All bounds calculations handle edge cases and provide default values when needed
- Field type conversions in DBF reader support null values and data validation
- Coordinate system detection includes support for various EPSG codes and WKT formats

## 🔄 Related Folders/Modules
- Base types module for processor interfaces
- Coordinate system definitions
- GeoJSON type definitions
- Shapefile type definitions

## 🚧 TODOs / Planned Improvements
- Add support for additional coordinate systems in PRJ reader
- Enhance error handling and validation in SHX reader
- Implement caching for improved performance in bounds calculations
- Add support for additional DBF field types
- Consider adding compression support for large files