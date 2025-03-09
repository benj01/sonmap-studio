import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ImportSession } from '../types';

interface ImportDetailsCardProps {
  importSession: ImportSession;
  selectedFeatureIds: number[];
}

export function ImportDetailsCard({ importSession, selectedFeatureIds }: ImportDetailsCardProps) {
  if (!importSession?.fullDataset?.metadata) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Details</CardTitle>
        <CardDescription>
          Information about the data to be imported
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium">Features</p>
            <p className="text-sm text-muted-foreground">
              {selectedFeatureIds.length} selected of {importSession.fullDataset.metadata.featureCount} total
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Geometry Types</p>
            <p className="text-sm text-muted-foreground">
              {importSession.fullDataset.metadata.geometryTypes.join(', ')}
            </p>
          </div>
          {importSession.fullDataset.metadata.srid && (
            <div>
              <p className="text-sm font-medium">Coordinate System</p>
              <p className="text-sm text-muted-foreground">
                EPSG:{importSession.fullDataset.metadata.srid}
              </p>
            </div>
          )}
          <div>
            <p className="text-sm font-medium">Properties</p>
            <p className="text-sm text-muted-foreground">
              {importSession.fullDataset.metadata.properties.length} columns
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 