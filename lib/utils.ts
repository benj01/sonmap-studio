import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function getUserInitials(email: string): string {
  if (!email) return ''
  
  // Remove everything after @ to get just the name part
  const namePart = email.split('@')[0]
  
  // Split by common separators (dot, underscore, hyphen)
  const parts = namePart.split(/[._-]/)
  
  // Get first letter of first part and first letter of last part (if exists)
  const firstInitial = parts[0]?.[0] || ''
  const secondInitial = parts.length > 1 ? parts[parts.length - 1][0] : ''
  
  // Return uppercase initials, if only one part exists return first two letters
  return parts.length > 1
    ? `${firstInitial}${secondInitial}`.toUpperCase()
    : `${firstInitial}${parts[0]?.[1] || ''}`.toUpperCase()
}
