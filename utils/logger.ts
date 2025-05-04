// MIGRATION: This file now re-exports the async dbLogger. Legacy Logger, LogManager, and createLogger patterns are removed.
// See debug.mdc and cursor_rules.mdc for migration details.

import { dbLogger } from '@/utils/logging/dbLogger';

export { dbLogger }; 