import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function init() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    multipleStatements: true
  });

  try {
    console.log('Applying schema.sql...');
    const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Schema applied successfully!');
  } catch (err) {
    console.error('Initialization error:', err);
  } finally {
    process.exit(0);
  }
}

init();
