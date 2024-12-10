import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function getUserInitials(email: string): string {
  if (!email) return ''
  
  // Remove everything after @ in email
  const name = email.split('@')[0]
  
  // Split by common separators and get words
  const words = name.split(/[-._]/)
  
  if (words.length >= 2) {
    // If we have multiple words, take first letter of first and last word
    return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  } else {
    // If single word, take first two letters or pad with X
    return (words[0][0] + (words[0][1] || 'X')).toUpperCase()
  }
}