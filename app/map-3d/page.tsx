'use client';

import { MapContainer } from '@/components/map/components/MapContainer';

export default function Map3DPage() {
  return (
    <div className="flex flex-col w-full h-screen">
      <div className="p-4 bg-background border-b">
        <h1 className="text-2xl font-bold">3D Map Example</h1>
        <p className="text-muted-foreground">
          This page demonstrates the 3D map functionality using CesiumJS.
          Use the toggle in the top right to switch between 2D and 3D views.
        </p>
      </div>
      <div className="flex-1 relative">
        <MapContainer 
          initialViewState3D={{
            latitude: 0,
            longitude: 0,
            height: 10000000
          }}
        />
      </div>
    </div>
  );
} 