'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'userPreferenceStore';

/**
 * Height source preference configuration
 */
export interface HeightSourcePreference {
  // Primary mode
  mode?: 'simple' | 'advanced';
  
  // Simple mode fields (backward compatible)
  type: 'z_coord' | 'attribute' | 'none';
  attributeName?: string;
  interpretationMode?: 'absolute' | 'relative' | 'extrusion';
  
  // Advanced mode
  advanced?: {
    baseElevation: {
      source: 'z_coord' | 'attribute' | 'terrain';
      attributeName?: string;
      isAbsolute: boolean;
    };
    heightConfig: {
      source: 'attribute' | 'calculated' | 'none';
      attributeName?: string;
      isRelative: boolean;
    };
    visualization: {
      type: 'extrusion' | 'point_elevation' | 'line_elevation';
      extrudedFaces?: boolean;
      extrudedTop?: boolean;
    };
  };
}

/**
 * User preferences data structure
 */
export interface UserPreferences {
  // Height source preferences
  heightSourcePreference: HeightSourcePreference;
  
  // Add more preference categories here as needed
}

/**
 * User preference store interface
 */
export interface PreferenceStore {
  // State
  preferences: UserPreferences;
  
  // Actions
  setHeightSourcePreference: (preference: HeightSourcePreference) => void;
  reset: () => void;
}

// Initial state for preferences
const initialState: UserPreferences = {
  heightSourcePreference: {
    type: 'z_coord'  // Default to Z coordinates if available
  }
};

/**
 * Preference store with persistence
 * Uses localStorage to save preferences between sessions
 */
export const usePreferenceStore = create<PreferenceStore>()(
  persist(
    (set) => ({
      // Initial state
      preferences: initialState,
      
      // Actions
      setHeightSourcePreference: (preference) => {
        (async () => {
          await dbLogger.info('Setting height source preference', { preference }, { source: SOURCE });
        })();
        set(state => ({
          preferences: {
            ...state.preferences,
            heightSourcePreference: preference
          }
        }));
      },
      
      // Reset all preferences to defaults
      reset: () => {
        (async () => {
          await dbLogger.info('Resetting user preferences', { action: 'reset' }, { source: SOURCE });
        })();
        set({ preferences: initialState });
      }
    }),
    {
      name: 'user-preferences', // Storage key in localStorage
      partialize: (state) => ({
        preferences: state.preferences
      })
    }
  )
);

/**
 * Hook to get height source preferences
 */
export const useHeightSourcePreference = () => {
  const { preferences, setHeightSourcePreference } = usePreferenceStore();
  
  return {
    heightSourcePreference: preferences.heightSourcePreference,
    setHeightSourcePreference
  };
}; 