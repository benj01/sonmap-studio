import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { redirect } from "next/navigation"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input)
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function getUserInitials(name: string): string {
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) 
    || '??'
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(
    { length }, 
    () => chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('')
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return function executedFunction(...args: Parameters<T>) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('Failed to copy text:', err)
    return false
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred'
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' 
    && value !== null 
    && !Array.isArray(value) 
    && Object.getPrototypeOf(value) === Object.prototype
}

export function createSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function encodedRedirect(
  type: "error" | "success",
  path: string,
  message: string,
): never {
  return redirect(`${path}?${type}=${encodeURIComponent(message)}`)
}