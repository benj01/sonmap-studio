'use client'

import React, { useCallback } from 'react'
import { useUIStore, ModalId, UIState } from '@/lib/stores/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoginForm } from '@/components/auth/auth-forms/login-form'
import { RegisterForm } from '@/components/auth/auth-forms/register-form'
import { dbLogger } from '@/utils/logging/dbLogger'

const LOG_SOURCE = 'ModalProvider'

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

export function ModalProvider() {
  const modals = useUIStore((state: UIState) => state.modals)
  const toggleModal = useUIStore((state: UIState) => state.toggleModal)

  const handleOpenChange = useCallback(async (open: boolean, id: ModalId) => {
    if (!open) {
      await dbLogger.debug('Modal state change', { 
        source: LOG_SOURCE,
        modalId: id,
        action: 'close',
        currentState: modals[id]
      });
      toggleModal(id);
    }
  }, [modals, toggleModal]);

  return (
    <>
      {Object.entries(MODAL_COMPONENTS).map(([id, { title, component: ModalComponent }]) => {
        const modalId = id as ModalId;
        const isOpen = modals[modalId] || false;

        return (
          <Dialog
            key={modalId}
            open={isOpen}
            onOpenChange={(open) => handleOpenChange(open, modalId)}
          >
            <DialogContent aria-describedby={`modal-description-${modalId}`}>
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>
              <div id={`modal-description-${modalId}`} className="sr-only">
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
