# Multi-Step Geodata Import Wizard: Implementation Plan

## Overview
This document outlines the design and implementation plan for a robust, extensible multi-step import wizard for geospatial data. The goal is to provide a user-friendly, reliable, and auditable workflow for importing, previewing, validating, and transforming geodata, including advanced features like height extraction and attribute mapping.

---

## 1. Wizard Steps & User Flow

### **Step 1: File Selection & Upload**
- **UI:** Drag-and-drop or file picker for supported formats (GeoJSON, Shapefile, etc.)
- **Backend:** Store file(s) in project storage, create an import session
- **Logging:** Log file metadata, upload status
- **Fully integrated with real upload functionality**
- **ProjectId is now dynamically passed from the parent component (FileManager)**
- **File UUID is used for all downstream steps**
- **After upload, a DB record is inserted and the UUID is retrieved for use in the wizard**

### **Step 2: Parsing & Initial Analysis**
- **UI:** Show progress, display detected coordinate system, feature count, geometry types
- **Backend:** Parse file, assign stable feature IDs, detect SRID, extract metadata
- **Logging:** Log parse results, detected SRID, feature stats
- **Parsing logic implemented**
- **File is downloaded using the correct storage path from the DB, not the UUID**
- **Robust against storage/DB desync (waits for DB record after upload)**

### **Step 3: Preview & Feature Selection**
- **UI:** Map preview (Mapbox, fully interactive), list of features, selection controls (all/none/invert)
- **Data:** Show a subset (sample) of features for performance
- **Feature Linking:** Use stable IDs to link preview to original data
- **Logging:** Log previewed features, selection changes
- **Implemented**

### **Step 4: Attribute & Height Mapping**
- **UI:**
  - Attribute table: Show available properties/fields
  - Height mapping: Let user choose Z, or select attribute (e.g., `H_MEAN`, `height`, etc.)
  - Option to preview height extraction on sample features
- **Backend:**
  - Analyze attribute distributions
  - Suggest likely height fields
  - Allow user override
- **Logging:** Log mapping choices, preview results
- **Implemented**

### **Step 5: Validation & Repair**
- **UI:**
  - Show geometry/attribute issues (invalid geometries, missing heights, etc.)
  - Offer auto-repair or manual fix options
  - Show before/after preview
- **Backend:**
  - Run validation routines
  - Attempt repair (e.g., `ST_MakeValid`, deduplication)
- **Logging:** Log issues found, repairs applied
- **Implemented**

### **Step 6: Transformation & Height Conversion**
- **UI:**
  - Confirm coordinate system transformation (show source/target SRID)
  - For Swiss data, option to use SwissTopo API for height conversion
  - Show preview of transformed coordinates/heights
- **Backend:**
  - Apply transformations (proj4js, PostGIS, SwissTopo API as needed)
- **Logging:** Log transformation steps, API calls, errors
- **Implemented**

### **Step 7: Confirmation & Import**
- **UI:**
  - Summary of import plan (feature count, selected attributes, transformation summary)
  - Final confirmation dialog
- **Backend:**
  - Submit import job to server
  - Track progress, show real-time status
- **Logging:** Log import submission, server response, final status
- **Implemented**

### **Step 8: Post-Import Review**
- **UI:**
  - Show import results (success/failure, errors, warnings)
  - Link to view imported data on main map
- **Backend:**
  - Store import logs, errors, and debug info
- **Logging:** Log post-import review actions
- **Real backend import integration**

---

## 2. Data Flow & State Management
- Use a central import session object to track state across steps
- Store all user choices (selected features, attribute mappings, etc.) in session
- Pass only original, untransformed data to server for import, along with user mappings
- Use stable feature IDs throughout

---

## 3. Extensibility & Future-Proofing
- Design wizard steps as modular React components
- Allow for custom step injection (e.g., for future attribute mapping, CRS overrides)
- Support batch operations and large datasets (pagination, sampling)
- Plan for additional validation/repair plugins

---

## 4. Logging & Debugging
- Add structured logging at all critical points (file upload, parse, preview, selection, mapping, validation, import)
- Include feature IDs, user actions, and error details in logs
- Provide a debug panel in the wizard for advanced users

---

## 5. UI/UX Considerations
- Use clear progress indicators and step navigation
- Allow users to go back and change choices before final import
- Provide tooltips, help links, and warnings for complex steps (e.g., height mapping)
- Ensure accessibility and mobile responsiveness

