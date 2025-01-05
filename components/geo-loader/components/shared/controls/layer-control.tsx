import React from 'react';
import { ControlProps } from '../types';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  selected?: boolean;
  color?: string;
  count?: number;
}

interface LayerControlProps extends ControlProps {
  layers: Layer[];
  onVisibilityChange: (id: string, visible: boolean) => void;
  onSelectionChange?: (id: string, selected: boolean) => void;
  showCounts?: boolean;
  allowMultiSelect?: boolean;
}

export function LayerControl({
  layers,
  onVisibilityChange,
  onSelectionChange,
  showCounts = false,
  allowMultiSelect = false,
  className = '',
  disabled = false
}: LayerControlProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {layers.map(layer => (
        <div
          key={layer.id}
          className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md"
        >
          <div className="flex items-center space-x-3">
            {/* Visibility toggle */}
            <button
              type="button"
              className={`
                p-1 rounded-md
                ${layer.visible ? 'text-blue-600' : 'text-gray-400'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}
              `}
              onClick={() => !disabled && onVisibilityChange(layer.id, !layer.visible)}
              disabled={disabled}
            >
              {layer.visible ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                  />
                  <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                </svg>
              )}
            </button>

            {/* Layer name and color */}
            <div className="flex items-center space-x-2">
              {layer.color && (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
              )}
              <span className="text-sm text-gray-700">{layer.name}</span>
              {showCounts && layer.count !== undefined && (
                <span className="text-xs text-gray-500">({layer.count})</span>
              )}
            </div>
          </div>

          {/* Selection checkbox */}
          {onSelectionChange && (
            <div className="flex items-center">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                checked={layer.selected || false}
                onChange={(e) => !disabled && onSelectionChange(layer.id, e.target.checked)}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
