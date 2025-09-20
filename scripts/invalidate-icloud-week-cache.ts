// Script to invalidate iCloud week cache for a given week
import { invalidateCache }from '../backend/src/cache';

const weekKey = 'icloud:week:2025_09_15:2025_09_21';

(async () => {
  await invalidateCache(weekKey);
  console.log('Invalidated cache for', weekKey);
})();
