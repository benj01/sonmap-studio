# 📂 supabase

## Overview
This folder contains Supabase client utilities for browser and server environments.

## 📄 Files in this folder

| File Name | Description |
|-----------|-------------|
| `client.ts` | Browser-side Supabase client with cookie handling |
| `check-env-vars.ts` | Environment variable validation |
| `middleware.ts` | Next.js middleware for Supabase auth |
| `s3.ts` | S3 storage utilities |
| `server-client.ts` | Server-side Supabase client |
| `server.ts` | Server utilities |

## 🔗 Dependencies
- @supabase/ssr
- @supabase/supabase-js
- next

## ⚙️ Usage Notes
- The `client.ts` file provides a singleton Supabase client for browser environments
- The `server-client.ts` file provides server-side Supabase client functionality
- Both clients handle cookies consistently for authentication

## 🔄 Related Folders/Modules
- /components/auth
- /app/auth
- /middleware.ts

## 🚧 TODOs / Planned Improvements
- Add comprehensive error handling
- Add request retries for failed operations
- Add caching layer for frequently accessed data
