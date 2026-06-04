import type {PendingAuthRecord} from './types';

export async function savePendingAuthRecord(
  _record: PendingAuthRecord,
): Promise<void> {
  throw new Error(
    'SQLite offline auth storage is not wired yet. Add a cross-platform SQLite package, insert pending attendance rows locally, and delete them only after AWS sync acknowledgment.',
  );
}

export async function clearPendingAuthRecords(): Promise<void> {
  throw new Error('SQLite offline auth storage is not wired yet.');
}
