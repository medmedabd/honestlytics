import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('connect', () => console.log('PostgreSQL connected'));
pool.on('error', (err) => console.error('PostgreSQL error', err));

export default pool;
