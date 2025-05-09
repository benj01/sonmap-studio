'use client';

import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Check, Loader2, XCircle } from 'lucide-react';
import { HeightTransformBatchService, BatchProgress } from '../services/heightTransformBatchService';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'HeightTransformProgress';

interface HeightTransformProgressProps {
  batchId: string;
  layerName: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function HeightTransformProgress({
  batchId,
  layerName,
  onComplete,
  onCancel
}: HeightTransformProgressProps) {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [startTime] = useState<number>(Date.now());

  // Get batch service instance
  const batchService = HeightTransformBatchService.getInstance();
  
  useEffect(() => {
    // Set up progress tracking
    const unsubscribe = batchService.registerProgressCallback(batchId, async (batchProgress: BatchProgress) => {
      setProgress(batchProgress);
      try {
        await dbLogger.info('Progress callback', {
          source: SOURCE,
          batchId,
          layerName,
          status: batchProgress.status,
          percentComplete: batchProgress.percentComplete
        });
      } catch (error: unknown) {
        await dbLogger.error('Error logging progress callback', {
          source: SOURCE,
          batchId,
          layerName,
          error
        });
      }
      
      // Call onComplete when batch is done
      if (batchProgress.status === 'complete' && onComplete) {
        onComplete();
      }
    });
    
    // Get initial progress
    const initialProgress = batchService.getBatchProgress(batchId);
    if (initialProgress) {
      setProgress(initialProgress);
    }
    
    // Set up timer for elapsed time
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    // Clean up
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [batchId, batchService, onComplete, startTime, layerName]);
  
  // Format elapsed time as mm:ss
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handleCancel = async () => {
    batchService.cancelBatch(batchId);
    if (onCancel) {
      onCancel();
    }
    try {
      await dbLogger.info('Batch cancelled', {
        source: SOURCE,
        batchId,
        layerName
      });
    } catch (error: unknown) {
      await dbLogger.error('Error logging batch cancel', {
        source: SOURCE,
        batchId,
        layerName,
        error
      });
    }
  };
  
  // Determine status color and icon
  const getStatusInfo = () => {
    if (!progress) return { color: 'bg-gray-300', icon: <Loader2 className="h-4 w-4 animate-spin" /> };
    
    switch (progress.status) {
      case 'pending':
        return { 
          color: 'bg-amber-500', 
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: 'Pending'
        };
      case 'in_progress':
        return { 
          color: 'bg-blue-500', 
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: 'Processing'
        };
      case 'complete':
        return { 
          color: 'bg-green-500', 
          icon: <Check className="h-4 w-4" />,
          text: 'Complete'
        };
      case 'failed':
        return { 
          color: 'bg-red-500', 
          icon: <AlertCircle className="h-4 w-4" />,
          text: 'Failed'
        };
      case 'cancelled':
        return { 
          color: 'bg-slate-500', 
          icon: <XCircle className="h-4 w-4" />,
          text: 'Cancelled'
        };
      default:
        return { 
          color: 'bg-gray-300', 
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: 'Unknown'
        };
    }
  };
  
  const statusInfo = getStatusInfo();
  const isActive = progress?.status === 'in_progress' || progress?.status === 'pending';
  
  return (
    <Card className="w-full max-w-md shadow-md">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-medium">Height Transformation</CardTitle>
          <Badge 
            variant="outline" 
            className={`${statusInfo.color} text-white px-2 py-0.5 flex items-center gap-1`}
          >
            {statusInfo.icon}
            <span>{statusInfo.text}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="py-2">
        <div className="mb-2 text-sm text-muted-foreground">{layerName}</div>
        
        <div className="grid gap-3">
          <Progress 
            value={progress?.percentComplete || 0} 
            className="h-2" 
          />
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Progress:</span>
              <span>{progress?.percentComplete || 0}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Elapsed:</span>
              <span>{formatElapsedTime(elapsedTime)}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Features:</span>
              <span>
                {progress?.processedFeatures || 0}/{progress?.totalFeatures || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Chunk:</span>
              <span>{progress?.currentChunk || 0}/{progress?.totalChunks || 0}</span>
            </div>
          </div>
          
          {progress?.failedFeatures && progress.failedFeatures > 0 && (
            <div className="text-sm text-red-500 mt-1">
              Failed features: {progress.failedFeatures}
            </div>
          )}
          
          {progress?.errorMessage && (
            <div className="text-sm text-red-500 mt-1 bg-red-50 p-2 rounded border border-red-200">
              {progress.errorMessage}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        {isActive ? (
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={handleCancel}
            className="w-full"
          >
            Cancel
          </Button>
        ) : (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onComplete}
            className="w-full"
          >
            Close
          </Button>
        )}
      </CardFooter>
    </Card>
  );
} 