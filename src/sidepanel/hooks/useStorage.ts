import { useState, useEffect, useCallback } from 'react';

/**
 * Generic reactive hook for chrome.storage.local read/write.
 * Listens for external changes and updates automatically.
 */
export function useStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    // Load initial value
    chrome.storage.local.get(key).then((result) => {
      if (result[key] !== undefined) {
        setValue(result[key] as T);
      }
    });

    // Listen for external changes
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'local' && changes[key]) {
        setValue(changes[key].newValue as T);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const setStorageValue = useCallback(
    (newValue: T) => {
      setValue(newValue);
      chrome.storage.local.set({ [key]: newValue });
    },
    [key],
  );

  return [value, setStorageValue];
}
