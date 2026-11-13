export interface AppPreferences {
  editorFontSize: 12 | 13 | 14 | 16 | 18
  tabSize: 2 | 4 | 8
  wordWrap: boolean
  lineNumbers: boolean
  confirmBeforeDiscard: boolean
  defaultAiMode: 'chat' | 'agent'
  includeActiveFile: boolean
}

export const defaultPreferences: AppPreferences = {
  editorFontSize: 13,
  tabSize: 4,
  wordWrap: true,
  lineNumbers: true,
  confirmBeforeDiscard: true,
  defaultAiMode: 'agent',
  includeActiveFile: true,
}

const preferenceKey = 'codeteo.preferences.v1'

export function readPreferences(): AppPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? 'null')
    if (!value || typeof value !== 'object') return defaultPreferences
    const saved = value as Partial<AppPreferences>
    return {
      editorFontSize: [12, 13, 14, 16, 18].includes(saved.editorFontSize as number)
        ? saved.editorFontSize as AppPreferences['editorFontSize'] : defaultPreferences.editorFontSize,
      tabSize: [2, 4, 8].includes(saved.tabSize as number) ? saved.tabSize as AppPreferences['tabSize'] : defaultPreferences.tabSize,
      wordWrap: typeof saved.wordWrap === 'boolean' ? saved.wordWrap : defaultPreferences.wordWrap,
      lineNumbers: typeof saved.lineNumbers === 'boolean' ? saved.lineNumbers : defaultPreferences.lineNumbers,
      confirmBeforeDiscard: typeof saved.confirmBeforeDiscard === 'boolean' ? saved.confirmBeforeDiscard : defaultPreferences.confirmBeforeDiscard,
      defaultAiMode: saved.defaultAiMode === 'chat' || saved.defaultAiMode === 'agent' ? saved.defaultAiMode : defaultPreferences.defaultAiMode,
      includeActiveFile: typeof saved.includeActiveFile === 'boolean' ? saved.includeActiveFile : defaultPreferences.includeActiveFile,
    }
  } catch {
    return defaultPreferences
  }
}

export function writePreferences(preferences: AppPreferences): void {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences))
  } catch {
    // Keep the current session usable when browser storage is disabled or full.
  }
}
