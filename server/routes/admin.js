import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, logActivity, getConnection } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Protect all admin routes with authentication and role check (admin only)
router.use(authenticate, authorize('admin', 'administrator'));

// GET /api/admin/overview
router.get('/overview', async (req, res) => {
  try {
    const rooms = await query('SELECT room_id, status FROM rooms WHERE is_sellable = 1');
    const totalRooms = rooms.length;
    const available = rooms.filter(r => r.status === 'vacant_ready').length;
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    const dirty = rooms.filter(r => r.status === 'vacant_dirty').length;
    const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    const checkIns = await query(
      'SELECT COUNT(*) AS count FROM bookings WHERE check_in_date = CURDATE()'
    );
    const checkOuts = await query(
      'SELECT COUNT(*) AS count FROM bookings WHERE check_out_date = CURDATE()'
    );

    // Recent activity log
    const recentActivity = await query(`
      SELECT a.activity_id, a.action, a.entity_type, a.entity_id, a.description,
             DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS at,
             COALESCE(u.full_name, 'System') AS staff
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.user_id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      stats: {
        totalRooms,
        available,
        occupied,
        dirty,
        occupancyRate,
        checkInsToday: checkIns[0]?.count || 0,
        checkOutsToday: checkOuts[0]?.count || 0,
      },
      recentActivity,
    });
  } catch (err) {
    console.error('Error fetching admin overview:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/operations (Cross-department master oversight: Front Desk, Housekeeping & Ratings, Billing)
router.get('/operations', async (req, res) => {
  try {
    // 1. Front Desk Operations: Bookings, check-ins, check-outs, guests
    const recentBookings = await query(`
      SELECT b.booking_id, b.booking_code, g.full_name AS guest, g.phone,
             COALESCE(r.room_number, '101') AS room,
             t.type_name AS room_type,
             DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS check_in,
             DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS check_out,
             b.advance_amount,
             b.status,
             b.created_at
      FROM bookings b
      JOIN guests g ON b.guest_id = g.guest_id
      LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.room_id
      LEFT JOIN room_types t ON r.room_type_id = t.room_type_id
      ORDER BY b.booking_id DESC
      LIMIT 15
    `);

    // 2. Housekeeping Operations: Service requests receiving, doing, completed
    const serviceRequests = await query(`
      SELECT sr.request_id, r.room_number, sr.category, sr.description,
             sr.status,
             COALESCE(u.full_name, 'Anita Joseph') AS staff,
             DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM service_requests sr
      JOIN rooms r ON sr.room_id = r.room_id
      LEFT JOIN users u ON sr.assigned_to = u.user_id
      ORDER BY sr.request_id DESC
      LIMIT 15
    `);

    // Housekeeping Performance Ratings from Front Desk (stored in notifications or ratings history)
    const ratings = await query(`
      SELECT notification_id AS id, title, message,
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS time
      FROM notifications
      WHERE title LIKE '%Rating%' OR message LIKE '%Rated%' OR message LIKE '%star%' OR message LIKE '%immaculate%'
      ORDER BY notification_id DESC
      LIMIT 15
    `);

    // 3. Billing Operations: Invoices, payments collected, revenue stats
    const recentInvoices = await query(`
      SELECT inv.invoice_id, inv.invoice_number, g.full_name AS guest,
             COALESCE(r.room_number, '101') AS room,
             inv.subtotal, inv.tax_amount, inv.grand_total, inv.status,
             DATE_FORMAT(inv.created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM invoices inv
      JOIN bookings b ON inv.booking_id = b.booking_id
      JOIN guests g ON b.guest_id = g.guest_id
      LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.room_id
      ORDER BY inv.invoice_id DESC
      LIMIT 15
    `);

    const recentPayments = await query(`
      SELECT p.payment_id, p.invoice_id, inv.invoice_number, g.full_name AS guest,
             p.amount, p.payment_method AS method,
             DATE_FORMAT(p.payment_date, '%Y-%m-%d %H:%i') AS payment_date,
             COALESCE(u.full_name, 'Meera Nair') AS collected_by
      FROM payments p
      JOIN invoices inv ON p.invoice_id = inv.invoice_id
      JOIN bookings b ON inv.booking_id = b.booking_id
      JOIN guests g ON b.guest_id = g.guest_id
      LEFT JOIN users u ON p.received_by = u.user_id
      ORDER BY p.payment_id DESC
      LIMIT 15
    `);

    const financialSummary = await query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN DATE(payment_date) = CURDATE() THEN amount ELSE 0 END), 0) AS collected_today
      FROM payments
    `);

    res.json({
      success: true,
      frontdesk: {
        recentBookings,
      },
      housekeeping: {
        serviceRequests,
        ratings,
      },
      billing: {
        recentInvoices,
        recentPayments,
        totalCollected: financialSummary[0]?.total_collected || 0,
        collectedToday: financialSummary[0]?.collected_today || 0,
      },
    });
  } catch (err) {
    console.error('Error fetching admin operations oversight:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await query(`
      SELECT u.user_id AS id, u.full_name AS name, u.email, u.username,
             r.role_name AS role, r.role_code, u.is_active AS active, u.is_on_duty,
             DATE_FORMAT(u.last_login_at, '%Y-%m-%d %H:%i') AS last_login,
             DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      ORDER BY u.user_id ASC
    `);
    res.json({ success: true, users: users.map(u => ({ ...u, active: Boolean(u.active) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    // Find role_id
    const targetRole = role || 'Front Desk';
    const roles = await query(
      'SELECT role_id, role_name FROM roles WHERE LOWER(role_name) = LOWER(?) OR LOWER(role_code) = LOWER(?) LIMIT 1',
      [targetRole, targetRole]
    );

    if (roles.length === 0) {
      return res.status(400).json({ error: `Invalid role '${targetRole}'.` });
    }

    const roleId = roles[0].role_id;
    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const username = baseUsername || `user_${Date.now()}`;
    const defaultPassword = password || 'password123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const result = await query(`
      INSERT INTO users (role_id, username, email, full_name, password_hash, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [roleId, username, email, name, passwordHash]);

    await logActivity(
      req.user.user_id,
      'Created Staff Account',
      'users',
      result.insertId,
      `Created staff account for ${name} (${roles[0].role_name}).`
    );

    res.json({
      success: true,
      user: {
        id: result.insertId,
        name,
        email,
        username,
        role: roles[0].role_name,
        active: true,
      },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'A staff account with this email or username already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role, password, active } = req.body;

    const existing = await query('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let roleId = existing[0].role_id;
    if (role) {
      const roles = await query(
        'SELECT role_id FROM roles WHERE LOWER(role_name) = LOWER(?) OR LOWER(role_code) = LOWER(?) LIMIT 1',
        [role, role]
      );
      if (roles.length > 0) roleId = roles[0].role_id;
    }

    const updateFields = [];
    const params = [];

    if (name) { updateFields.push('full_name = ?'); params.push(name); }
    if (email) { updateFields.push('email = ?'); params.push(email); }
    if (roleId) { updateFields.push('role_id = ?'); params.push(roleId); }
    if (typeof active !== 'undefined') { updateFields.push('is_active = ?'); params.push(active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updateFields.push('password_hash = ?');
      params.push(hash);
    }

    if (updateFields.length > 0) {
      params.push(userId);
      await query(`UPDATE users SET ${updateFields.join(', ')} WHERE user_id = ?`, params);
    }

    await logActivity(
      req.user.user_id,
      'Updated Staff Account',
      'users',
      userId,
      `Updated profile for staff ID ${userId} (${name || existing[0].full_name}).`
    );

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/toggle
router.patch('/users/:id/toggle', async (req, res) => {
  try {
    const userId = req.params.id;
    const users = await query('SELECT user_id, full_name, is_active FROM users WHERE user_id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found.' });

    const newStatus = users[0].is_active ? 0 : 1;
    await query('UPDATE users SET is_active = ? WHERE user_id = ?', [newStatus, userId]);

    await logActivity(
      req.user.user_id,
      newStatus ? 'Reactivated Staff Account' : 'Deactivated Staff Account',
      'users',
      userId,
      `${newStatus ? 'Reactivated' : 'Deactivated'} staff account ${users[0].full_name}.`
    );

    res.json({ success: true, active: Boolean(newStatus) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/rooms
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await query(`
      SELECT r.room_id AS id, r.room_number AS no, r.floor_no AS floor,
             t.type_name AS type, r.current_rate AS rate, r.status AS db_status,
             CASE
               WHEN r.status = 'vacant_ready' THEN 'Available'
               WHEN r.status = 'occupied' THEN 'Occupied'
               WHEN r.status = 'vacant_dirty' THEN 'Dirty'
               WHEN r.status = 'reserved' THEN 'Reserved'
               WHEN r.status = 'being_cleaned' THEN 'Dirty'
               ELSE 'Available'
             END AS status,
             CASE
               WHEN t.type_name = 'Suite' THEN 'AC, WiFi, TV, Bathtub'
               WHEN t.type_name = 'Double' THEN 'AC, WiFi, TV'
               ELSE 'AC, WiFi'
             END AS amenities
      FROM rooms r
      JOIN room_types t ON r.room_type_id = t.room_type_id
      WHERE r.is_sellable = 1
      ORDER BY r.floor_no ASC, r.room_number ASC
    `);
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/rooms
router.post('/rooms', async (req, res) => {
  try {
    const { no, type, floor, rate } = req.body;
    if (!no) return res.status(400).json({ error: 'Room number is required.' });

    const types = await query('SELECT room_type_id, base_rate FROM room_types WHERE type_name = ? LIMIT 1', [type || 'Single']);
    const roomTypeId = types[0]?.room_type_id || 1;
    const finalRate = rate || types[0]?.base_rate || 2500.00;

    const result = await query(`
      INSERT INTO rooms (room_number, floor_no, room_type_id, current_rate, status, is_sellable)
      VALUES (?, ?, ?, ?, 'vacant_ready', 1)
    `, [String(no).trim(), parseInt(floor || 1, 10), roomTypeId, finalRate]);

    await logActivity(
      req.user.user_id,
      'Added Room',
      'rooms',
      result.insertId,
      `Added room ${no} (${type}, Rs ${finalRate}).`
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: `Room ${req.body.no} already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/rooms/:no
router.put('/rooms/:no', async (req, res) => {
  try {
    const roomNo = req.params.no;
    const { type, floor, rate, status } = req.body;

    const existing = await query('SELECT room_id, current_rate, status FROM rooms WHERE room_number = ?', [roomNo]);
    if (existing.length === 0) return res.status(404).json({ error: 'Room not found.' });

    const room = existing[0];
    const updateFields = [];
    const params = [];

    if (type) {
      const types = await query('SELECT room_type_id FROM room_types WHERE type_name = ?', [type]);
      if (types.length > 0) {
        updateFields.push('room_type_id = ?');
        params.push(types[0].room_type_id);
      }
    }
    if (floor) { updateFields.push('floor_no = ?'); params.push(parseInt(floor, 10)); }
    if (rate) {
      updateFields.push('current_rate = ?');
      params.push(rate);
      if (Number(rate) !== Number(room.current_rate)) {
        await logActivity(
          req.user.user_id,
          'Rate Changed',
          'rooms',
          room.room_id,
          `Changed room ${roomNo} rate: Rs ${room.current_rate} → Rs ${rate}`
        );
      }
    }
    if (status) {
      let dbStatus = 'vacant_ready';
      if (status === 'Occupied') dbStatus = 'occupied';
      else if (status === 'Dirty') dbStatus = 'vacant_dirty';
      else if (status === 'Reserved') dbStatus = 'reserved';
      updateFields.push('status = ?');
      params.push(dbStatus);
    }

    if (updateFields.length > 0) {
      params.push(roomNo);
      await query(`UPDATE rooms SET ${updateFields.join(', ')} WHERE room_number = ?`, params);
    }

    res.json({ success: true, message: 'Room updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/records (Guests, Bookings, Invoices, Payments)
router.get('/records', async (req, res) => {
  try {
    const bookings = await query(`
      SELECT b.booking_id, b.booking_code AS id, g.full_name AS guest,
             COALESCE(r.room_number, '101') AS room,
             DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS date,
             DATEDIFF(b.check_out_date, b.check_in_date) AS nights,
             COALESCE(inv.grand_total, b.advance_amount, 5000.00) AS amount,
             CASE
               WHEN b.status = 'checked_in' THEN 'Checked in'
               WHEN b.status = 'checked_out' THEN 'Checked out'
               WHEN b.status = 'confirmed' THEN 'Reserved'
               WHEN b.status = 'cancelled' THEN 'Cancelled'
               ELSE 'Pending'
             END AS status
      FROM bookings b
      JOIN guests g ON b.guest_id = g.guest_id
      LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.room_id
      LEFT JOIN invoices inv ON b.booking_id = inv.booking_id
      ORDER BY b.check_in_date DESC
    `);
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/pricing (Room rates & Tax configuration)
router.get('/pricing', async (req, res) => {
  try {
    const types = await query('SELECT type_name, base_rate FROM room_types');
    const taxes = await query('SELECT tax_id, tax_name, rate_percent FROM tax_rules WHERE is_active = 1');

    const rates = {};
    types.forEach(t => { rates[t.type_name] = parseFloat(t.base_rate); });

    const gst = taxes.find(t => t.tax_name.toUpperCase().includes('GST'))?.rate_percent || 12;
    const service = taxes.find(t => t.tax_name.toUpperCase().includes('SERVICE'))?.rate_percent || 0;

    res.json({
      success: true,
      rates,
      tax: { gst: parseFloat(gst), service: parseFloat(service) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/pricing
router.put('/pricing', async (req, res) => {
  try {
    const { rates, gst, service } = req.body;

    if (rates) {
      for (const [type, rate] of Object.entries(rates)) {
        await query('UPDATE room_types SET base_rate = ? WHERE type_name = ?', [rate, type]);
      }
    }
    if (typeof gst !== 'undefined') {
      await query("UPDATE tax_rules SET rate_percent = ? WHERE tax_name LIKE '%GST%'", [gst]);
    }
    if (typeof service !== 'undefined') {
      await query("UPDATE tax_rules SET rate_percent = ? WHERE tax_name LIKE '%Service%'", [service]);
    }

    await logActivity(
      req.user.user_id,
      'Updated Pricing & Tax',
      'tax_rules',
      null,
      `Updated pricing: GST ${gst || 12}%, service ${service || 0}%.`
    );

    res.json({ success: true, message: 'Pricing and tax updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/activity (Activity Log with filters)
router.get('/activity', async (req, res) => {
  try {
    const { staff, from, to } = req.query;
    let sql = `
      SELECT a.activity_id AS id, a.action, a.entity_type, a.entity_id, a.description,
             DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS at,
             COALESCE(u.full_name, 'System') AS staff
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.user_id
      WHERE 1 = 1
    `;
    const params = [];

    if (staff && staff !== 'All') {
      sql += ' AND u.full_name = ?';
      params.push(staff);
    }
    if (from) {
      sql += ' AND a.created_at >= ?';
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      sql += ' AND a.created_at <= ?';
      params.push(`${to} 23:59:59`);
    }

    sql += ' ORDER BY a.created_at DESC LIMIT 100';

    const log = await query(sql, params);
    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
