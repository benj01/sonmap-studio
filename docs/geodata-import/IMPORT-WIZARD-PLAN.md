# Multi-Step Geodata Import Wizard: Implementation Plan

## Overview
This document outlines the design and implementation plan for a robust, extensible multi-step import wizard for geospatial data. The goal is to provide a user-friendly, reliable, and auditable workflow for importing, previewing, validating, and transforming geodata, including advanced features like height extraction and attribute mapping.

---

## 1. Wizard Steps & User Flow

### **Step 1: File Selection & Upload**
- **UI:** Drag-and-drop or file picker for supported formats (GeoJSON, Shapefile, etc.)
- **Backend:** Store file(s) in project storage, create an import session
- **Logging:** Log file metadata, upload status

### **Step 2: Parsing & Initial Analysis**
- **UI:** Show progress, display detected coordinate system, feature count, geometry types
- **Backend:** Parse file, assign stable feature IDs, detect SRID, extract metadata
- **Logging:** Log parse results, detected SRID, feature stats

### **Step 3: Preview & Feature Selection**
- **UI:** Map preview (Mapbox), list of features, selection controls (all/none/invert)
- **Data:** Show a subset (sample) of features for performance
- **Feature Linking:** Use stable IDs to link preview to original data
- **Logging:** Log previewed features, selection changes

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

### **Step 5: Validation & Repair**
- **UI:**
  - Show geometry/attribute issues (invalid geometries, missing heights, etc.)
  - Offer auto-repair or manual fix options
  - Show before/after preview
- **Backend:**
  - Run validation routines
  - Attempt repair (e.g., `ST_MakeValid`, deduplication)
- **Logging:** Log issues found, repairs applied

### **Step 6: Transformation & Height Conversion**
- **UI:**
  - Confirm coordinate system transformation (show source/target SRID)
  - For Swiss data, option to use SwissTopo API for height conversion
  - Show preview of transformed coordinates/heights
- **Backend:**
  - Apply transformations (proj4js, PostGIS, SwissTopo API as needed)
- **Logging:** Log transformation steps, API calls, errors

### **Step 7: Confirmation & Import**
- **UI:**
  - Summary of import plan (feature count, selected attributes, transformation summary)
  - Final confirmation dialog
- **Backend:**
  - Submit import job to server
  - Track progress, show real-time status
- **Logging:** Log import submission, server response, final status

### **Step 8: Post-Import Review**
- **UI:**
  - Show import results (success/failure, errors, warnings)
  - Link to view imported data on main map
- **Backend:**
  - Store import logs, errors, and debug info
- **Logging:** Log post-import review actions

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
- [ ] Step 1: File Selection & Upload
- [ ] Step 2: Parsing & Initial Analysis
- [ ] Step 3: Preview & Feature Selection
- [ ] Step 4: Attribute & Height Mapping
- [ ] Step 5: Validation & Repair
- [ ] Step 6: Transformation & Height Conversion
- [ ] Step 7: Confirmation & Import
- [ ] Step 8: Post-Import Review

---

**This document is a living plan. Update as design decisions are made and implementation progresses.** 