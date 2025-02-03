# 📂 components

## Overview
This folder contains 2 file(s) related to the geo-import dialog components, providing the main content and header sections of the import interface.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `import-content.tsx` | Main content component for the import dialog. Manages the layout and interaction between settings, preview, and logs sections. Handles coordinate system changes, layer visibility, and preview availability with real-time updates. |
| `import-header.tsx` | Header component for the import dialog. Displays the file name being imported and shows error alerts when problems occur during the import process. |

## 🔗 Dependencies
- shadcn/ui components for dialog and alert elements
- lucide-react for icons
- Core processor types for analysis results
- Preview manager for handling geographic data visualization
- Custom types for import options and coordinate systems

## ⚙️ Usage Notes
- Components are designed to work together as part of the geo-import dialog
- Preview section only renders when features are available
- Real-time validation and error handling
- Responsive grid layout for settings and preview
- Supports multiple coordinate systems and layer management

## 🔄 Related Folders/Modules
- preview-map - Map visualization components
- preview/preview-manager - Preview state management
- core/processors - Data processing utilities
- types - Type definitions
- geo-import/logs-section - Logging component
- geo-import/settings-section - Settings management
- geo-import/preview-section - Preview visualization

## 🚧 TODOs / Planned Improvements
- Add loading states for preview initialization
- Enhance error handling with more detailed messages
- Improve preview performance for large datasets
- Add support for mobile responsive layout
- Implement feature filtering in preview