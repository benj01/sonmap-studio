'use client';

import React, { useState, useEffect } from 'react';
import { useUserSettings, UserSettings } from '@/hooks/useUserSettings';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { settings, isLoading, updateSettings } = useUserSettings();
  const [maxFileSize, setMaxFileSize] = useState<number>(50);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      // Convert from bytes to MB for display
      setMaxFileSize(Math.round((settings.maxFileSize || 50 * 1024 * 1024) / (1024 * 1024)));
      setTheme(settings.theme || 'system');
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Convert MB to bytes for storage
      const newSettings: Partial<UserSettings> = {
        maxFileSize: maxFileSize * 1024 * 1024,
        theme
      };
      
      const success = await updateSettings(newSettings);
      if (success) {
        toast.success('Settings saved successfully');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('An error occurred while saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">User Settings</h1>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>File Upload Settings</CardTitle>
              <CardDescription>
                Configure maximum file size for uploads
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="maxFileSize">Maximum File Size (MB)</Label>
                  <Input
                    id="maxFileSize"
                    type="number"
                    value={maxFileSize}
                    onChange={(e) => setMaxFileSize(parseInt(e.target.value) || 50)}
                    min={1}
                    max={1024}
                  />
                  <p className="text-sm text-muted-foreground">
                    Note: The storage provider may have its own limits that cannot be exceeded.
                    Free Supabase plans have a 50MB limit per file.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the appearance of the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={theme} onValueChange={(value: 'light' | 'dark' | 'system') => setTheme(value)}>
                    <SelectTrigger id="theme">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
} 