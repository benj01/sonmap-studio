import React, { useRef, useCallback } from 'react';

interface ToolbarProps {
  onFileSelect: (files: FileList) => void;
  isProcessing: boolean;
}

export function Toolbar({ onFileSelect, isProcessing }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    // Prevent duplicate processing
    if (processingRef.current) {
      console.info('[Toolbar] Skipping duplicate file change event');
      return;
    }

    console.info('[Toolbar] File input change event', {
      hasFiles: !!event.target.files,
      fileCount: event.target.files?.length || 0
    });

    const files = event.target.files;
    if (files && files.length > 0) {
      processingRef.current = true;
      console.info('[Toolbar] Files selected', {
        count: files.length,
        names: Array.from(files).map(f => f.name)
      });
      onFileSelect(files);
      
      // Reset processing flag after a short delay
      setTimeout(() => {
        processingRef.current = false;
      }, 1000);
      
      // Reset input value to allow selecting the same file again
      event.target.value = '';
    }
  }, [onFileSelect]);

  const handleButtonClick = useCallback(() => {
    if (isProcessing || processingRef.current) {
      console.info('[Toolbar] Skipping button click - processing in progress');
      return;
    }
    
    console.info('[Toolbar] Select Files button clicked', {
      isProcessing,
      hasInputRef: !!fileInputRef.current
    });
    fileInputRef.current?.click();
  }, [isProcessing]);

  return (
    <div className="flex items-center gap-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        accept=".shp,.dbf,.shx,.prj,.geojson,.json,.kml,.gpx,.qmd"
      />
      <button
        onClick={handleButtonClick}
        disabled={isProcessing}
        className={`
          px-4 py-2 rounded-lg font-medium text-white
          ${isProcessing
            ? 'bg-blue-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
          }
        `}
      >
        {isProcessing ? (
          <div className="flex items-center">
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing...
          </div>
        ) : (
          'Select Files'
        )}
      </button>
    </div>
  );
} 