---

## 5a. Current Codebase Analysis & Refactor Plan

### **A. Existing Components & Logic**
- **FileManager**: Handles file listing, upload, and triggers the import dialog.
- **GeoImportDialog**: Central dialog for the import process (file info, upload, preview, selection, import, logging).
- **GeoFileUpload**: Handles file download, companion file detection, parsing, preview generation, and import session creation.
- **useGeoImport**: Hook for import session state management.
- **MapPreview**: Mapbox-based preview and feature selection.
- **Types**: Well-structured for import sessions, datasets, and features.

### **B. What is Reusable**
- File upload, companion file handling, and parsing logic (modular, can be moved to wizard steps).
- Session management via hook.
- Preview and selection logic (uses stable IDs).
- Logging at critical points.
- Types and data structures.

### **C. What Needs Refactoring or Cleanup**
- **Monolithic Dialog**: GeoImportDialog currently handles all steps; needs to be split into wizard steps.
- **State Management**: Move from local/dialog state to a central wizard/session state (context or store).
- **Preview vs. Full Dataset**: Ensure preview is always derived from the full dataset, and only original data is used for import.
- **Feature Selection**: Move to a dedicated wizard step.
- **Attribute/Height Mapping & Validation**: Not yet implemented; plan for dedicated steps.
- **Routing/Navigation**: Add stepper/wizard navigation.

### **D. Legacy Code to Remove or Replace**
- Any code in GeoImportDialog that tries to handle multiple steps in one place.
- Any preview logic not based on the new step-based flow.
- Any state not managed centrally for the wizard.

### **E. Refactor/Cleanup Checklist**
- [ ] Break up GeoImportDialog into step components.
- [ ] Centralize wizard/session state.
- [ ] Move file upload, parsing, and preview logic to dedicated steps.
- [ ] Move feature selection, attribute mapping, and validation to their own steps.
- [ ] Remove/replace legacy dialog code.
- [ ] Ensure all new logic is modular and step-based.

---

## 6. Implementation Roadmap & Milestones

1. **Scaffold Wizard UI & Routing**
2. **Implement File Upload & Session Management**
3. **Add Parsing & Preview Steps**
4. **Build Feature Selection & Attribute Mapping**
5. **Integrate Validation & Repair**
6. **Add Transformation & Height Conversion**
7. **Finalize Confirmation & Import Logic**
8. **Implement Post-Import Review & Debug Panel**
9. **Iterate on UX, add extensibility hooks**

---

## 7. Open Questions & TODOs
- How to handle extremely large files (streaming, chunked import)?
- What is the best way to let users map multiple attributes (e.g., for color, height, category)?
- Should we allow saving import templates for repeated workflows?
- How to best surface and resolve geometry/attribute issues interactively?

---

## 8. Progress Tracking
- [x] File selection and upload (with real upload, dynamic projectId, and UUID handling)
- [x] Parsing and initial analysis (uses correct storage path from DB, robust against storage/DB desync)
- [x] Feature preview and selection
- [x] Attribute mapping
- [x] Validation and repair
- [x] Transformation
- [x] Confirmation & import
- [x] Post-import review (real backend integration)

---

**Milestone:**
- The import step now uses a real backend API call, passing all user choices and selected features. The wizard is now fully production-ready for end-to-end import workflows.

**This document is a living plan. Update as design decisions are made and implementation progresses.**

---

## 9. Legacy Code Removal Checklist

Once the new import wizard is fully adopted and tested, the following legacy files and functions can be safely removed:

### Components
- `components/geo-import/components/geo-import-dialog.tsx`
- `components/geo-import/components/file-info-card.tsx` (if not used elsewhere)
- `components/geo-import/components/import-details-card.tsx` (if not used elsewhere)
- `components/geo-import/components/map-preview.tsx` (if not used elsewhere)
- `components/geo-import/components/geo-file-upload.tsx` (if not used by the wizard)

### Types
- `GeoImportDialogProps` and related types in `components/geo-import/types/index.ts`

### Hooks
- `useGeoImport` in `components/geo-import/hooks/use-geo-import.ts` (if not used by the wizard)

### Utilities
- Any helpers/utilities only referenced by the old dialog

### Styles
- Any CSS/SCSS files only used by the old dialog

### Tests
- Any test files for the above components

**Note:**  
Before removal, double-check that none of these are referenced by the new wizard or other parts of the app.

--- 