import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatFileSize, getFileTypeDescription } from '../utils';

interface FileInfoCardProps {
  name: string;
  size: number;
  type: string;
}

export function FileInfoCard({ name, size, type }: FileInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>File Information</CardTitle>
        <CardDescription>
          Details about the file to be imported
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium">Name</p>
            <p className="text-sm text-muted-foreground">{name}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Size</p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(size)}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-sm font-medium">Type</p>
            <p className="text-sm text-muted-foreground">
              {getFileTypeDescription(name)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 