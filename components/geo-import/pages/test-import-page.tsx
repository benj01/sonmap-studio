'use client';

import { TestImport } from '../components/test-import';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface TestImportPageProps {
  projectId: string;
}

export function TestImportPage({ projectId }: TestImportPageProps) {
  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link 
          href={`/projects/${projectId}`}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Project
        </Link>
      </div>
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Test Import</h1>
        <p className="text-muted-foreground">
          Test the geo data import functionality with generated test data.
        </p>
      </div>
      
      <div className="h-[1px] w-full bg-border" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Import Test Data</CardTitle>
              <CardDescription>
                Generate and import test data to verify the import functionality.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TestImport projectId={projectId} />
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>About Test Import</CardTitle>
              <CardDescription>
                Information about the test import functionality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium">What is this?</h3>
                <p className="text-sm text-muted-foreground">
                  The test import functionality allows you to generate synthetic GeoJSON features
                  and import them directly into your project without needing to upload files.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">How it works</h3>
                <p className="text-sm text-muted-foreground">
                  The test import generates GeoJSON features in the Swiss LV95 (EPSG:2056) coordinate system
                  and imports them using the same database function that handles regular file imports.
                  Features are processed in batches for better performance.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Supported geometry types</h3>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>Points: Grid of points with configurable count</li>
                  <li>Polygon: Single polygon</li>
                  <li>LineString: Single linestring</li>
                  <li>Mixed: Combination of points, polygons, and linestrings</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 