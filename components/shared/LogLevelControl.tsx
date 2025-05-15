import React, { useEffect, useState } from 'react';
import { setLogLevel, getLogLevel, LogLevel } from '@/core/logging/logLevelConfig';
import { LogManager } from '@/core/logging/log-manager';

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

const GROUPS = [
  {
    name: 'API Endpoints',
    match: (src: string) => src.startsWith('api/'),
    defaultOpen: false,
  },
  {
    name: 'Cesium Components',
    match: (src: string) => src.startsWith('Cesium'),
    defaultOpen: false,
  },
  {
    name: 'Import/Geo Components',
    match: (src: string) => [
      'ImportWizard', 'GeoImportDialog', 'GeoFileUpload', 'GeoJsonParser', 'ShapefileParser',
      'FileProcessor', 'FileSelectStep', 'ParseStep', 'ReviewStep', 'ImportManager'
    ].includes(src),
    defaultOpen: true,
  },
  {
    name: 'Layer/Map Components',
    match: (src: string) => [
      'LayerList', 'LayerItem', 'MapView', 'MapContext', 'Toolbar', 'coordinates',
      'layerHooks', 'MapLayer', 'layerStore'
    ].includes(src),
    defaultOpen: false,
  },
  {
    name: 'Other',
    match: (_src: string) => true,
    defaultOpen: false,
  },
];

const LogLevelControl: React.FC<LogLevelControlProps> = ({ labelWidth = 'w-40' }) => {
  const [overrides, setOverrides] = useState<Record<string, LogLevel>>({});
  const [sources, setSources] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isDev) return;
    // Sync UI with LogManager on mount
    const logManager = LogManager.getInstance();
    const filters = logManager.getComponentFilters();
    const sorted = filters.map(([src]) => src).sort((a, b) => a.localeCompare(b));
    setSources(sorted);
    // Set initial open/closed state for groups
    const groupState: Record<string, boolean> = {};
    GROUPS.forEach(g => { groupState[g.name] = g.defaultOpen; });
    setOpenGroups(groupState);

    // Sync UI overrides with LogManager's current log levels
    const logManagerOverrides: Record<string, LogLevel> = {};
    filters.forEach(([src, lvl]) => {
      logManagerOverrides[src] = lvl.toLowerCase() as LogLevel;
    });
    // Also sync global log level
    logManagerOverrides.global = (logManager.getLogLevel().toLowerCase() as LogLevel);
    setOverrides(prev => ({ ...logManagerOverrides, ...prev }));

    // Also apply any stored overrides to LogManager (for persistence)
    const stored = getStoredOverrides();
    Object.entries(stored).forEach(([module, level]) => {
      setLogLevel(level, module === 'global' ? undefined : module);
      const managerLevel = level.toUpperCase();
      if (module === 'global') {
        logManager.setLogLevel(managerLevel as any);
      } else {
        logManager.setComponentLogLevel(module, managerLevel as any);
      }
    });
  }, []);

  const handleChange = (module: string, level: LogLevel) => {
    const newOverrides = { ...overrides, [module]: level };
    setOverrides(newOverrides);
    saveOverrides(newOverrides);
    setLogLevel(level, module === 'global' ? undefined : module);

    // --- Bridge to LogManager ---
    const logManager = LogManager.getInstance();
    // Map UI log levels to LogManager's enum (uppercased)
    const managerLevel = level.toUpperCase();
    if (module === 'global') {
      logManager.setLogLevel(managerLevel as any);
    } else {
      logManager.setComponentLogLevel(module, managerLevel as any);
    }
  };

  if (!isDev) return null;

  // Group sources
  const grouped: Record<string, string[]> = {};
  sources.forEach(src => {
    const group = GROUPS.find(g => g.match(src))?.name || 'Other';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(src);
  });

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div className="flex flex-col h-full min-h-0 mb-4 p-2 border-b border-muted">
      <h4 className="font-medium mb-2">Log Level Controls</h4>
      <div className="flex flex-col gap-2 flex-1 min-h-0">
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
        <div className="flex-1 min-h-0 overflow-y-auto border rounded bg-white mt-2">
          {GROUPS.map(group => (
            grouped[group.name]?.length ? (
              <div key={group.name} className="border-b last:border-b-0">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-2 py-2 font-semibold text-left bg-gray-50 hover:bg-gray-100 focus:outline-none"
                  onClick={() => toggleGroup(group.name)}
                  aria-expanded={openGroups[group.name]}
                >
                  <span>{group.name}</span>
                  <span>{openGroups[group.name] ? '▼' : '▶'}</span>
                </button>
                {openGroups[group.name] && (
                  <div className="pl-4 pb-2">
                    {grouped[group.name].map(module => (
                      <div key={module} className="flex items-center gap-2 py-1">
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
                )}
              </div>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
};

export default LogLevelControl; 