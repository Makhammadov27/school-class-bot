// A shared SQLite claim prevents duplicate runs from PM2 or another bot process.
// Claims are retained after errors: reminders must never be sent twice for a slot.
export async function claimScheduledRun(db, job, slot) {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ScheduledRun (
    job TEXT NOT NULL, slot TEXT NOT NULL, PRIMARY KEY (job, slot)
  )`);
  const inserted = await db.$executeRaw`INSERT OR IGNORE INTO ScheduledRun (job, slot) VALUES (${job}, ${slot})`;
  return inserted === 1;
}
