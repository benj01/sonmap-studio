# Shapefile Processor Documentation

## Overview
This directory contains the shapefile processor implementation, which uses WebAssembly (Rust) for performance-critical operations. The processor handles parsing, validation, and geometry processing of shapefiles.

## Directory Structure
```
shapefile/
├── core/                 - Core TypeScript implementation
│   ├── constants.ts      - Shared constants
│   ├── validator.ts      - Validation logic
│   ├── geometry-converter.ts - Geometry conversion
│   └── wasm-bridge.ts    - WebAssembly bridge
├── wasm/                 - Rust/WebAssembly implementation
│   ├── src/             - Rust source code
│   │   ├── lib.rs       - Main module
│   │   ├── geometry.rs  - Geometry calculations
│   │   ├── validation.rs- Validation functions
│   │   └── geojson.rs   - GeoJSON types
│   └── Cargo.toml       - Rust dependencies
└── docs/                 - Documentation
    ├── implementation.md - Implementation details
    └── wasm.md          - WebAssembly specifics
```

## Key Components

### TypeScript Core
- **geometry-converter.ts**: Converts shapefile records to GeoJSON features
- **validator.ts**: Validates shapefile structure and components
- **wasm-bridge.ts**: TypeScript interface to WebAssembly functions

### Rust/WebAssembly
- **geometry.rs**: Optimized geometry calculations
- **validation.rs**: Efficient validation functions
- **geojson.rs**: GeoJSON type definitions

## Usage

### Initialization
```typescript
import { initWasm } from './core/wasm-bridge';
await initWasm();
```

### Processing Shapefiles
```typescript
const processor = new ShapefileProcessor();
const result = await processor.process(file);
```

## Development

### Building WebAssembly
```bash
cd wasm
npm run build:wasm
```

### Running Tests
```bash
npm test
```

## Further Reading
- [Implementation Details](./docs/implementation.md)
- [WebAssembly Documentation](./docs/wasm.md)
