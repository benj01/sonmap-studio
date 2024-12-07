import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/types/store'

interface UserAvatarProps {
  user: Pick<User, 'email' | 'user_metadata'>
  className?: string
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  const avatarUrl = user.user_metadata?.avatar_url
  const initials = user.email?.[0].toUpperCase() || '?'

  return (
    <Avatar className={className}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={user.email || 'User'} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  )
} 