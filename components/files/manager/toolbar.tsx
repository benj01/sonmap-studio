import { Button } from 'components/ui/button';
import { Grid, List } from 'lucide-react';
import { S3FileUpload } from '../s3-file-upload';
import { FileToolbarProps } from './types';
import { CardTitle, CardDescription } from 'components/ui/card';

export function FileToolbar({
  viewMode,
  onViewModeChange,
  projectId,
  onUploadComplete
}: FileToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <CardTitle>Project Files</CardTitle>
        <CardDescription>
          Upload and manage your project files
        </CardDescription>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center border rounded-lg">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
        <S3FileUpload
          projectId={projectId}
          onUploadComplete={onUploadComplete}
        />
      </div>
    </div>
  );
}
