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

### DXF Import and Processing Flow (Updated)
Last Updated: [Current Date]
Status: Current

```
File Selection ──> GeoImportDialog ──────────────────────────────────┐
                         │                                           │
                         v                                           v
                   DxfProcessor ─────────────────────────> ErrorReporter
                         │
                         ├─────────────┬──────────────┬─────────────┐
                         │             │              │             │
                         v             v              v             v
                   DxfAnalyzer   DxfTransformer  DxfEntityProc  DxfLayerProc
                         │             │              │             │
                         v             v              v             v
              Detect Coords    Transform Coords    Process      Handle Layers
                   │                  │           Entities          │
                   │                  │              │             │
                   v                  │              │             v
             Calculate Bounds         │              │        Filter Layers
                   │                  │              │        (Skip System)
                   └──────────┬──────┘              │             │
                             v                       v             │
                    Coordinate System         Generate Features    │
                          Manager                    │             │
                             │                       v             │
                             └───────────> PreviewManager <───────┘
                                               │
                                               v
                                          PreviewMap

Key Points:
1. Layer Management:
   - System properties filtered out
   - Consistent layer handling
   - Proper state tracking
   - Improved validation

2. State Management:
   - Centralized state handling
   - Proper cleanup
   - Type-safe operations
   - Better error context

3. Error Handling:
   - Validation at each step
   - Clear error propagation
   - Proper error context
   - Better debugging info

Notes:
- Layer filtering happens early
- State consistency maintained
- Better error reporting
```

### Layer State Management Flow (New)
Last Updated: [Current Date]
Status: Current

```
DXF Structure ──────> Extract Layer Data ──────> Filter System Props
       │                      │                        │
       v                      v                        v
  Entity Data          Validate Layers          Create Layer Set
       │                      │                        │
       v                      v                        v
Extract Layers    Convert to DxfLayer     Add Default Layer ('0')
       │                      │                        │
       v                      v                        v
Validate Names      Update Layer Cache     Track Layer States
       │                      │                        │
       └──────────────┬──────┘                        │
                      v                                │
              Layer Manager <───────────────────────────┘
                      │
                      ├─────────────┬──────────────┐
                      │             │              │
                      v             v              v
             Preview Manager  State Updates   Error Context
                      │             │              │
                      v             v              v
            Layer Controls    Statistics     Error Reporter

Key Points:
1. Early Filtering:
   - System properties removed at extraction
   - Consistent filtering across flows
   - Default layer handling
   - Proper validation

2. State Tracking:
   - Layer cache management
   - State synchronization
   - Statistics updates
   - Error propagation

3. Error Handling:
   - Validation at each step
   - Clear error messages
   - Context preservation
   - Debug information

Notes:
- System properties never reach UI
- Layer state always consistent
- Better error reporting
- Improved debugging
```

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
