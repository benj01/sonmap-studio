import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface UserSettings {
  maxFileSize?: number; // Maximum file size in bytes
  defaultProjectId?: string;
  theme?: 'light' | 'dark' | 'system';
  // Add other user settings as needed
}

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadUserSettings() {
      try {
        setIsLoading(true);
        const supabase = createClient();
        
        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          setSettings(getDefaultSettings());
          return;
        }

        // Get user settings from database
        const { data, error: settingsError } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          throw settingsError;
        }

        if (data) {
          setSettings({
            maxFileSize: data.max_file_size || getDefaultSettings().maxFileSize,
            defaultProjectId: data.default_project_id,
            theme: data.theme || getDefaultSettings().theme,
          });
        } else {
          // No settings found, use defaults
          setSettings(getDefaultSettings());
        }
      } catch (err) {
        console.error('Error loading user settings:', err);
        setError(err instanceof Error ? err : new Error('Failed to load user settings'));
        // Still set default settings on error
        setSettings(getDefaultSettings());
      } finally {
        setIsLoading(false);
      }
    }

    loadUserSettings();
  }, []);

  // Function to update user settings
  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    try {
      const supabase = createClient();
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No authenticated user');

      // Prepare data for database
      const dbSettings = {
        user_id: user.id,
        max_file_size: newSettings.maxFileSize !== undefined 
          ? newSettings.maxFileSize 
          : settings?.maxFileSize,
        default_project_id: newSettings.defaultProjectId !== undefined 
          ? newSettings.defaultProjectId 
          : settings?.defaultProjectId,
        theme: newSettings.theme !== undefined 
          ? newSettings.theme 
          : settings?.theme,
      };

      // Upsert settings
      const { error: updateError } = await supabase
        .from('user_settings')
        .upsert(dbSettings, { onConflict: 'user_id' });

      if (updateError) throw updateError;

      // Update local state
      setSettings(prev => prev ? { ...prev, ...newSettings } : newSettings);
      
      return true;
    } catch (err) {
      console.error('Error updating user settings:', err);
      setError(err instanceof Error ? err : new Error('Failed to update user settings'));
      return false;
    }
  };

  // Default settings
  function getDefaultSettings(): UserSettings {
    return {
      maxFileSize: 50 * 1024 * 1024, // 50MB default
      theme: 'system',
    };
  }

  return {
    settings: settings || getDefaultSettings(),
    isLoading,
    error,
    updateSettings,
  };
} 