import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatFileSize, getFileTypeDescription } from '../utils';

interface FileInfoCardProps {
  name: string;
  size: number;
  type: string;
}

export function FileInfoCard({ name, size, type }: FileInfoCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">File Information</CardTitle>
        <CardDescription className="text-xs">
          Details about the file to be imported
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium">Name</p>
            <p className="text-xs text-muted-foreground">{name}</p>
          </div>
          <div>
            <p className="text-xs font-medium">Size</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(size)}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-xs font-medium">Type</p>
            <p className="text-xs text-muted-foreground">
              {getFileTypeDescription(name)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 