import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ImportSession } from '../types';

interface ImportDetailsCardProps {
  importSession: ImportSession;
  selectedFeatureIds: number[];
}

export function ImportDetailsCard({ importSession, selectedFeatureIds }: ImportDetailsCardProps) {
  if (!importSession?.fullDataset?.metadata) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Import Details</CardTitle>
        <CardDescription className="text-xs">
          Information about the data to be imported
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium">Features</p>
            <p className="text-xs text-muted-foreground">
              {selectedFeatureIds.length} selected of {importSession.fullDataset.metadata.featureCount} total
            </p>
          </div>
          <div>
            <p className="text-xs font-medium">Geometry Types</p>
            <p className="text-xs text-muted-foreground">
              {importSession.fullDataset.metadata.geometryTypes.join(', ')}
            </p>
          </div>
          {importSession.fullDataset.metadata.srid && (
            <div>
              <p className="text-xs font-medium">Coordinate System</p>
              <p className="text-xs text-muted-foreground">
                EPSG:{importSession.fullDataset.metadata.srid}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium">Properties</p>
            <p className="text-xs text-muted-foreground">
              {importSession.fullDataset.metadata.properties.length} columns
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 