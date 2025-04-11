'use client'

import { useUIStore, ModalId } from '@/lib/stores/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoginForm } from '@/components/auth/auth-forms/login-form'
import { RegisterForm } from '@/components/auth/auth-forms/register-form'
import { LogManager } from '@/core/logging/log-manager'

type ModalConfig = {
  title: string
  component: React.ComponentType
}

const MODAL_COMPONENTS: Record<ModalId, ModalConfig> = {
  login: {
    title: 'Sign in to your account',
    component: LoginForm,
  },
  register: {
    title: 'Create an account',
    component: RegisterForm,
  },
}

const logger = LogManager.getInstance()

export function ModalProvider() {
  const modals = useUIStore(state => state.modals)
  const toggleModal = useUIStore(state => state.toggleModal)

  return (
    <>
      {Object.entries(MODAL_COMPONENTS).map(([id, { title, component: ModalComponent }]) => {
        const isOpen = modals[id as ModalId] || false
        logger.debug('ModalProvider', `Modal state for ${id}`, isOpen)

        return (
          <Dialog
            key={id}
            open={isOpen}
            onOpenChange={(open) => {
              logger.debug('ModalProvider', `Modal open state change for ${id}`, open)
              !open && toggleModal(id as ModalId)
            }}
          >
            <DialogContent aria-describedby="modal-description">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>
              <div id="modal-description" className="sr-only">
                {title} dialog window
              </div>
              <ModalComponent />
            </DialogContent>
          </Dialog>
        )
      })}
    </>
  )
}
