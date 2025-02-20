import React, { useRef } from 'react';
import { FileTypeUtil } from '../../utils/file-types';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  acceptedFileTypes?: string[];
  disabled?: boolean;
  maxFileSize?: number;
}

export function FileUploader({
  onFilesSelected,
  acceptedFileTypes,
  disabled,
  maxFileSize
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files));
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (!disabled) {
      dropZoneRef.current?.classList.add('border-blue-500');
    }
  };

  const handleDragLeave = () => {
    dropZoneRef.current?.classList.remove('border-blue-500');
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dropZoneRef.current?.classList.remove('border-blue-500');

    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const acceptString = acceptedFileTypes?.join(',') || 
    '.shp,.dbf,.shx,.prj,.geojson,.json,.kml,.gpx';

  return (
    <div
      ref={dropZoneRef}
      className={`
        relative border-2 border-dashed rounded-lg p-8
        transition-colors duration-200 ease-in-out
        ${disabled
          ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
          : 'border-gray-400 hover:border-blue-500 cursor-pointer'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={disabled ? undefined : handleButtonClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        accept={acceptString}
        disabled={disabled}
      />
      
      <div className="text-center">
        <svg
          className={`w-12 h-12 mx-auto mb-4 ${disabled ? 'text-gray-400' : 'text-gray-600'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className={`text-lg font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
          Drop files here or click to select
        </p>
        <p className={`text-sm mt-2 ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
          Supported formats: Shapefile, GeoJSON, KML, GPX
        </p>
      </div>
    </div>
  );
} 