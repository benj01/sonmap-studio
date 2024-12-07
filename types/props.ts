import type { ReactNode } from 'react'

export interface AuthProviderProps {
  children: ReactNode
}

export interface ModalProviderProps {
  children?: ReactNode
}

export interface LoadingStateProps {
  text?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
} 