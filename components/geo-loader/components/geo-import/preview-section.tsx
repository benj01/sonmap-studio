import { useState, useEffect } from 'react';
import { PreviewSectionProps } from './types';
import { PreviewMap } from '../preview-map';
import { FeatureCollection } from 'geojson';

export function PreviewSection({
  previewManager,
  bounds,
  coordinateSystem,
  visibleLayers,
  analysis
}: PreviewSectionProps) {
  const [preview, setPreview] = useState<FeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadPreview() {
      setIsLoading(true);
      try {
        const { points, lines, polygons } = await previewManager.getPreviewCollections();
        
        // Combine all features into one collection for the map
        setPreview({
          type: 'FeatureCollection',
          features: [
            ...points.features,
            ...lines.features,
            ...polygons.features
          ]
        });
      } catch (error) {
        console.error('Failed to load preview:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreview();
  }, [previewManager]);

  return (
    <div className="border rounded-lg p-4">
      <h4 className="text-sm font-medium mb-2">Preview</h4>
      <div className="h-[400px] w-full bg-accent rounded-md overflow-hidden">
        {isLoading ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
            Loading preview...
          </div>
        ) : (
          <PreviewMap
            preview={preview}
            bounds={bounds}
            coordinateSystem={coordinateSystem}
            visibleLayers={visibleLayers}
            analysis={analysis}
          />
        )}
      </div>
    </div>
  );
}
