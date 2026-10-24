import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// One shared connection pool using credentials strictly from environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'VEYRA',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  dateStrings: true, // returns dates as 'YYYY-MM-DD HH:mm:ss' to prevent TZ drift
});

/**
 * Execute parameterized query using the shared connection pool
 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Get a connection for multi-query database transactions
 */
export async function getConnection() {
  return await pool.getConnection();
}

/**
 * Logs important actions to the activity_log table
 */
export async function logActivity(userId, action, entityType = null, entityId = null, description = null) {
  try {
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, description, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId || null, action, entityType, entityId, description]
    );
  } catch (err) {
    console.error('Failed to write activity_log:', err.message);
  }
}

/**
 * Creates a notification in the notifications table
 */
export async function createNotification(userId, title, message) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, is_read, created_at)
       VALUES (?, ?, ?, 0, NOW())`,
      [userId || null, title, message]
    );
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

export default pool;
