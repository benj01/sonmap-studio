'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { CustomUser } from '@/types'
import { getUserInitials } from '@/lib/utils'
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  user: Pick<CustomUser, 'email' | 'user_metadata'>
  className?: string
  fallbackClassName?: string
  size?: 'sm' | 'md' | 'lg'
}

export function UserAvatar({ 
  user, 
  className = '', 
  fallbackClassName = '',
  size = 'md' 
}: UserAvatarProps) {
  const avatarUrl = user.user_metadata?.avatar_url
  const initials = getUserInitials(user.email || '')

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base'
  }

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={user.email || 'User avatar'} 
          referrerPolicy="no-referrer"
          className="object-cover"
        />
      )}
      <AvatarFallback 
        className={cn(
          "bg-primary/10 text-primary font-medium",
          fallbackClassName
        )}
        delayMs={600}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}