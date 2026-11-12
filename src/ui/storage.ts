export function getSavedHostCode(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('bspoker:host:')) {
        const code = key.replace('bspoker:host:', '');
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Date.now() - parsed.savedAt < 2 * 60 * 60 * 1000) {
            return code;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function isHostOfCurrentTab(code: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem('bspoker:hostOf') === code.toUpperCase();
  } catch {
    return false;
  }
}
