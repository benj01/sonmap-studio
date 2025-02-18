# Geodata Import Pipeline – Original Design & Implementation Guide


## Overview
This document outlines the best-practice approach for handling the import of various geodata file types (e.g., Shapefiles, DXF, DWG, CSV, XYZ, QSI) into your web application using Supabase, PostGIS, and Mapbox. The goal is to:

1. Allow users to **upload files** into a project.
2. **Preview the spatial data** on a map.
3. **Select features or layers** for import.
4. **Import the selected data into PostGIS** for long-term storage and further analysis.

This guide emphasizes **scalability, performance, and separation of concerns** while keeping the **frontend (preview) and backend (import) stages aligned**.

---

## Core Principles
### 1. Two Separate Data Handling Concerns

| Purpose                    | Data Volume | Key Objective |
|-----------------------------|-------------|----------------|
| **Frontend Preview**         | Lightweight | Visualization, user selection |
| **Backend Full Import**      | Full-scale  | Accurate, lossless storage in PostGIS |

→ **The preview is NOT the source of truth**. The uploaded file is.

---

## Conceptual Pipeline

### A. File Upload
- User uploads geodata files (e.g., DXF, SHP, CSV) to **Supabase Storage**.
- Store **metadata** in your Supabase database:
  - File ID, Name, Type, Size, Upload Date, Project ID, etc.

---

### B. In-Memory Data Parsing & Subsetting (Frontend)
Upon user selection:
1. Download the file (or load from memory if recently uploaded).
2. Parse the file into an **in-memory “Full Data Structure”** using libraries like:
   - **Shapefile** → [shapefile-js](https://github.com/mbostock/shapefile)
   - **DXF** → [dxf-parser](https://github.com/gdsestimating/dxf-parser)
   - **CSV, XYZ** → Custom parsing (e.g., `csv-parser`)
   - **LIDAR/QSI** → Likely needs backend later (e.g., PDAL)
3. If the file is **large**, generate a **Preview Subset** containing:
   - A random sample.
   - A spatially reduced sample.
   - A simplified geometry.
4. Map each **preview feature** to its **original feature index** in the **full dataset**:
   ```javascript
   const previewFeature = {
     previewFeatureId: 0,
     originalFeatureIndex: 345,
     geometry: { /* simplified geometry */ },
     properties: { /* minimal properties */ }
   };
   ```
5. Store the **Full Dataset** in memory and **Preview Subset** for visualization.

---

### C. Preview Map
- Display the **Preview Subset** on **Mapbox GL JS** using **GeoJSON**.
- Allow users to:
  - Toggle layers.
  - Click features for selection.
- Capture **user selections (feature IDs, layers)** and **map them back to the Full Dataset**.

---

### D. User Selection Handling
Selections are **references to the Full Dataset**:
```javascript
const selectedFeatureIndices = [5, 42, 78]; // Indices in Full Dataset
```
Do **NOT** select from the preview subset; **always map back** to the full dataset.

---

### E. Import to PostGIS (Backend)
When the user finalizes the selection:
1. Send **the selected indices + file reference** to the backend:
   ```json
   {
     "fileId": "uploaded-dxf-1",
     "selectedFeatureIndices": [5, 42, 78]
   }
   ```
2. The **backend downloads and parses the full file** again (e.g., using GDAL, ogr2ogr, Python, Node.js libraries like `shapefile` or `dxf-parser`).
3. Extract **only the selected features**.
4. Convert to **PostGIS-compatible format (e.g., GeoJSON, WKT)**.
5. Insert into **PostGIS table** with necessary attributes.

---

## Recommended Data Structures

### 1. Full Dataset (Frontend)
```javascript
const fullDataset = {
  sourceFile: 'uploaded-dxf-1',
  features: [
    { id: 0, geometry: {...}, properties: {...} },
    { id: 1, geometry: {...}, properties: {...} },
    // ...
  ]
};
```

### 2. Preview Subset (Frontend)
```javascript
const previewSubset = {
  sourceFile: 'uploaded-dxf-1',
  features: [
    { previewId: 0, originalFeatureIndex: 5, geometry: {...}, properties: {...} },
    { previewId: 1, originalFeatureIndex: 42, geometry: {...}, properties: {...} }
  ]
};
```

### 3. User Selections
```javascript
const selectedFeatureIndices = [5, 42, 78];
```

---

## Libraries to Consider

| File Type | Parsing Library (Frontend) | Parsing Library (Backend) |
|-----------|-----------------------------|-----------------------------|
| Shapefile | [shapefile-js](https://github.com/mbostock/shapefile) | GDAL/ogr2ogr |
| DXF/DWG | [dxf-parser](https://github.com/gdsestimating/dxf-parser) | GDAL/LibreDWG |
| CSV/XYZ | `csv-parser` / custom | GDAL |
| LIDAR/QSI | - | PDAL |

---

## Preview Map (Frontend)
- **Mapbox GL JS** for visualization.
- Use **GeoJSON** source.
- Optimize large datasets:
  - **Reduce vertex count** for lines/polygons.
  - **Thin point clouds**.
  - **Limit feature count (e.g., max 500)**.

---

## PostGIS Storage (Backend)
- Use **Supabase Postgres with PostGIS extension**.
- Store features in **a `geometry` or `geography` column**.
- Common PostGIS insert pattern (SQL):
  ```sql
  INSERT INTO project_layers (project_id, name, geom, properties)
  VALUES ($1, $2, ST_GeomFromGeoJSON($3), $4);
  ```

---

## Error Handling & Edge Cases

| Case                          | Suggested Approach |
|-------------------------------|--------------------|
| Large Files                    | Backend parsing only (upload, then subset preview) |
| Invalid Geometries              | Validate with `ST_IsValid()` before import |
| Missing Coordinate System (DXF) | Assume CH1903+ / EPSG:2056 or prompt user |
| Empty Layers                    | Hide from selection menu |
| Mixed Geometry Types            | Separate layers by type (points, lines, polygons) |

---

## Final Key Takeaways
- **Preview = Subset = View**
- **Import = Full Data = Source of Truth**
- **Selections link back to full data indices**
- **Frontend parsing first → Backend processing later for large files**

