export type AppUpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'not-available'; version: string }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string }
