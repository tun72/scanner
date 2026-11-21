import { LoginSchema } from '@food-scanner/contracts';
import { seedMobileAccount } from './accounts.ts';
import { createCloudDatabase, migrateCloudDatabase } from './database.ts';

const url = process.env.DATABASE_URL;
const name = process.env.SEED_USER_NAME?.trim();
const credentials = LoginSchema.safeParse({ rollNumber: process.env.SEED_USER_ROLL_NUMBER, password: process.env.SEED_USER_PASSWORD });
if (!url || !name || name.length > 100 || !credentials.success) {
  throw new Error('Set DATABASE_URL, SEED_USER_NAME, SEED_USER_ROLL_NUMBER and SEED_USER_PASSWORD before seeding the mobile account.');
}

const pool = createCloudDatabase(url);
try {
  await migrateCloudDatabase(pool);
  await seedMobileAccount(pool, { ...credentials.data, name });
  process.stdout.write('The starter mobile account is ready.\n');
} catch {
  throw new Error('Could not seed the starter account. Check the database connection and permissions.');
} finally {
  await pool.end();
}
