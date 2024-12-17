import { PreviewSectionProps } from './types';
import { PreviewMap } from '../preview-map';

export function PreviewSection({
  preview,
  bounds,
  coordinateSystem,
  visibleLayers
}: PreviewSectionProps) {
  return (
    <div className="border rounded-lg p-4">
      <h4 className="text-sm font-medium mb-2">Preview</h4>
      <div className="h-[400px] w-full bg-accent rounded-md overflow-hidden">
        <PreviewMap
          preview={preview}
          bounds={bounds}
          coordinateSystem={coordinateSystem}
          visibleLayers={visibleLayers}
        />
      </div>
    </div>
  );
}
