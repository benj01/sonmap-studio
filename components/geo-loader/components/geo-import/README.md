# 📂 geo-import

## Overview
This folder contains 6 file(s) related to geographic data import functionality, providing a comprehensive UI for importing and previewing various geographic file formats.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `dialog.tsx` | Main dialog component for geo data import. Handles file uploads, coordinate system management, layer visibility, and import process with comprehensive error handling and progress tracking. |
| `index.tsx` | Entry point file that exports the GeoImportDialog component for external use. |
| `logs-section.tsx` | Component for displaying import logs, warnings, and errors in a scrollable area. Supports different log types with timestamps and detailed information. |
| `preview-section.tsx` | Component for previewing geographic data before import. Handles different feature types (points, lines, polygons) and manages coordinate system transformations. |
| `settings-section.tsx` | Configuration component for import settings, including coordinate system selection, layer management, and DXF-specific options. |
| `types.ts` | TypeScript definitions for the import module, including interfaces for logs, import options, preview analysis, and component props. |

## 🔗 Dependencies
- shadcn/ui components for UI elements
- lucide-react for icons
- React hooks and components from 'react'
- Core processor implementations for different file formats
- GeoJSON types and utilities
- Custom preview and coordinate system managers

## ⚙️ Usage Notes
- Supports multiple file formats including GeoJSON, KML, GPX, DXF, Shapefile, CSV, XYZ, and TXT
- Provides real-time preview of geographic data
- Handles coordinate system transformations and validations
- Includes comprehensive logging and error handling
- Supports layer visibility and selection management
- Features progress tracking during import process

## 🔄 Related Folders/Modules
- preview-map - Map visualization components
- core/processors - File processing implementations
- core/coordinate-systems - Coordinate system management
- core/logging - Logging functionality
- types/geo - Geographic data type definitions

## 🚧 TODOs / Planned Improvements
- Add support for more file formats
- Enhance preview performance for large datasets
- Improve coordinate system detection accuracy
- Add batch import capabilities
- Implement more detailed validation feedback
- Add support for custom coordinate system definitions