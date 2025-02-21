# File Management System

A comprehensive file management system for handling geo-data files with Supabase integration, supporting file imports, coordinate system transformations, and companion file management.

## Directory Structure

```
📂 files/
├── components/         # React components
│ ├── manager/         # File manager components
│ │ ├── index.tsx     # Main file manager component
│ │ ├── file-list.tsx # List of selected files
│ │ ├── empty-state.tsx # Empty state display
│ │ └── toolbar.tsx   # File management toolbar
│ ├── upload/         # File upload components
│ │ ├── index.tsx    # Upload component exports
│ │ ├── s3-file-upload.tsx # S3 upload component
│ │ ├── file-uploader.tsx # Drag-and-drop uploader
│ │ ├── upload-progress.tsx # Progress indicator
│ │ └── upload-dialog.tsx # Upload confirmation dialog
│ └── item/           # File item components
│   ├── index.ts     # Item component exports
│   ├── file-item.tsx # Main file item component
│   ├── file-icon.tsx # File type icon
│   ├── file-actions.tsx # File action buttons
│   └── file-metadata.tsx # File metadata display
├── hooks/             # React hooks
│ ├── useFileOperations.ts # File processing hook
│ └── useFileActions.ts # File management actions
├── utils/             # Utility functions
│ ├── file-types.ts   # File type handling
│ ├── file-processor.ts # File processing
│ └── validation.ts   # File validation
└── types/             # TypeScript types
    └── index.ts      # Type definitions
```

## Features

- Type-safe file handling with TypeScript
- Support for geo-data files:
  - Shapefile (.shp, .dbf, .shx, .prj)
  - GeoJSON (.geojson, .json)
  - KML (.kml)
  - GPX (.gpx)
- Companion file management
- File validation and processing
- Modern UI with Tailwind CSS
- Drag-and-drop file upload
- Upload progress tracking
- File grouping and validation
- Interactive file items with actions
- File type-specific icons
- Metadata display
- Storage integrations:
  - Supabase storage
  - S3-compatible storage
  - Pre-signed URL support
  - Upload progress tracking
  - Companion file handling

## Usage

### File Manager Component

```tsx
import { FileManager } from '@/components/files/components/manager';

function MyComponent() {
  return (
    <FileManager
      projectId="my-project-id"
      onFilesProcessed={(files) => {
        // Handle processed files
        console.log('Files processed:', files);
      }}
      onError={(error) => {
        // Handle errors
        console.error('Error:', error);
      }}
    />
  );
}
```

### S3 File Upload Component

```tsx
import { S3FileUpload } from '@/components/files/components/upload';

function MyComponent() {
  return (
    <S3FileUpload
      projectId="my-project-id"
      onUploadComplete={(file) => {
        console.log('Upload complete:', file);
      }}
      acceptedFileTypes={['.shp', '.geojson', '.kml']}
      maxFileSize={50 * 1024 * 1024} // 50MB (Supabase free tier limit)
    />
  );
}
```

### Using File Actions Hook

```tsx
import { useFileActions } from '@/components/files/hooks/useFileActions';

function MyComponent() {
  const { 
    isLoading,
    handleDelete,
    handleDownload,
    handleUploadComplete
  } = useFileActions({
    projectId: 'my-project-id',
    onSuccess: (message) => toast.success(message),
    onError: (error) => toast.error(error)
  });

  // Delete a file
  const deleteFile = async (fileId: string) => {
    await handleDelete(fileId);
  };

  // Download a file (includes companion files for shapefiles)
  const downloadFile = async (fileId: string) => {
    await handleDownload(fileId);
  };
}
```

## File Types

Currently supported file types with their configurations:

### Shapefile
- Main extension: `.shp`
- Required companions: `.dbf`, `.shx`
- Optional companions: `.prj`
- Size limits:
  - Main file: 2GB
  - DBF: 2GB
  - SHX: 256MB
  - PRJ: 1MB

### GeoJSON
- Extension: `.geojson`
- Size limit: 512MB
- Content validation: Checks for valid GeoJSON structure
- No companion files required

### KML
- Extension: `.kml`
- Size limit: 256MB
- No companion files required

## Database Schema

The system uses Supabase with the following tables:

### project_files
- id: uuid (primary key)
- project_id: uuid (foreign key)
- name: string
- size: number
- file_type: string
- storage_path: string
- is_imported: boolean
- source_file_id: uuid (self-reference)
- metadata: jsonb
- uploaded_at: timestamp

## Development

### Adding a New File Type

1. Add type configuration in `utils/file-types.ts`:
```typescript
export const FILE_TYPE_CONFIGS = {
  newType: {
    mainExtension: '.ext',
    description: 'New File Type',
    mimeType: 'application/x-new-type',
    maxSize: 50 * 1024 * 1024, // 50MB
    companionFiles: [
      {
        extension: '.companion',
        description: 'Companion File',
        required: true,
        maxSize: 10 * 1024 * 1024 // 10MB
      }
    ]
  }
};
```

2. Update validation rules in `utils/validation.ts`
3. Update file processor in `utils/file-processor.ts`
4. Add custom icon in `components/item/file-icon.tsx` (optional)
5. Add custom metadata display in `components/item/file-metadata.tsx` (optional)

## Contributing

1. Follow the existing code structure
2. Add comprehensive tests
3. Update documentation
4. Follow TypeScript best practices
5. Use provided utilities for file handling
6. Follow component composition patterns
7. Maintain Supabase integration patterns

## Roadmap

### Completed
- ✅ Basic file management
  - File upload with progress tracking
  - File deletion with cleanup
  - File download with companion files
  - Modern UI components
- ✅ S3 Integration
  - Direct S3 upload with pre-signed URLs
  - Progress tracking
  - Companion file support
  - Supabase storage integration

### Upcoming
1. Performance Improvements
   - Implement file chunking for large files
   - Add caching for frequently accessed files
   - Optimize companion file processing
   - Add batch processing capabilities

2. Enhanced File Support
   - Add support for more geo-data formats
   - Implement file format conversion utilities
   - Add preview generation
   - Add file comparison tools

3. Security Enhancements
   - Implement file content validation
   - Add virus scanning integration
   - Enhance access control mechanisms
   - Add audit logging

4. UI/UX Improvements
   - Add drag-and-drop file reordering
   - Implement batch operations
   - Add file preview capabilities
   - Enhance progress indicators 