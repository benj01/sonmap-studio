---
description: 
globs: 
alwaysApply: true
---
# LogManager (Singleton) - Use it for the current issue. Deactivate logs that are not related to the current issue so we can focus

- Located in core/logging/log-manager.ts
- Implements a singleton pattern for centralized logging
- Supports multiple log levels: DEBUG, INFO, WARN, ERROR
- Includes features like rate limiting and source-specific filtering


Log Level Management
- Global log level setting (defaults to INFO)
- Component-specific log levels
- Hierarchical log level checking (source-specific overrides global)

Rate Limiting
- Implements rate limiting to prevent log spam
- Different rate limits for development (100ms) and production (1000ms)
- Tracks last log time per unique log entry

Memory Management
- Maximum log limit of 10,000 entries
- Automatic trimming of old logs when limit is reached

Data Sanitization
- Safe stringification of log data
- Handles circular references
- Truncates large arrays and objects
- Special handling for Error objects
- Omits internal properties and functions

Component-Specific Logging
The system pre-configures log levels for different components:

Core Components (INFO level)
- Auth
- FileManager
- ImportManager

UI Components (WARN level)
- LayerList
- LayerItem
- MapContext
- Toolbar