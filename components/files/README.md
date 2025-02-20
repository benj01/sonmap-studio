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
│ │ ├── file-upload.tsx # Main upload component
│ │ ├── file-uploader.tsx # Drag-and-drop uploader
│ │ ├── upload-progress.tsx # Progress indicator
│ │ └── upload-dialog.tsx # Upload confirmation dialog
│ └── item/           # File item components
│   ├── index.ts     # Item component exports
│   ├── file-item.tsx # Main file item component
│   ├── file-icon.tsx # File type icon
│   ├── file-actions.tsx # File action buttons
│   └── file-metadata.tsx # File metadata display
├── utils/             # Utility functions
│ ├── file-types.ts   # File type handling
│ ├── file-processor.ts # File processing
│ └── validation.ts   # File validation
├── hooks/             # React hooks
│ ├── useFileOperations.ts # File processing hook
│ └── useFileActions.ts # File management actions
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
  - Chunked uploads
  - Companion file handling
- Project-based file organization
- File import and conversion
- Coordinate system transformation
- Storage usage tracking
- Import metadata management

## Usage

### File Manager

```tsx
import { FileManager } from '@/components/files';

function MyComponent() {
  const handleFilesProcessed = (files: ProcessedFiles) => {
    // Handle processed files
  };

  const handleError = (error: string) => {
    // Handle error
  };

  return (
    <FileManager
      projectId="my-project"
      onFilesProcessed={handleFilesProcessed}
      onError={handleError}
    />
  );
}
```

### File Upload with Supabase Integration

```tsx
import { FileUpload } from '@/components/files';
import { useFileActions } from '@/components/files/hooks/useFileActions';

function MyComponent() {
  const { handleUploadComplete, isLoading } = useFileActions({
    projectId: 'my-project',
    onSuccess: (message) => console.log(message),
    onError: (error) => console.error(error)
  });

  return (
    <FileUpload
      projectId="my-project"
      onUploadComplete={handleUploadComplete}
      acceptedFileTypes={['.shp', '.geojson', '.kml']}
      disabled={isLoading}
      maxFileSize={1024 * 1024 * 50} // 50MB
    />
  );
}
```

### File Item with Import Support

```tsx
import { FileItem } from '@/components/files';
import { useFileActions } from '@/components/files/hooks/useFileActions';

function MyComponent({ file }: { file: ProcessedFile }) {
  const { handleImport, handleDelete, isLoading } = useFileActions({
    projectId: 'my-project'
  });

  const handleImportClick = async () => {
    const result = await loadGeoFile(file); // Your geo file loader
    await handleImport(result, file);
  };

  return (
    <FileItem
      file={file}
      isMain={true}
      onDelete={() => handleDelete(file.id)}
      onImport={handleImportClick}
      disabled={isLoading}
    />
  );
}
```

### S3 File Upload

```tsx
import { S3FileUpload } from '@/components/files';
import { useFileActions } from '@/components/files/hooks/useFileActions';

function MyComponent() {
  const handleUploadComplete = (file: UploadedFile) => {
    // Handle uploaded file
  };

  return (
    <S3FileUpload
      projectId="my-project"
      onUploadComplete={handleUploadComplete}
      acceptedFileTypes={['.shp', '.geojson', '.kml']}
      maxFileSize={1024 * 1024 * 50} // 50MB
    />
  );
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
    ],
    validateContent: async (file: File) => {
      // Implement content validation
      return true;
    }
  }
};
```

2. Add validation rules in `utils/validation.ts`
3. Update file processor in `utils/file-processor.ts`
4. Add import support in `hooks/useFileActions.ts`
5. Add custom icon in `components/item/file-icon.tsx` (optional)
6. Add custom metadata display in `components/item/file-metadata.tsx` (optional)

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
- import_metadata: jsonb
- uploaded_at: timestamp

## Contributing

1. Follow the existing code structure
2. Add comprehensive tests
3. Update documentation
4. Follow TypeScript best practices
5. Use provided utilities for file handling
6. Follow component composition patterns
7. Maintain Supabase integration patterns
8. Update import metadata schemas as needed

## Testing

```bash
npm run test
```

## Roadmap

### Completed
- ✅ Migration from old file handling system
  - Moved functionality from `core/io/file-reader.ts` to modular utilities
  - Improved type safety and error handling
  - Added comprehensive documentation
  - Enhanced file validation and processing
- ✅ S3 Integration
  - Implemented direct S3 upload with pre-signed URLs
  - Added progress tracking for S3 uploads
  - Added companion file support
  - Integrated with Supabase storage
  - Added error handling and retries

### 1. Performance Improvements
- Implement file chunking for large files
- Add caching for frequently accessed files
- Optimize companion file processing
- Add batch processing capabilities

### 2. Enhanced File Support
- Add support for more geo-data formats:
  - TopoJSON
  - GML (Geography Markup Language)
  - CSV with geo-coordinates
- Implement file format conversion utilities
- Add preview generation for supported formats

### 3. Security Enhancements
- Implement file content validation
- Add virus scanning integration
- Enhance access control mechanisms
- Add audit logging for file operations

### 4. UI/UX Improvements
- Add drag-and-drop file reordering
- Implement batch file operations
- Add file preview capabilities
- Enhance progress indicators
- Add file comparison tools

### 5. Testing Coverage
- Add end-to-end tests
- Increase unit test coverage
- Add performance benchmarks
- Implement stress testing for large files

To contribute to these improvements, please follow the contributing guidelines and submit PRs for review. 