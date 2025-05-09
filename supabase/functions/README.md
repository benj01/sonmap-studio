# 📂 functions

## Overview
This folder contains 0 file(s) related to functions.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|

## 🔗 Dependencies
- [List important dependencies used in this folder]

## ⚙️ Usage Notes
- [Add any specific setup or initialization details]

## 🔄 Related Folders/Modules
- [List related folders or modules]

## 🚧 TODOs / Planned Improvements
- [List any pending tasks or improvements]

# Supabase Edge Functions

This directory contains Supabase Edge Functions that run in the Deno runtime environment.

## TypeScript Configuration

You may notice TypeScript errors in Edge Function files when viewing them in your IDE. This is expected and can be safely ignored because:

1. Edge Functions run in Deno, not Node.js
2. They use Deno's module system and types
3. The project's main TypeScript configuration is for Node.js/Next.js

### Development

When developing Edge Functions:

1. Use the Deno import syntax:
   ```typescript
   import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
   ```

2. Ignore TypeScript errors related to:
   - Cannot find module 'https://deno.land/...'
   - Cannot find name 'Deno'
   - Type definition file errors

3. Test your functions using the Supabase CLI:
   ```bash
   supabase functions serve transform-coordinates
   ```

### Deployment

Edge Functions are deployed separately from the main application using:
```bash
supabase functions deploy transform-coordinates
```

The TypeScript errors in your IDE do not affect the deployment or runtime execution of the functions.
