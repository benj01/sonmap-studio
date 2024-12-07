'use client'

import { useEffect } from 'react'
import { useDataStore } from '@/lib/stores'
import { createClient } from '@/utils/supabase/client'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Loader2 } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  created_at: string
}

export default function NotesPage() {
  const { fetchData, cache } = useDataStore()
  const cacheKey = 'notes'

  useEffect(() => {
    const fetchNotes = async () => {
      const supabase = createClient()
      await fetchData<Note[]>(
        cacheKey,
        async () => {
          const { data, error } = await supabase
            .from('notes')
            .select('*')
            .order('created_at', { ascending: false })
          
          if (error) throw error
          return data
        },
        30000 // 30 second cache
      )
    }

    fetchNotes()
  }, [fetchData])

  const cachedData = cache[cacheKey]

  if (!cachedData) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (cachedData.error) {
    return (
      <div className="p-8 text-red-500">
        Error loading notes: {cachedData.error}
      </div>
    )
  }

  const notes = cachedData.data as Note[]

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        <h1 className="text-2xl font-bold">Your Notes</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="p-4 rounded-lg border bg-card"
            >
              <h2 className="font-semibold">{note.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {note.content}
              </p>
              <time className="mt-2 text-xs text-muted-foreground">
                {new Date(note.created_at).toLocaleDateString()}
              </time>
            </div>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  )
}