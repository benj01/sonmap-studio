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
│       │   ├── map-preview/         # Map preview components (planned)
│       │   │   ├── index.tsx
│       │   │   ├── map-container.tsx
│       │   │   └── layer-controls.tsx
│       │   ├── feature-selector/    # Feature selection UI (planned)
│       │   │   ├── index.tsx
│       │   │   ├── feature-list.tsx
│       │   │   └── spatial-selector.tsx
│       │   └── property-mapper/     # Property mapping UI (planned)
│       │       ├── index.tsx
│       │       └── field-mapper.tsx
│       ├── hooks/
│       │   ├── use-geo-import.ts
│       │   ├── use-preview.ts       # Preview management (planned)
│       │   └── use-selection.ts     # Selection management (planned)
│       └── utils/
│           └── preview-utils.ts
│
├── core/                   # Core business logic
│   ├── processors/         # File format parsers
│   │   ├── base-parser.ts
│   │   ├── shapefile-parser.ts
│   │   ├── dxf-parser.ts          # Planned
│   │   ├── csv-parser.ts          # Planned
│   │   └── geometry-simplifier.ts  # Planned
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
│   ├── security/          # Security utilities
│   │   ├── data-masker.ts
│   │   └── access-control.ts
│   └── session/           # Import session management
│       ├── import-session.ts
│       └── progress-tracker.ts
│
├── types/                 # TypeScript type definitions
│   ├── geo-import/
│   │   ├── index.ts
│   │   ├── shapefile.d.ts
│   │   └── import-session.ts
│   └── array-source.d.ts
│
└── docs/                  # Documentation
    └── geodata-import/
        ├── CONCEPT.md     # Design and implementation guide
        └── PROJECT-STRUCTURE.md  # This file
```

## Component Organization

### File Management (`components/files/`)
Handles basic file operations and UI:
- File list display
- Upload functionality
- File actions (import, preview, download, delete)
- Companion file management

### Geodata Import (`components/geo-import/`)
Manages the import workflow:
- Import dialog and workflow
- Map preview and controls
- Feature selection interface
- Property mapping UI

## Core Modules

### Processors (`core/processors/`)
File format parsers and utilities:
- Base parser interface
- Format-specific implementations
- Geometry simplification

### Preview (`core/preview/`)
Preview generation utilities:
- Feature sampling
- Geometry simplification
- Preview dataset generation

### Coordinates (`core/coordinates/`)
Coordinate system handling:
- PRJ file parsing
- SRID management
- Coordinate transformation

### Validation (`core/validation/`)
Data validation utilities:
- File format validation
- Geometry validation
- Property validation

### Security (`core/security/`)
Security-related utilities:
- Data masking
- Access control
- Audit logging

### Session (`core/session/`)
Import session management:
- Session state management
- Progress tracking
- Error handling

## Type Definitions

### Geodata Import Types (`types/geo-import/`)
- Import session interfaces
- Feature types
- Preview types
- File format type definitions

### External Module Types
Type definitions for external libraries:
- `array-source.d.ts`
- `shapefile.d.ts`

## Implementation Status

### Implemented
- File management components
- Basic import dialog
- Shapefile parser
- File upload handling
- Type definitions

### In Progress
- Map preview component
- Feature selection UI
- Preview generation
- Coordinate system handling

### Planned
- Property mapping UI
- Additional file format parsers
- Geometry simplification
- Advanced preview features

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