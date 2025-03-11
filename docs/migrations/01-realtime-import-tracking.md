# Migration: Real-time Import Tracking

## Overview
This migration switches the geo-import completion tracking from Server-Sent Events (SSE) to Supabase's real-time subscriptions. This change will make the import process more reliable by leveraging Supabase's built-in real-time capabilities.

## Current Issues
1. SSE connection timeouts during long imports
2. Unreliable completion event delivery
3. Complex stream handling and state management
4. No automatic reconnection on network issues

## Solution
Use Supabase's real-time feature to track import progress and completion by:
1. Creating a dedicated `import_logs` table
2. Enabling real-time for this table
3. Using database triggers to update import status
4. Subscribing to these updates in the client

## Implementation Steps

### 1. Database Changes

#### Create Import Logs Table
```sql
create table import_logs (
  id uuid primary key default gen_random_uuid(),
  project_file_id uuid not null references project_files(id) on delete cascade,
  status text not null check (status in ('started', 'processing', 'completed', 'failed')),
  total_features integer not null default 0,
  imported_count integer not null default 0,
  failed_count integer not null default 0,
  collection_id uuid references feature_collections(id),
  layer_id uuid references layers(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add indexes
create index import_logs_project_file_id_idx on import_logs(project_file_id);
create index import_logs_status_idx on import_logs(status);

-- Enable row level security
alter table import_logs enable row level security;

-- Add policies
create policy "Users can view import logs for their projects" on import_logs
  for select using (
    project_file_id in (
      select id from project_files
      where project_id in (
        select project_id from project_members
        where user_id = auth.uid()
      )
    )
  );

-- Enable real-time
alter publication supabase_realtime add table import_logs;

-- Add updated_at trigger
create trigger set_updated_at
  before update on import_logs
  for each row
  execute function set_updated_at();
```

#### Create Import Progress Function
```sql
create or replace function update_import_progress(
  p_import_log_id uuid,
  p_imported_count integer,
  p_failed_count integer,
  p_collection_id uuid default null,
  p_layer_id uuid default null,
  p_metadata jsonb default null
) returns void as $$
begin
  update import_logs
  set
    imported_count = p_imported_count,
    failed_count = p_failed_count,
    collection_id = coalesce(p_collection_id, collection_id),
    layer_id = coalesce(p_layer_id, layer_id),
    metadata = coalesce(p_metadata, metadata),
    status = case
      when p_imported_count + p_failed_count >= total_features then 'completed'
      else 'processing'
    end,
    updated_at = now()
  where id = p_import_log_id;
end;
$$ language plpgsql security definer;
```

### 2. Code Changes

#### Update Import Stream Route
1. Create import log at start of import
2. Update progress using database function
3. Remove SSE-specific code

#### Update GeoImportDialog Component
1. Add real-time subscription setup
2. Remove SSE handling
3. Update progress based on subscription events

### 3. Migration Steps

1. Deploy database changes
2. Deploy code changes
3. Test with existing imports
4. Monitor for any issues
5. Remove old SSE code after successful deployment

## Code Examples

### Client-side Subscription
```typescript
// In GeoImportDialog.tsx

const subscribeToImport = (importLogId: string) => {
  const subscription = supabase
    .from('import_logs')
    .on('UPDATE', (payload) => {
      if (payload.new.id === importLogId) {
        const { imported_count, failed_count, total_features, status } = payload.new;
        
        // Update progress
        const progress = Math.round((imported_count / total_features) * 100);
        setProgress(progress);
        setProgressMessage(`Imported ${imported_count} of ${total_features} features`);

        // Handle completion
        if (status === 'completed') {
          handleImportComplete({
            totalImported: imported_count,
            totalFailed: failed_count,
            collectionId: payload.new.collection_id,
            layerId: payload.new.layer_id,
            ...payload.new.metadata
          });
        }
      }
    })
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
};
```

### Server-side Import Route
```typescript
// In route.ts

export async function POST(req: Request) {
  const { fileId, features, ...importOptions } = await req.json();
  
  // Create import log
  const { data: importLog, error: createError } = await supabase
    .from('import_logs')
    .insert({
      project_file_id: fileId,
      status: 'started',
      total_features: features.length
    })
    .select()
    .single();

  if (createError) throw createError;

  try {
    // Process features in batches
    for (const batch of chunkedFeatures) {
      const result = await processFeatureBatch(batch, importOptions);
      
      // Update progress
      await supabase.rpc('update_import_progress', {
        p_import_log_id: importLog.id,
        p_imported_count: result.imported_count,
        p_failed_count: result.failed_count,
        p_collection_id: result.collection_id,
        p_layer_id: result.layer_id,
        p_metadata: result.metadata
      });
    }

    return NextResponse.json({ success: true, importLogId: importLog.id });
  } catch (error) {
    // Update status to failed
    await supabase
      .from('import_logs')
      .update({ status: 'failed' })
      .eq('id', importLog.id);

    throw error;
  }
}
```

## Benefits
1. More reliable completion tracking
2. Automatic reconnection handling
3. Real-time progress updates
4. Better error handling
5. Simpler code maintenance
6. Built-in security through RLS

## Rollback Plan
If issues are encountered:
1. Keep both systems running in parallel initially
2. Add feature flag to switch between implementations
3. Roll back to SSE if needed by disabling feature flag

## Testing Plan
1. Test with various file sizes
2. Test network interruptions
3. Test concurrent imports
4. Verify security policies
5. Test progress accuracy
6. Verify completion events

## Timeline
1. Database changes: 1 day
2. Code changes: 2 days
3. Testing: 2 days
4. Deployment and monitoring: 1 day
5. Cleanup old code: 1 day

Total estimated time: 1 week 