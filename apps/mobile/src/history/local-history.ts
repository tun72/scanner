import * as SQLite from 'expo-sqlite';
import { createSqliteScanHistory } from './sqlite-scan-history.ts';

export const localHistory = createSqliteScanHistory(() => SQLite.openDatabaseAsync('food-scanner.db'));
