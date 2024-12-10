// /types/props.ts
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

export interface LayoutProps {
 children: ReactNode
}

export interface PageProps {
 params?: Record<string, string>
 searchParams?: Record<string, string>
}