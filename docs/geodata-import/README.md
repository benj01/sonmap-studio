# Geodata Import System

## Overview
This document outlines the implementation of the geodata import pipeline, which handles various geodata file types (Shapefiles, DXF, DWG, CSV, XYZ, QSI) in a scalable and efficient manner.

## Project Structure

```
sonmap-studio/
├── components/
│   ├── geo-import/              # Main geodata import components
│   │   ├── components/          # React components
│   │   │   ├── geo-file-upload.tsx
│   │   │   ├── geo-import-dialog.tsx
│   │   └── ...
│   │   ├── hooks/               # React hooks
│   │   │   └── use-geo-import.ts
│   └── shared/
│       └── types/
│           └── file-types.ts   # File type configurations
├── core/                       # Core processing logic
│   ├── processors/             # File format parsers
│   │   ├── base-parser.ts
│   │   ├── shapefile-parser.ts
│   │   └── geometry-simplifier.ts
│   ├── preview/                # Preview generation
│   │   └── preview-generator.ts
│   ├── coordinates/            # Coordinate systems and utilities
│   │   └── coordinates.ts
│   └── ...                     # Other core utilities and modules
├── types/
│   └── geo-import.ts          # Core type definitions
└── docs/
    └── geodata-import/        # Documentation
        └── README.md          # This file
```