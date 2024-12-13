import { Dialog, DialogContent } from '@/components/ui/dialog'
import GeoLoader from '../index'
import { LoaderResult } from '@/types/geo'

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
  if (!file) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <GeoLoader
          file={file}
          onLoad={(result) => {
            onImportComplete(result)
            onClose()
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
