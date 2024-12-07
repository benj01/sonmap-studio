'use client'

import { useUIStore } from '@/lib/stores'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoginForm } from '@/components/auth/login-form'
import { RegisterForm } from '@/components/auth/register-form'

const MODAL_COMPONENTS = {
  login: {
    title: 'Sign in to your account',
    component: LoginForm,
  },
  register: {
    title: 'Create an account',
    component: RegisterForm,
  },
} as const

export function ModalProvider() {
  const modals = useUIStore(state => state.modals)
  const toggleModal = useUIStore(state => state.toggleModal)

  return (
    <>
      {(Object.keys(MODAL_COMPONENTS) as Array<keyof typeof MODAL_COMPONENTS>).map(
        (modalId) => {
          const { title, component: ModalComponent } = MODAL_COMPONENTS[modalId]
          const isOpen = modals[modalId] || false

          return (
            <Dialog
              key={modalId}
              open={isOpen}
              onOpenChange={() => toggleModal(modalId)}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <ModalComponent />
              </DialogContent>
            </Dialog>
          )
        }
      )}
    </>
  )
} 