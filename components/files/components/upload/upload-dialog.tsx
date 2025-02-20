import React from 'react';
import { FileGroup } from '../../types';
import { FileTypeUtil } from '../../utils/file-types';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fileGroup: FileGroup | null;
  isUploading: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function UploadDialog({
  open,
  onClose,
  onConfirm,
  fileGroup,
  isUploading
}: UploadDialogProps) {
  if (!open || !fileGroup) return null;

  const totalSize = fileGroup.mainFile.size + 
    fileGroup.companions.reduce((acc, file) => acc + file.size, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Confirm Upload
          </h3>

          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="font-medium text-gray-700 mb-2">
                Main File
              </div>
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <div>
                  <div className="text-sm font-medium">
                    {fileGroup.mainFile.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {FileTypeUtil.getMimeType(fileGroup.mainFile.name)} • {formatFileSize(fileGroup.mainFile.size)}
                  </div>
                </div>
              </div>
            </div>

            {fileGroup.companions.length > 0 && (
              <div className="border rounded-lg p-4">
                <div className="font-medium text-gray-700 mb-2">
                  Companion Files
                </div>
                <div className="space-y-2">
                  {fileGroup.companions.map((file, index) => (
                    <div key={index} className="flex items-center">
                      <svg
                        className="w-5 h-5 mr-2 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                      <div>
                        <div className="text-sm font-medium">
                          {file.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {FileTypeUtil.getMimeType(file.name)} • {formatFileSize(file.size)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-500">
              Total size: {formatFileSize(totalSize)}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className={`
              px-4 py-2 rounded-lg font-medium
              ${isUploading
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
              }
            `}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isUploading}
            className={`
              px-4 py-2 rounded-lg font-medium text-white
              ${isUploading
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
              }
            `}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
} 