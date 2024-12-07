'use client'

import { useUIStore } from '@/lib/stores/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoginForm } from '@/components/auth/auth-forms/login-form'
import { RegisterForm } from '@/components/auth/auth-forms/register-form'

type ModalConfig = {
  title: string
  component: React.ComponentType
}

const MODAL_COMPONENTS: Record<string, ModalConfig> = {
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
  const modals = useUIStore(state => state.modals)
  const toggleModal = useUIStore(state => state.toggleModal)

  return (
    <>
      {(Object.entries(MODAL_COMPONENTS)).map(([id, { title, component: ModalComponent }]) => {
        const isOpen = modals[id] || false

        return (
          <Dialog
            key={id}
            open={isOpen}
            onOpenChange={(open) => {
              if (!open) toggleModal(id)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>
              <ModalComponent />
            </DialogContent>
          </Dialog>
        )
      })}
    </>
  )
}