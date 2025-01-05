# Geo Import Component Documentation

Last updated: 2025-01-05

## Overview
The Geo Import component is responsible for handling the import of various geographic data formats into the application. It provides a user interface for file selection, preview, settings configuration, and progress monitoring.

## Directory Structure

```
geo-import/
├── components/          # Reusable UI components
├── hooks/              # Custom React hooks
├── dialog.tsx          # Main import dialog
├── index.ts           # Public exports
├── logs-section.tsx    # Log display component
├── preview-section.tsx # Data preview component
├── settings-section.tsx # Import settings component
└── types.ts           # Type definitions
```

## Component Details

### Dialog (dialog.tsx)
- Main import dialog component
- Manages the overall import flow
- Coordinates between different sections
- Handles file selection and import completion
- Size: 10.3 KB

Key Features:
- File validation
- Import process management
- Error handling
- Progress tracking
- Section coordination

### Logs Section (logs-section.tsx)
- Displays import process logs
- Shows errors, warnings, and info messages
- Provides clear/close functionality
- Size: 2.6 KB

Features:
- Log filtering by type
- Timestamp display
- Error highlighting
- Loading state handling

### Preview Section (preview-section.tsx)
- Shows preview of imported data
- Integrates with MapBox
- Displays data statistics
- Size: 7.3 KB

Features:
- Map preview
- Feature highlighting
- Coordinate system display
- Statistics overview
- Warning display

### Settings Section (settings-section.tsx)
- Manages import settings
- Handles layer selection
- Configures coordinate systems
- Size: 5.1 KB

Features:
- Layer visibility toggles
- Template selection
- Coordinate system configuration
- File-specific settings

### Types (types.ts)
- Core type definitions
- Interface declarations
- Size: 2.7 KB

Key Types:
- LogEntry & LogDetails
- ImportOptions & ImportState
- PreviewAnalysis
- Section Props

## Hooks

The hooks directory contains custom React hooks for:
- Import process management
- File handling
- State management
- Preview generation
- Settings persistence

## Integration Points

1. Data Processing
   - Connects with geo-loader core
   - Handles file processing
   - Manages coordinate transformations

2. UI Integration
   - Works with preview-map component
   - Integrates with main application UI
   - Handles user interactions

3. State Management
   - Manages import process state
   - Handles settings persistence
   - Coordinates between sections

## Potential Improvements

### High Priority
1. Memory Management
   - [ ] Add cleanup for large previews
   - [ ] Implement progressive loading
   - [ ] Add memory usage monitoring

2. Error Handling
   - [ ] Improve error messages
   - [ ] Add recovery options
   - [ ] Implement retry mechanism

3. User Experience
   - [ ] Add drag-and-drop support
   - [ ] Improve progress indicators
   - [ ] Add batch import support

### Medium Priority
1. Performance
   - [ ] Optimize preview generation
   - [ ] Add caching mechanism
   - [ ] Improve large file handling

2. Features
   - [ ] Add file type detection
   - [ ] Improve coordinate system selection
   - [ ] Add template management

### Low Priority
1. UI Improvements
   - [ ] Add dark mode support
   - [ ] Improve mobile layout
   - [ ] Add keyboard shortcuts

## Notes
- Consider splitting preview-section.tsx due to size
- Look into potential memory leaks in preview generation
- Consider adding file type validation
- May need better error recovery mechanisms
