# Geo Import Component Documentation

Last updated: 2025-01-05

## Overview
The Geo Import component handles the import of various geographic data formats into PostGIS. It provides a user interface for file selection, preview, settings configuration, and progress monitoring.

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
- Size: 10.3 KB

Key Features:
- File validation
- Database import management
- Error handling
- Progress tracking
- Section coordination

### Logs Section (logs-section.tsx)
- Displays import process logs
- Shows errors, warnings, and info messages
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
- Statistics overview
- Warning display
- Direct PostGIS queries

### Settings Section (settings-section.tsx)
- Manages import settings
- Handles layer selection
- Size: 5.1 KB

Features:
- Layer visibility toggles
- Template selection
- Database configuration
- Import options

### Types (types.ts)
- Core type definitions
- Interface declarations
- Size: 2.7 KB

Key Types:
- LogEntry & LogDetails
- ImportOptions & ImportState
- PreviewAnalysis
- Section Props
- Database Types

## Integration Points

1. Data Processing
   - Connects with PostGIS client
   - Handles database operations
   - Uses shared services

2. UI Integration
   - Works with preview-map component
   - Integrates with main application UI
   - Handles user interactions

3. State Management
   - Manages import process state
   - Handles database connections
   - Coordinates between sections

## Potential Improvements

### High Priority
1. Memory Management
   - [ ] Add cleanup for large imports
   - [ ] Implement progressive loading
   - [ ] Add memory usage monitoring

2. Error Handling
   - [ ] Improve database error messages
   - [ ] Add recovery options
   - [ ] Implement retry mechanism

3. User Experience
   - [ ] Add drag-and-drop support
   - [ ] Improve progress indicators
   - [ ] Add batch import support

### Medium Priority
1. Performance
   - [ ] Optimize database queries
   - [ ] Add query caching
   - [ ] Improve large file handling

2. Features
   - [ ] Add file type detection
   - [ ] Add template management
   - [ ] Improve companion file handling

### Low Priority
1. UI Improvements
   - [ ] Add dark mode support
   - [ ] Improve mobile layout
   - [ ] Add keyboard shortcuts

## Notes
- Consider splitting preview-section.tsx due to size
- Look into query optimization for large datasets
- Consider adding file type validation
- May need better error recovery mechanisms
- Connection pooling implementation in progress
