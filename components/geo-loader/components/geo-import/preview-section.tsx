import { PreviewSectionProps } from './types';
import { PreviewMap } from '../preview-map';

export function PreviewSection({
  previewManager,
  bounds,
  coordinateSystem,
  visibleLayers,
  analysis
}: PreviewSectionProps) {
  // Get the preview collections from the manager
  const { points, lines, polygons } = previewManager.getPreviewCollections();
  
  // Combine all features into one collection for the map
  const preview = {
    type: 'FeatureCollection' as const,
    features: [
      ...points.features,
      ...lines.features,
      ...polygons.features
    ]
  };

  return (
    <div className="border rounded-lg p-4">
      <h4 className="text-sm font-medium mb-2">Preview</h4>
      <div className="h-[400px] w-full bg-accent rounded-md overflow-hidden">
        <PreviewMap
          preview={preview}
          bounds={bounds}
          coordinateSystem={coordinateSystem}
          visibleLayers={visibleLayers}
          analysis={analysis}
        />
      </div>
    </div>
  );
}
