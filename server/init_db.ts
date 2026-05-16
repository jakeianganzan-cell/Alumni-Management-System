import './env';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_SSL_ENABLED = ['1', 'true', 'yes', 'require', 'required'].includes(
  String(process.env.DB_SSL || process.env.MYSQL_SSL || process.env.MYSQL_SSL_REQUIRED || '').trim().toLowerCase(),
) || Boolean(process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA);
const DB_SSL_CA = process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA;

async function init() {
  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
    ssl: DB_SSL_ENABLED
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(DB_SSL_CA ? { ca: DB_SSL_CA.replace(/\\n/g, '\n') } : {}),
        }
      : undefined,
  });

  try {
    console.log('Applying schema.sql...');
    const schema = fs.readFileSync(path.join(currentDirPath, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Schema applied successfully!');
  } catch (err) {
    console.error('Initialization error:', err);
  } finally {
    process.exit(0);
  }
}

init();
