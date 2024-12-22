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
                  EntityParser         detectCoordSystem
                         │                    │
                         v                    v
                parseEntities ────> CoordSystemManager
                         │
                         v
            convertToFeatures [!]  ────┐     [Feature Generation Chain]
                    │                  │
                    v                  v
            validateGeometry     transformCoords
                    │                  │
                    v                  v
            FeatureManager ────> PreviewManager
                    │                  │
                    v                  v
          categorizeFeatures ───> PreviewMap
                    │
                    v
             [Generated Features]
```

[!] Current failure point: Feature conversion fails silently
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


Key Points:
1. File Analysis Chain:
   - DxfProcessor analyzes file structure
   - Converts entities to features
   - Detects coordinate system
   - Generates preview

2. Validation Points:
   - Entity structure validation in convertToFeatures
   - Coordinate validation in bounds calculation
   - Feature validation before preview generation

3. Error Handling:
   - Unified error reporting through ErrorReporter
   - Recovery mechanisms at each stage
   - Default fallbacks for missing data

Key Points:
1. File Analysis Chain:
   - DxfProcessor analyzes file structure
   - Converts entities to features
   - Detects coordinate system
   - Generates preview

2. Validation Points:
   - Entity structure validation in convertToFeatures
   - Coordinate validation in bounds calculation
   - Feature validation before preview generation

3. Error Handling:
   - Unified error reporting through ErrorReporter
   - Recovery mechanisms at each stage
   - Default fallbacks for missing data

Notes:
- Entity parsing succeeds but feature conversion fails
- Feature validation may be too strict
- Preview generation receives no features to display
- Error handling needs improvement in conversion chain
- Coordinate system detection works but may need validation
- Bounds calculation never runs due to missing features

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

[!] Potential validation failure point
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
- Multiple validation points may cause silent failures
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
