# Shapefile Parser Performance Improvements Guide

## Current Implementation Structure

### Core Files
```
components/geo-loader/core/processors/implementations/shapefile/
├── core/
│   ├── constants.ts       - Shared constants
│   ├── validator.ts       - Validation logic
│   ├── geometry-converter.ts - Geometry conversion logic
│   ├── header-parser.ts   - Header parsing logic
│   ├── record-parser.ts   - Record parsing logic
│   ├── file-handler.ts    - File management
│   ├── analysis-manager.ts - Structure analysis
│   └── stream-manager.ts  - Record streaming
├── postgis/
│   └── postgis-converter.ts - PostGIS conversion logic
├── parser.ts             - Main orchestrator
└── processor.ts          - Shapefile processor
```

### Application Flow
1. User selects shapefile(s) in GeoImportDialog (components/geo-loader/components/geo-import/dialog.tsx)
2. Files are passed to ShapefileParser
3. Parser delegates to:
   - FileHandler for file management
   - AnalysisManager for structure analysis
   - StreamManager for record processing
4. Processed features are displayed in PreviewMap (components/geo-loader/components/preview-map/index.tsx)
5. On import, features are converted to PostGIS format and saved

## Planned Improvements

### 1. WebAssembly Implementation
Target: Improve performance of geometry calculations

Key Files to Create/Modify:
```
components/geo-loader/core/processors/implementations/shapefile/
├── wasm/
│   ├── src/              - Rust source code
│   │   ├── lib.rs        - Main Rust module
│   │   ├── geometry.rs   - Geometry calculations
│   │   └── validation.rs - Validation functions
│   ├── pkg/              - Compiled WebAssembly
│   ├── Cargo.toml        - Rust dependencies
│   └── build.js          - Build script
└── core/
    └── wasm-bridge.ts    - TypeScript bridge to Wasm
```

Integration Points:
1. geometry-converter.ts - Replace JavaScript geometry calculations with Wasm calls
2. validator.ts - Use Wasm for validation operations
3. record-parser.ts - Optimize buffer operations with Wasm

### 2. Worker Pool Implementation
Target: Enable parallel processing of large files

Key Files to Create/Modify:
```
components/geo-loader/core/processors/implementations/shapefile/
├── workers/
│   ├── pool/
│   │   ├── manager.ts    - Worker pool management
│   │   ├── scheduler.ts  - Task scheduling
│   │   └── metrics.ts    - Performance monitoring
│   ├── tasks/
│   │   ├── parser.ts     - Record parsing worker
│   │   ├── geometry.ts   - Geometry processing worker
│   │   └── postgis.ts    - PostGIS conversion worker
│   └── shared/
│       ├── types.ts      - Shared type definitions
│       └── constants.ts  - Shared constants
└── core/
    └── worker-bridge.ts  - Main thread worker interface
```

Integration Points:
1. stream-manager.ts - Distribute record processing across workers
2. analysis-manager.ts - Parallel structure analysis
3. postgis-converter.ts - Parallel PostGIS conversion

## Implementation Steps

### WebAssembly Implementation:
1. Set up Rust project structure
2. Implement geometry calculations in Rust
3. Add validation functions
4. Create TypeScript bridge
5. Integrate with existing modules
6. Add performance benchmarks

### Worker Pool Implementation:
1. Create worker pool infrastructure
2. Implement task distribution
3. Add progress tracking
4. Create worker communication
5. Integrate with streaming
6. Add performance monitoring

## Example Prompt

```
I need help implementing performance improvements for a shapefile parser in a React/TypeScript application. The current implementation is modular with separate components for parsing, validation, and geometry processing.

Current structure:
[Copy the Core Files section above]

Application flow:
[Copy the Application Flow section above]

I want to implement:
1. WebAssembly for geometry calculations using Rust
2. Worker pool for parallel processing of large files

The implementation should follow this structure:
[Copy both Key Files to Create/Modify sections above]

Please help me implement these improvements step by step, starting with [choose: WebAssembly or Worker Pool] implementation.
```

This will give the AI assistant all the context needed to help with the implementation while maintaining the existing architecture and code organization.
