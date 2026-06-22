import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock chrome API
const chromeMock = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
    sendMessage: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  scripting: {
    executeScript: vi.fn(),
  },
  sidePanel: {
    setPanelBehavior: vi.fn().mockResolvedValue(undefined),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

Object.assign(globalThis, { chrome: chromeMock });
