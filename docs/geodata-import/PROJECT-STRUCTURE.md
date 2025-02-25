# Geodata Import System – Project Structure

## Overview
This document outlines the project structure and organization of the geodata import system. It complements the design guide (`CONCEPT.md`) by providing a concrete implementation layout.

## Directory Structure

```
sonmap-studio/
├── components/              # React components
│   ├── files/              # File management components
│   │   ├── components/
│   │   │   ├── manager/    # File management UI
│   │   │   │   ├── index.tsx
│   │   │   │   ├── file-list.tsx
│   │   │   │   ├── toolbar.tsx
│   │   │   │   └── empty-state.tsx
│   │   │   ├── item/       # File item components
│   │   │   │   ├── file-item.tsx
│   │   │   │   ├── file-icon.tsx
│   │   │   │   ├── file-actions.tsx
│   │   │   │   └── file-metadata.tsx
│   │   │   ├── imported-files-list.tsx  # Imported files display
│   │   │   └── upload/     # Upload components
│   │   │       ├── file-upload.tsx
│   │   │       ├── upload-progress.tsx
│   │   │       └── upload-dialog.tsx
│   │   ├── hooks/          # File management hooks
│   │   │   ├── use-file-operations.ts
│   │   │   └── use-file-actions.ts
│   │   ├── utils/          # File utilities
│   │   │   └── file-types.ts
│   │   └── types.ts        # File management types
│   │
│   └── geo-import/         # Geodata import components
│       ├── components/
│       │   ├── geo-import-dialog.tsx
│       │   ├── geo-file-upload.tsx
│       │   ├── map-preview/         # Map preview components
│       │   │   ├── index.tsx
│       │   │   ├── map-container.tsx
│       │   │   └── layer-controls.tsx
│       │   ├── feature-selector/    # Feature selection UI
│       │   │   ├── index.tsx
│       │   │   ├── feature-list.tsx
│       │   │   └── spatial-selector.tsx
│       │   └── property-mapper/     # Property mapping UI (planned)
│       │       ├── index.tsx
│       │       └── field-mapper.tsx
│       ├── hooks/
│       │   ├── use-geo-import.ts
│       │   ├── use-preview.ts
│       │   └── use-selection.ts
│       └── utils/
│           └── preview-utils.ts
│
├── core/                   # Core business logic
│   ├── processors/         # File format parsers
│   │   ├── base-parser.ts
│   │   ├── shapefile-parser.ts
│   │   ├── dxf-parser.ts          # Planned
│   │   ├── csv-parser.ts          # Planned
│   │   └── geometry-simplifier.ts
│   ├── preview/           # Preview generation
│   │   ├── preview-generator.ts
│   │   ├── feature-sampler.ts
│   │   └── geometry-simplifier.ts
│   ├── coordinates/       # Coordinate system handling
│   │   ├── coordinate-transformer.ts
│   │   ├── prj-parser.ts
│   │   └── srid-registry.ts
│   ├── validation/        # File and data validation
│   │   ├── file-validator.ts
│   │   ├── geometry-validator.ts
│   │   └── property-validator.ts
│   ├── logging/          # Logging system
│   │   ├── log-manager.ts
│   │   └── log-types.ts
│   ├── security/          # Security utilities
│   │   ├── data-masker.ts
│   │   └── access-control.ts
│   └── session/           # Import session management
│       ├── import-session.ts
│       └── progress-tracker.ts
│
├── types/                 # TypeScript type definitions
│   ├── geo/
│   │   ├── index.ts
│   │   ├── feature.ts
│   │   └── import.ts
│   └── supabase.ts       # Supabase database types
│
└── docs/                  # Documentation
    └── geodata-import/
        ├── CONCEPT.md     # Design and implementation guide
        ├── IMPLEMENTATION.md  # Implementation details
        ├── PROJECT-STRUCTURE.md  # This file
        └── README.md      # Quick start and overview

```

## Component Organization

### File Management (`components/files/`)
Handles basic file operations and UI:
- File list display with import status indicators
- Upload functionality with progress tracking
- File actions (import, preview, download, delete)
- Companion file management
- Separate imported files list view
- Real-time status updates

### Geodata Import (`components/geo-import/`)
Manages the import workflow:
- Import dialog with file preview
- Map preview with feature selection
- Feature count and metadata display
- Progress tracking and error handling
- Logging system integration

## Core Modules

### Processors (`core/processors/`)
File format parsers and utilities:
- Base parser interface
- Format-specific implementations (Shapefile, GeoJSON)
- Geometry simplification
- Coordinate system handling

### Preview (`core/preview/`)
Preview generation utilities:
- Feature sampling for large datasets
- Geometry simplification
- Preview dataset generation
- Real-time map updates

### Coordinates (`core/coordinates/`)
Coordinate system handling:
- PRJ file parsing
- SRID management
- Coordinate transformation
- EPSG registry integration

### Validation (`core/validation/`)
Data validation utilities:
- File format validation
- Geometry validation
- Property validation
- Error reporting

### Logging (`core/logging/`)
Comprehensive logging system:
- Centralized log management
- Log level filtering
- Source-specific logging
- Log export functionality

### Security (`core/security/`)
Security-related utilities:
- Data masking
- Access control
- Audit logging
- Secure file handling

### Session (`core/session/`)
Import session management:
- Session state management
- Progress tracking
- Error handling
- Real-time updates

## Type Definitions

### Geodata Types (`types/geo/`)
- Feature interfaces
- Import session types
- Preview types
- File format type definitions

### Database Types (`types/supabase.ts`)
- Database schema types
- Query result types
- Real-time subscription types

## Implementation Status

### Implemented
- File management components
- Import dialog with preview
- Shapefile and GeoJSON support
- File upload with progress
- Import status tracking
- Logging system
- Basic map preview
- Feature selection UI

### In Progress
- Enhanced map preview features
- Advanced feature selection tools
- Coordinate system handling
- Preview generation optimization

### Planned
- Property mapping UI
- Additional file format parsers (DXF, CSV)
- Advanced geometry simplification
- Batch import capabilities
- Custom coordinate system support

## Development Guidelines

1. **Component Development**
   - Keep components focused and single-responsibility
   - Use hooks for complex logic
   - Implement proper TypeScript types
   - Add unit tests for critical functionality

2. **Core Module Development**
   - Follow interface-based design
   - Implement proper error handling
   - Add comprehensive validation
   - Document public APIs

3. **Type Safety**
   - Maintain strict TypeScript configuration
   - Define proper interfaces for all data structures
   - Use proper type guards where needed
   - Document complex types

4. **Testing**
   - Unit tests for core modules
   - Component tests with React Testing Library
   - Integration tests for critical paths
   - Performance testing for large datasets 