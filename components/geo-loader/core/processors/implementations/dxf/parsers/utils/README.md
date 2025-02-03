# 📂 utils

## Overview
This folder contains utility functions for handling geometric points and coordinate transformations. The utilities support both 2D and 3D point operations, angle conversions, and arc/circle point generation.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `point-utils.ts` | A collection of utility functions for point manipulation, including type validation, coordinate conversion, angle transformation, and arc point generation. |

## 🔗 Dependencies
- Vector3 type from '../../types'
- Standard TypeScript/JavaScript Math utilities

## ⚙️ Usage Notes
- Point coordinates can be specified in either 2D (x, y) or 3D (x, y, z) format
- When z-coordinate is omitted in 3D operations, it defaults to 0
- Angles in arc generation are expected in radians (use toRadians() for conversion)
- Arc point generation defaults to 32 points for smooth curves

## 🔄 Related Folders/Modules
- types (for Vector3 type definition)
- Geometry-related modules that require point manipulation

## 🚧 TODOs / Planned Improvements
- Add validation for edge cases in arc generation
- Consider adding point rotation utilities
- Add documentation examples for each function
- Consider adding point projection utilities for 3D->2D operations