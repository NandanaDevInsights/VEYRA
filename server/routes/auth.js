import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, logActivity } from '../db.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = Router();

function normalizeRole(role) {
  if (!role) return '';
  const r = String(role).trim().toLowerCase().replace(/\s+/g, '');
  if (r === 'admin' || r === 'administrator') return 'admin';
  if (r === 'frontdesk' || r === 'front' || r === 'reception') return 'frontdesk';
  if (r === 'housekeeping' || r === 'cleaning') return 'housekeeping';
  if (r === 'billing' || r === 'accountant' || r === 'accounts') return 'billing';
  return r;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { role, username, password, keepSigned } = req.body;

    if (!username || !String(username).trim()) {
      return res.status(400).json({ error: 'Username or email is required.' });
    }
    if (!password || !String(password).trim()) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const trimmedUser = String(username).trim();

    // Look up user by username or email
    const users = await query(
      `SELECT u.user_id, u.role_id, u.username, u.email, u.full_name, u.password_hash,
              u.is_active, u.is_on_duty, r.role_code, r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?))
       LIMIT 1`,
      [trimmedUser, trimmedUser]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = users[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Your staff account is currently inactive. Contact Administrator.' });
    }

    // Role verification
    const requestedNormRole = normalizeRole(role);
    const userNormRole = normalizeRole(user.role_code || user.role_name);

    if (requestedNormRole && requestedNormRole !== userNormRole) {
      return res.status(403).json({
        error: `Access denied: Account '${user.username}' is assigned to role '${user.role_name}', not '${role}'.`
      });
    }

    // Verify password with bcrypt
    const match = await bcrypt.compare(String(password), user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Update last_login_at
    await query('UPDATE users SET last_login_at = NOW() WHERE user_id = ?', [user.user_id]);

    // Write to activity_log
    await logActivity(
      user.user_id,
      'User Login',
      'users',
      user.user_id,
      `${user.full_name} (${user.role_name}) signed in to portal.`
    );

    // Generate JWT token (extended duration if keepSigned is true)
    const token = generateToken(user, Boolean(keepSigned));

    // Return safe user object (never return password_hash)
    res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role_name,
        role_code: user.role_code,
        is_on_duty: Boolean(user.is_on_duty),
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login authentication.' });
  }
});

// POST /api/auth/register - Register new staff account into respective tables
router.post('/register', async (req, res) => {
  try {
    const { full_name, username, email, password, role } = req.body;

    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!username || !String(username).trim()) {
      return res.status(400).json({ error: 'Username is required.' });
    }
    if (!password || String(password).trim().length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const trimmedName = String(full_name).trim();
    const trimmedUser = String(username).trim().toLowerCase();
    const trimmedEmail = email && String(email).trim() ? String(email).trim().toLowerCase() : `${trimmedUser}@hotel.in`;
    const targetRole = role || 'Front Desk';

    // Check if username or email already exists in users table
    const existing = await query(
      'SELECT user_id FROM users WHERE LOWER(username) = ? OR (email IS NOT NULL AND LOWER(email) = ?) LIMIT 1',
      [trimmedUser, trimmedEmail]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'A staff account with this username or email already exists.' });
    }

    // Resolve role from roles table
    const norm = normalizeRole(targetRole);
    const roles = await query(
      'SELECT role_id, role_code, role_name FROM roles WHERE LOWER(role_name) = LOWER(?) OR LOWER(role_code) = LOWER(?) LIMIT 1',
      [targetRole, norm]
    );

    if (roles.length === 0) {
      return res.status(400).json({ error: `Invalid role '${targetRole}'.` });
    }

    const roleObj = roles[0];
    const passwordHash = await bcrypt.hash(String(password).trim(), 10);

    // Insert new user into users table
    const result = await query(`
      INSERT INTO users (role_id, username, email, full_name, password_hash, is_active, is_on_duty, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, NOW(), NOW())
    `, [roleObj.role_id, trimmedUser, trimmedEmail, trimmedName, passwordHash]);

    const newUserId = result.insertId;

    // Log registration in activity_log table
    await logActivity(
      newUserId,
      'Staff Registered',
      'users',
      newUserId,
      `New staff account registered: ${trimmedName} as ${roleObj.role_name} (${trimmedUser}).`
    );

    const newUser = {
      user_id: newUserId,
      username: trimmedUser,
      email: trimmedEmail,
      full_name: trimmedName,
      role_name: roleObj.role_name,
      role_code: roleObj.role_code,
    };

    // Generate session token
    const token = generateToken(newUser, false);

    res.json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        user_id: newUserId,
        username: trimmedUser,
        email: trimmedEmail,
        full_name: trimmedName,
        role: roleObj.role_name,
        role_code: roleObj.role_code,
        is_on_duty: false,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'A staff account with this username or email already exists.' });
    }
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const users = await query(
      `SELECT u.user_id, u.username, u.email, u.full_name, u.is_active, u.is_on_duty,
              r.role_code, r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE u.user_id = ?`,
      [req.user.user_id]
    );

    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({ error: 'User no longer active or found' });
    }

    res.json({ success: true, user: users[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    await logActivity(
      req.user.user_id,
      'User Logout',
      'users',
      req.user.user_id,
      `${req.user.full_name} signed out.`
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
