# System Flow Diagrams

## Purpose
This document maintains high-level flow diagrams for complex system interactions. It serves as a living document that evolves as our understanding of the system grows. The diagrams help:
- Visualize data and control flow between components
- Document complex interactions and state changes
- Track system behavior discoveries
- Provide quick orientation for developers

## How to Use This Document

### When to Add/Update Diagrams
1. When implementing new complex features
2. When discovering previously unknown system interactions
3. When making architectural changes
4. When fixing bugs that reveal new flow patterns

### Diagram Guidelines
1. Use ASCII/Unicode diagrams for version control compatibility
2. Include:
   - Component interactions
   - Data flow direction
   - State changes
   - Key decision points
   - Error paths
3. Add comments to explain:
   - Non-obvious interactions
   - Important state changes
   - Critical validation points
   - Error handling strategies

### Format
```
Title: [Feature/Flow Name]
Last Updated: [Date]
Status: [Current/Outdated]

[ASCII Diagram]

Key Points:
1. [Important interaction or behavior]
2. [Critical decision point]
3. [Error handling strategy]

Notes:
- [Additional context]
- [Known limitations]
- [Future considerations]
```

## Current Flows

### DXF Import Flow
Last Updated: [Current Date]
Status: Current

```
File Selection ──> GeoImportDialog ──────────────────────────────────┐
                         │                                           │
                         v                                           v
                   DxfProcessor ─────> analyzeStructure ────> ErrorReporter
                         │                    │
                         v                    v
                  EntityParser         detectCoordSystem [✓]
                         │                    │
                         v                    v
                parseEntities [✓] ────> CoordSystemManager [✓]
                         │
                         v
            convertToFeatures [!]  ────┐     [Feature Generation Chain]
                    │                  │
                    v                  v
            validateGeometry [!] transformCoords [✓]
                    │                  │
                    v                  v
            FeatureManager ────> PreviewManager [!]
                    │                  │
                    v                  v
          categorizeFeatures ───> PreviewMap [!]
                    │
                    v
             [Generated Features]

[!] Current failure points:
1. Feature conversion fails due to TypeScript type errors in validation chain
2. Layer data not propagating to UI components
3. Features dropped during validation despite successful parsing
4. Bounds calculation may be affected by validation failures
5. Preview generation blocked by validation issues

[✓] Working components:
1. File parsing and entity detection
2. Coordinate system detection (WGS84)
3. Basic entity parsing
4. Initial coordinate transformation
```

### DXF Parser Module Structure
Last Updated: [Current Date]
Status: Current

```
DxfParser (parser.ts)
       │
       ├─────────────┬─────────────┬──────────────┬───────────────┐
       │             │             │              │               │
header-parser.ts  layer-parser.ts  block-parser.ts  entity-parser.ts  regex-patterns.ts
       │             │             │              │               │
       v             v             v              v               v
Header Section   Layer Section   Block Section  Entity Section  Shared Utilities
Parsing          Parsing         Parsing        Parsing         & Patterns
       │             │             │              │               │
       │             │             │              │               │
       └─────────────┴─────────────┴──────────────┴───────────────┘
                                  │
                                  v
                        structure-validator.ts
                                  │
                                  v
                          Validated Structure
```

Key Points:
1. Module Organization:
   - Each parser focused on specific DXF section
   - Shared regex patterns and utilities working correctly
   - Centralized validation needs TypeScript fixes
   - Clear module boundaries but validation chain incomplete

2. Data Flow:
   - File content cleaned and normalized
   - Each section parsed independently
   - Results validated centrally but failing
   - Structure assembled but features dropped

3. Error Handling:
   - Each parser handles section-specific errors
   - Validation at module boundaries needs fixing
   - Error context preserved throughout
   - Clear error propagation chain needed

Notes:
- Each parser module is self-contained
- Regex patterns working correctly
- Validation needs TypeScript fixes
- Error handling needs improvement in validation chain

### Feature Conversion Flow
Last Updated: [Current Date]
Status: Current

```
DXF Entity ──────> Parse Entity Structure ──────> Validate Entity
     │                      │                           │
     v                      v                           v
Extract Vertices    Extract Properties         Validate Properties
     │                      │                           │
     v                      v                           v
Create Geometry     Create GeoJSON Feature     Validate Geometry [!]
     │                      │                           │
     v                      v                           v
Transform Coords    Add Feature Properties     Update Bounds
     │                      │                           │
     v                      v                           v
[LineString/Polygon] ──> Feature Manager ──────> Preview Manager

[!] Validation chain being implemented
```

Key Points:
1. Entity Processing:
   - Entity structure validated first
   - Vertices extracted and validated
   - Properties collected and normalized

2. Feature Creation:
   - Geometry created from vertices
   - Properties attached to feature
   - Coordinate transformation applied

3. Validation Chain:
   - Entity structure validation
   - Property validation
   - Geometry validation
   - Bounds validation

Notes:
- Multiple validation points being consolidated
- Error context being added
- Property mapping under review
- Coordinate transformation needs verification
- Property mapping needs review
- Error context needed at each step

### Import Dialog State Flow
Last Updated: [Current Date]
Status: Current

```
Initial State ──────> File Selected ─────> Analysis Started
     │                     │                     │
     v                     v                     v
No File Loaded     Validation Check      Progress Updates
                         │                     │
                         v                     v
                   Analysis Complete    Preview Generation
                         │                     │
                         v                     v
                   Import Options       Layer Management
                         │                     │
                         v                     v
                   Import Started      Coordinate System
                         │            Detection/Selection
                         v
                   Import Complete
```

Key Points:
1. State Transitions:
   - Clear progression from file selection to import
   - Parallel processes for preview and analysis
   - State synchronization between components

2. User Interaction Points:
   - File selection
   - Layer visibility toggling
   - Coordinate system selection
   - Import confirmation

3. Progress Feedback:
   - Analysis progress reporting
   - Preview generation status
   - Import progress updates

Notes:
- State changes trigger UI updates
- Error states can occur at any point
- Recovery allows returning to previous states
- Preview updates reflect layer visibility changes
