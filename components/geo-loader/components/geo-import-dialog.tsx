import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import GeoLoader from '../index'
import { LoaderResult } from 'types/geo'
import { Info } from 'lucide-react'

interface GeoImportDialogProps {
  isOpen: boolean
  onClose: () => void
  file: File | null
  onImportComplete: (result: LoaderResult) => void
}

export function GeoImportDialog({
  isOpen,
  onClose,
  file,
  onImportComplete,
}: GeoImportDialogProps) {
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  if (!file) return null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Import Geometry File</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowLogs(true)}
              title="Show Import Details"
              className="h-8 w-8"
            >
              <Info className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <GeoLoader
            file={file}
            onLoad={(result) => {
              onImportComplete(result)
              onClose()
            }}
            onCancel={onClose}
            onLogsUpdate={setLogs}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px] w-full rounded-md border p-4">
            <div className="pr-4">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No logs available yet...</p>
              ) : (
                <pre className="text-sm whitespace-pre-wrap">
                  {logs.map((log, index) => (
                    <div key={index} className="py-1">
                      {log}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
