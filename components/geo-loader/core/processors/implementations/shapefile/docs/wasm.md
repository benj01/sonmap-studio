# WebAssembly Implementation

## Overview

The shapefile processor uses WebAssembly (compiled from Rust) to handle performance-critical operations such as geometry calculations and validations. This approach significantly improves performance while maintaining type safety through a well-defined TypeScript interface.

## Architecture

### Rust Implementation
Located in the `wasm/` directory:

```
wasm/
├── src/
│   ├── lib.rs        - Main module & exports
│   ├── geometry.rs   - Geometry calculations
│   ├── validation.rs - Validation functions
│   └── geojson.rs    - GeoJSON type definitions
├── pkg/              - Compiled WebAssembly
└── Cargo.toml        - Rust dependencies
```

### TypeScript Bridge
Located in `core/wasm-bridge.ts`:
- Provides type-safe interface to WebAssembly functions
- Handles initialization and memory management
- Manages type conversions
- Provides error handling

## Key Features

### Geometry Operations
- Efficient coordinate calculations
- Ring orientation checks
- Bounds calculations
- Geometry type conversions

### Validation Operations
- Header validation
- Record content validation
- Geometry validation
- Buffer space verification

## Usage

### Initialization
```typescript
import { initWasm } from './core/wasm-bridge';

// Must be called before using any WebAssembly functionality
await initWasm();
```

### Geometry Processing
```typescript
import { WasmGeometryConverter } from './core/wasm-bridge';

const geometryConverter = new WasmGeometryConverter();

// Process geometry
const geometry = geometryConverter.processGeometry(
  shapeType,    // Shape type (1=Point, 3=PolyLine, etc.)
  coordinates,  // Float64Array of coordinates
  ringSizes     // Uint32Array of ring sizes (for polygons)
);
```

### Validation
```typescript
import { WasmValidator } from './core/wasm-bridge';

const validator = new WasmValidator();

// Validate components
validator.validateHeaderBuffer(bufferLength);
validator.validateShapeType(shapeType);
validator.validateBoundingBox(xMin, yMin, xMax, yMax);
```

## Performance Considerations

### Memory Management
- Uses TypedArrays for efficient memory transfer:
  - Float64Array for coordinates
  - Uint32Array for ring sizes and indices
- Automatic WebAssembly memory management via wasm-bindgen
- Zero-copy operations where possible

### Type Conversions
The bridge handles conversions between:
- JavaScript arrays ↔ TypedArrays
- Rust types ↔ TypeScript types
- GeoJSON structures

## Building

### Prerequisites
- Rust toolchain with wasm32-unknown-unknown target
- wasm-pack
- Node.js

### Build Process
```bash
# Install dependencies
npm install

# Build WebAssembly module
npm run build:wasm
```

## Error Handling

### WebAssembly Errors
- Detailed error messages from Rust code
- Error types match TypeScript implementation
- Stack traces preserved where possible

### Bridge Error Enhancement
- Adds TypeScript context to Rust errors
- Provides debugging information
- Maintains error type hierarchy

## Testing

### Unit Tests
```bash
# Run Rust tests
cargo test

# Run TypeScript tests
npm test
```

### Integration Tests
```bash
# Run full test suite including WebAssembly integration
npm run test:integration
```

## Performance Metrics

### Geometry Processing
- Up to 10x faster than JavaScript implementation
- Reduced memory usage
- Better handling of large coordinates arrays

### Validation
- Improved buffer validation speed
- More efficient geometry checks
- Reduced overall processing time
