# 📂 components

## Overview
This folder contains 3 file(s) related to components for handling coordinate systems, DXF file visualization, and format settings.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `coordinate-system-select.tsx` | A React component for selecting and validating coordinate systems. Supports WGS84 and Swiss coordinate systems with input validation and automatic system detection. Includes helpful descriptions for each coordinate system type. |
| `dxf-structure-view.tsx` | A comprehensive React component for visualizing and managing DXF file structure. Features layer management, entity type filtering, and style visualization. Includes controls for visibility and selection of layers, detailed entity type information, and validation error handling. |
| `format-settings.tsx` | A configurable settings component for handling different file formats (DXF, CSV, XYZ, TXT, Shapefile). Provides format-specific options like coordinate system selection, layer management, delimiter settings, and optimization controls. Includes validation and error reporting. |

## 🔗 Dependencies
- @/components/ui/* - Various UI components from the shadcn/ui library
- lucide-react - Icon components
- react - Core React library
- Custom types and utilities from core processing modules

## ⚙️ Usage Notes
- Components support various coordinate systems including WGS84 and Swiss standards (LV95, LV03)
- DXF structure viewer includes comprehensive layer and entity management
- Format settings support multiple file types with format-specific validation
- All components include error handling and validation
- Components use Tailwind CSS for styling

## 🔄 Related Folders/Modules
- core/processors - Data processing implementations
- types - Type definitions for coordinates and format options
- utils - Utility functions

## 🚧 TODOs / Planned Improvements
- Add support for additional coordinate systems
- Enhance error reporting and validation feedback
- Improve performance for large DXF files
- Add more detailed documentation for each component
- Implement additional file format support