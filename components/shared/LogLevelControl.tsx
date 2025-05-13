import React, { useEffect, useState } from 'react';
import { setLogLevel, getLogLevel, LogLevel } from '@/core/logging/logLevelConfig';

const MODULES = [
  'MapPreview',
  'ImportWizard',
  'ShapefileParser',
  'FileProcessor',
  'FileSelectStep',
  'ParseStep',
];

const LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'none'];

const STORAGE_KEY = 'logLevelOverrides';

function getStoredOverrides(): Record<string, LogLevel> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveOverrides(overrides: Record<string, LogLevel>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

const isDev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;

interface LogLevelControlProps {
  labelWidth?: string;
}

const LogLevelControl: React.FC<LogLevelControlProps> = ({ labelWidth = 'w-40' }) => {
  const [overrides, setOverrides] = useState<Record<string, LogLevel>>({});

  useEffect(() => {
    if (!isDev) return;
    const stored = getStoredOverrides();
    setOverrides(stored);
    // Apply stored overrides
    Object.entries(stored).forEach(([module, level]) => {
      setLogLevel(level, module === 'global' ? undefined : module);
    });
  }, []);

  const handleChange = (module: string, level: LogLevel) => {
    const newOverrides = { ...overrides, [module]: level };
    setOverrides(newOverrides);
    saveOverrides(newOverrides);
    setLogLevel(level, module === 'global' ? undefined : module);
  };

  if (!isDev) return null;

  return (
    <div className="mb-4 p-2 border-b border-muted">
      <h4 className="font-medium mb-2">Log Level Controls</h4>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className={`font-mono pr-2 ${labelWidth}`}>Global</label>
          <select
            className="border rounded px-2 py-1 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            value={overrides.global || getLogLevel()}
            onChange={e => handleChange('global', e.target.value as LogLevel)}
          >
            {LOG_LEVELS.map(lvl => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </select>
        </div>
        {MODULES.map(module => (
          <div key={module} className="flex items-center gap-2">
            <label className={`font-mono pr-2 ${labelWidth}`}>{module}</label>
            <select
              className="border rounded px-2 py-1 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={overrides[module] || getLogLevel(module)}
              onChange={e => handleChange(module, e.target.value as LogLevel)}
            >
              {LOG_LEVELS.map(lvl => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogLevelControl; 