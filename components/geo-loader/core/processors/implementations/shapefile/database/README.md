# 📂 database

## Overview
This folder contains the database transaction management system for importing Shapefile data into PostGIS. It provides batch processing capabilities, transaction handling, and progress tracking for efficient and reliable data imports.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `index.ts` | Entry point that exports the TransactionManager and related types for database operations in shapefile imports. |
| `transaction.ts` | Implements transaction management and batch processing for PostGIS feature imports, including spatial index creation and progress tracking. |

## 🔗 Dependencies
- PostGISClient for database operations
- PostGIS feature types
- Database import result types
- Base transaction types
- Query execution utilities
- Error handling system

## ⚙️ Usage Notes
- Supports batch processing with configurable batch sizes
- Provides transaction management with rollback capabilities
- Tracks import progress and batch completion
- Creates spatial indexes for imported data
- Handles failed imports gracefully
- Supports both transactional and non-transactional modes
- Includes detailed import statistics
- Manages PostGIS schema and table operations

## 🔄 Related Folders/Modules
- PostGIS client implementation
- Feature type definitions
- Database error handling
- Import result tracking
- Schema management
- Spatial indexing system
- Progress monitoring

## 🚧 TODOs / Planned Improvements
- Add support for parallel batch processing
- Implement transaction retry logic
- Add index optimization capabilities
- Enhance error recovery mechanisms
- Add support for custom schemas
- Implement batch validation
- Add transaction isolation level controls
- Enhance progress reporting granularity