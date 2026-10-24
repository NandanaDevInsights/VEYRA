import { Router } from 'express';
import { query, logActivity, createNotification, getConnection } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Front Desk portal access (Front Desk staff & Admin)
router.use(authenticate, authorize('frontdesk', 'front desk', 'admin', 'administrator'));

// GET /api/frontdesk/overview
router.get('/overview', async (req, res) => {
  try {
    const rooms = await query('SELECT room_id, status FROM rooms WHERE is_sellable = 1');
    const totalRooms = rooms.length;
    const available = rooms.filter(r => r.status === 'vacant_ready').length;
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    const dirty = rooms.filter(r => r.status === 'vacant_dirty').length;
    const beingCleaned = rooms.filter(r => r.status === 'being_cleaned').length;
    const reserved = rooms.filter(r => r.status === 'reserved').length;
    const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    const arrivals = await query('SELECT COUNT(*) AS c FROM bookings WHERE check_in_date = CURDATE()');
    const departures = await query('SELECT COUNT(*) AS c FROM bookings WHERE check_out_date = CURDATE()');
    const pendingBookings = await query("SELECT COUNT(*) AS c FROM bookings WHERE status = 'pending'");
    const overdueCheckouts = await query(`
      SELECT COUNT(*) AS c
      FROM bookings b
      JOIN booking_rooms br ON b.booking_id = br.booking_id
      WHERE b.check_out_date < CURDATE() AND br.status = 'in_house'
    `);
    const inHouse = await query("SELECT COUNT(*) AS c FROM booking_rooms WHERE status = 'in_house'");
    const openRequests = await query("SELECT COUNT(*) AS c FROM service_requests WHERE status = 'open'");
    const dues = await query("SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS due FROM invoices WHERE status != 'paid' AND status != 'void'");
    const collectedToday = await query('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE DATE(paid_at) = CURDATE()');

    res.json({
      success: true,
      stats: {
        totalRooms,
        available,
        occupied,
        dirty,
        beingCleaned,
        reserved,
        occupancyRate,
        arrivalsToday: arrivals[0]?.c || 0,
        departuresToday: departures[0]?.c || 0,
        pendingBookings: pendingBookings[0]?.c || 0,
        overdueCheckouts: overdueCheckouts[0]?.c || 0,
        inHouseGuests: inHouse[0]?.c || 0,
        openRequests: openRequests[0]?.c || 0,
        outstandingDues: parseFloat(dues[0]?.due || 0),
        collectedToday: parseFloat(collectedToday[0]?.total || 0),
      },
    });
  } catch (err) {
    console.error('Frontdesk overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontdesk/rooms (Room Board)
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await query(`
      SELECT r.room_id AS id, r.room_number AS no, r.floor_no AS floor,
             t.type_name AS type, r.current_rate AS rate, r.status,
             CASE
               WHEN r.status = 'vacant_ready' THEN 'Available'
               WHEN r.status = 'occupied' THEN 'Occupied'
               WHEN r.status = 'vacant_dirty' THEN 'Dirty'
               WHEN r.status = 'being_cleaned' THEN 'Cleaning'
               WHEN r.status = 'reserved' THEN 'Reserved'
               WHEN r.status = 'out_of_service' THEN 'Maintenance'
               ELSE 'Available'
             END AS display_status
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

// PUT /api/frontdesk/rooms/:id/status
router.put('/rooms/:id/status', async (req, res) => {
  try {
    const roomId = req.params.id;
    const { status } = req.body;

    let dbStatus = status;
    if (status === 'Available') dbStatus = 'vacant_ready';
    else if (status === 'Occupied') dbStatus = 'occupied';
    else if (status === 'Dirty') dbStatus = 'vacant_dirty';
    else if (status === 'Cleaning') dbStatus = 'being_cleaned';
    else if (status === 'Reserved') dbStatus = 'reserved';
    else if (status === 'Maintenance') dbStatus = 'out_of_service';

    await query('UPDATE rooms SET status = ? WHERE room_id = ?', [dbStatus, roomId]);

    await logActivity(
      req.user.user_id,
      'Room Status Changed',
      'rooms',
      roomId,
      `Front desk changed Room ID ${roomId} status to ${dbStatus}.`
    );

    res.json({ success: true, status: dbStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontdesk/bookings (Arrivals & Departures / All bookings)
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await query(`
      SELECT b.booking_id, b.booking_code, b.check_in_date, b.check_out_date,
             b.adults, b.children, b.status AS booking_status, b.advance_amount,
             g.guest_id, g.full_name AS guest_name, g.phone, g.email, g.id_number,
             br.booking_room_id, br.room_id, br.rate_per_night, br.status AS room_status,
             br.actual_check_in, br.actual_check_out,
             r.room_number, t.type_name AS room_type
      FROM bookings b
      JOIN guests g ON b.guest_id = g.guest_id
      LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.room_id
      LEFT JOIN room_types t ON r.room_type_id = t.room_type_id
      ORDER BY b.check_in_date DESC
    `);
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/frontdesk/bookings (New Booking with transaction)
router.post('/bookings', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const {
      guest_name, phone, email, id_type, id_number,
      room_id, room_number, check_in_date, check_out_date,
      adults = 1, children = 0, advance_amount = 0, payment_method = 'cash'
    } = req.body;

    if (!guest_name || !check_in_date || !check_out_date) {
      await conn.rollback();
      return res.status(400).json({ error: 'Guest name, check-in date, and check-out date are required.' });
    }

    if (new Date(check_out_date) <= new Date(check_in_date)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Check-out date must be after check-in date.' });
    }

    // 1. Resolve or create guest
    let guestId;
    if (phone) {
      const [existingGuests] = await conn.query('SELECT guest_id FROM guests WHERE phone = ? LIMIT 1', [phone]);
      if (existingGuests.length > 0) {
        guestId = existingGuests[0].guest_id;
      }
    }
    if (!guestId) {
      const [guestRes] = await conn.query(`
        INSERT INTO guests (full_name, phone, email, id_type, id_number, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, [guest_name, phone || null, email || null, id_type || 'ID Card', id_number || null]);
      guestId = guestRes.insertId;
    }

    // 2. Resolve room
    let targetRoomId = room_id;
    let roomRate = 2500.00;
    if (!targetRoomId && room_number) {
      const [rooms] = await conn.query('SELECT room_id, current_rate FROM rooms WHERE room_number = ? LIMIT 1', [room_number]);
      if (rooms.length > 0) {
        targetRoomId = rooms[0].room_id;
        roomRate = rooms[0].current_rate;
      }
    } else if (targetRoomId) {
      const [rooms] = await conn.query('SELECT current_rate FROM rooms WHERE room_id = ?', [targetRoomId]);
      if (rooms.length > 0) roomRate = rooms[0].current_rate;
    } else {
      // Pick any available sellable room
      const [avail] = await conn.query("SELECT room_id, current_rate FROM rooms WHERE status = 'vacant_ready' AND is_sellable = 1 LIMIT 1");
      if (avail.length > 0) {
        targetRoomId = avail[0].room_id;
        roomRate = avail[0].current_rate;
      }
    }

    if (!targetRoomId) {
      await conn.rollback();
      return res.status(400).json({ error: 'No suitable room available for booking.' });
    }

    // Check for double booking conflict
    const [conflicts] = await conn.query(`
      SELECT br.booking_room_id
      FROM booking_rooms br
      JOIN bookings b ON br.booking_id = b.booking_id
      WHERE br.room_id = ?
        AND br.status != 'cancelled'
        AND b.status != 'cancelled'
        AND NOT (b.check_out_date <= ? OR b.check_in_date >= ?)
    `, [targetRoomId, check_in_date, check_out_date]);

    if (conflicts.length > 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'This room is already booked for the selected date range.' });
    }

    // 3. Create booking
    const bookingCode = `B-${Math.floor(1000 + Math.random() * 9000)}`;
    const [bookRes] = await conn.query(`
      INSERT INTO bookings (booking_code, guest_id, check_in_date, check_out_date, adults, children, status, advance_amount, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, NOW())
    `, [bookingCode, guestId, check_in_date, check_out_date, adults, children, advance_amount || 0, req.user.user_id]);

    const bookingId = bookRes.insertId;

    // 4. Create booking_rooms entry
    await conn.query(`
      INSERT INTO booking_rooms (booking_id, room_id, rate_per_night, status)
      VALUES (?, ?, ?, 'reserved')
    `, [bookingId, targetRoomId, roomRate]);

    // Update room status to reserved
    await conn.query("UPDATE rooms SET status = 'reserved' WHERE room_id = ?", [targetRoomId]);

    // 5. If advance paid, record payment
    const adv = parseFloat(advance_amount);
    if (adv > 0) {
      await conn.query(`
        INSERT INTO payments (booking_id, payment_type, method, amount, received_by, paid_at)
        VALUES (?, 'advance', ?, ?, ?, NOW())
      `, [bookingId, payment_method || 'cash', adv, req.user.user_id]);
    }

    await conn.commit();

    await logActivity(
      req.user.user_id,
      'Created Booking',
      'bookings',
      bookingId,
      `New booking ${bookingCode} for ${guest_name} (Room ID ${targetRoomId}, Adv: Rs ${adv}).`
    );

    res.json({
      success: true,
      booking_id: bookingId,
      booking_code: bookingCode,
      message: 'Booking created successfully.',
    });
  } catch (err) {
    await conn.rollback();
    console.error('Error in new booking:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/frontdesk/checkin/:id (Check-in transaction)
router.post('/checkin/:id', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const id = req.params.id; // booking_room_id or booking_id

    const [rows] = await conn.query(`
      SELECT br.booking_room_id, br.booking_id, br.room_id, b.booking_code
      FROM booking_rooms br
      JOIN bookings b ON br.booking_id = b.booking_id
      WHERE br.booking_room_id = ? OR br.booking_id = ?
      LIMIT 1
    `, [id, id]);

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking room record not found.' });
    }

    const { booking_room_id, booking_id, room_id, booking_code } = rows[0];

    // Update booking_rooms & bookings
    await conn.query(`
      UPDATE booking_rooms
      SET status = 'in_house', actual_check_in = NOW()
      WHERE booking_room_id = ?
    `, [booking_room_id]);

    await conn.query("UPDATE bookings SET status = 'checked_in' WHERE booking_id = ?", [booking_id]);
    await conn.query("UPDATE rooms SET status = 'occupied' WHERE room_id = ?", [room_id]);

    await conn.commit();

    await logActivity(
      req.user.user_id,
      'Guest Check-in',
      'bookings',
      booking_id,
      `Checked in guest for booking ${booking_code} (Room ID ${room_id}).`
    );

    res.json({ success: true, message: 'Check-in completed successfully.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/frontdesk/checkout/:id (Check-out transaction)
router.post('/checkout/:id', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const id = req.params.id;

    const [rows] = await conn.query(`
      SELECT br.booking_room_id, br.booking_id, br.room_id, b.booking_code, r.room_number
      FROM booking_rooms br
      JOIN bookings b ON br.booking_id = b.booking_id
      JOIN rooms r ON br.room_id = r.room_id
      WHERE br.booking_room_id = ? OR br.booking_id = ?
      LIMIT 1
    `, [id, id]);

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking room record not found.' });
    }

    const { booking_room_id, booking_id, room_id, booking_code, room_number } = rows[0];

    // Set departed, actual_check_out
    await conn.query(`
      UPDATE booking_rooms
      SET status = 'departed', actual_check_out = NOW()
      WHERE booking_room_id = ?
    `, [booking_room_id]);

    await conn.query("UPDATE bookings SET status = 'checked_out' WHERE booking_id = ?", [booking_id]);
    await conn.query("UPDATE rooms SET status = 'vacant_dirty' WHERE room_id = ?", [room_id]);

    // Create housekeeping task
    await conn.query(`
      INSERT INTO housekeeping_tasks (room_id, task_type, est_minutes, priority, status, created_at)
      VALUES (?, 'Checkout Deep Clean', 40, 'high', 'pending', NOW())
    `, [room_id]);

    // Create notification for housekeeping
    await conn.query(`
      INSERT INTO notifications (title, message, is_read, created_at)
      VALUES ('Room Checkout Cleaning Needed', ?, 0, NOW())
    `, [`Room ${room_number} checked out (${booking_code}). Ready for cleaning.`]);

    await conn.commit();

    await logActivity(
      req.user.user_id,
      'Guest Check-out',
      'bookings',
      booking_id,
      `Checked out guest for booking ${booking_code} (Room ${room_number}).`
    );

    res.json({ success: true, message: 'Check-out completed and housekeeping task scheduled.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/frontdesk/inhouse
router.get('/inhouse', async (req, res) => {
  try {
    const inHouse = await query(`
      SELECT br.booking_room_id, br.booking_id, r.room_number, t.type_name AS room_type,
             g.guest_id, g.full_name AS guest_name, g.phone, g.email,
             DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS check_in,
             DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS check_out,
             DATE_FORMAT(br.actual_check_in, '%Y-%m-%d %H:%i') AS checked_in_at
      FROM booking_rooms br
      JOIN bookings b ON br.booking_id = b.booking_id
      JOIN guests g ON b.guest_id = g.guest_id
      JOIN rooms r ON br.room_id = r.room_id
      JOIN room_types t ON r.room_type_id = t.room_type_id
      WHERE br.status = 'in_house'
      ORDER BY r.room_number ASC
    `);
    res.json({ success: true, inHouse });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontdesk/service-requests
router.get('/service-requests', async (req, res) => {
  try {
    const requests = await query(`
      SELECT sr.request_id AS id, sr.room_id, r.room_number, sr.category,
             sr.description, sr.status, sr.charge_amount,
             DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i') AS created_at,
             g.full_name AS guest_name,
             u.full_name AS assigned_staff
      FROM service_requests sr
      JOIN rooms r ON sr.room_id = r.room_id
      LEFT JOIN guests g ON sr.guest_id = g.guest_id
      LEFT JOIN users u ON sr.assigned_to = u.user_id
      ORDER BY sr.created_at DESC
    `);
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/frontdesk/service-requests
router.post('/service-requests', async (req, res) => {
  try {
    const { room_number, category, description, charge_amount = 0, assigned_to } = req.body;
    if (!room_number || !description) {
      return res.status(400).json({ error: 'Room number and description are required.' });
    }

    const rooms = await query('SELECT room_id FROM rooms WHERE room_number = ? LIMIT 1', [room_number]);
    if (rooms.length === 0) return res.status(404).json({ error: `Room ${room_number} not found.` });

    const roomId = rooms[0].room_id;

    const result = await query(`
      INSERT INTO service_requests (room_id, category, description, status, charge_amount, assigned_to, created_at)
      VALUES (?, ?, ?, 'open', ?, ?, NOW())
    `, [roomId, category || 'Housekeeping', description, charge_amount, assigned_to || null]);

    await createNotification(
      assigned_to || null,
      'New Service Request',
      `Room ${room_number}: ${description}`
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/frontdesk/service-requests/:id
router.put('/service-requests/:id', async (req, res) => {
  try {
    const { status, assigned_to } = req.body;
    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
      if (status === 'completed') {
        updates.push('completed_at = NOW()');
      }
    }
    if (assigned_to) {
      updates.push('assigned_to = ?');
      params.push(assigned_to);
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      await query(`UPDATE service_requests SET ${updates.join(', ')} WHERE request_id = ?`, params);
    }

    res.json({ success: true, message: 'Service request updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/frontdesk/service-requests/:id
router.delete('/service-requests/:id', async (req, res) => {
  try {
    await query('DELETE FROM service_requests WHERE request_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Request deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontdesk/guests (Guest records & search)
router.get('/guests', async (req, res) => {
  try {
    const { q } = req.query;
    let sql = `
      SELECT guest_id AS id, full_name AS name, phone, email, address,
             id_type, id_number,
             DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
      FROM guests
      WHERE 1 = 1
    `;
    const params = [];

    if (q) {
      sql += ' AND (full_name LIKE ? OR phone LIKE ? OR id_number LIKE ?)';
      const term = `%${q}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY guest_id DESC LIMIT 50';

    const guests = await query(sql, params);
    res.json({ success: true, guests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/frontdesk/guests
router.post('/guests', async (req, res) => {
  try {
    const { name, phone, email, address, id_type, id_number } = req.body;
    if (!name) return res.status(400).json({ error: 'Guest name is required.' });

    const result = await query(`
      INSERT INTO guests (full_name, phone, email, address, id_type, id_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `, [name, phone || null, email || null, address || null, id_type || 'ID Card', id_number || null]);

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/frontdesk/guests/:id
router.put('/guests/:id', async (req, res) => {
  try {
    const { name, phone, email, address, id_type, id_number } = req.body;
    await query(`
      UPDATE guests
      SET full_name = ?, phone = ?, email = ?, address = ?, id_type = ?, id_number = ?
      WHERE guest_id = ?
    `, [name, phone, email, address, id_type, id_number, req.params.id]);

    res.json({ success: true, message: 'Guest record updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/frontdesk/guests/:id
router.delete('/guests/:id', async (req, res) => {
  try {
    const bookings = await query('SELECT booking_id FROM bookings WHERE guest_id = ? LIMIT 1', [req.params.id]);
    if (bookings.length > 0) {
      return res.status(400).json({ error: 'Cannot delete guest with active or past bookings.' });
    }
    await query('DELETE FROM guests WHERE guest_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Guest deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontdesk/notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await query(`
      SELECT notification_id AS id, title, message, is_read,
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM notifications
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY created_at DESC
      LIMIT 30
    `, [req.user.user_id]);

    res.json({ success: true, notifications: notifications.map(n => ({ ...n, is_read: Boolean(n.is_read) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/frontdesk/notifications/:id/read
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = 1 WHERE notification_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/frontdesk/notifications/:id
router.delete('/notifications/:id', async (req, res) => {
  try {
    await query('DELETE FROM notifications WHERE notification_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontdesk/shift-report
router.get('/shift-report', async (req, res) => {
  try {
    const cash = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE method = 'cash' AND DATE(paid_at) = CURDATE()
    `);
    const other = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE method != 'cash' AND DATE(paid_at) = CURDATE()
    `);

    const shifts = await query('SELECT * FROM shifts LIMIT 1');
    const shiftId = shifts[0]?.shift_id || 1;

    const existingReport = await query(`
      SELECT * FROM shift_reports
      WHERE user_id = ? AND shift_id = ? AND report_date = CURDATE()
      LIMIT 1
    `, [req.user.user_id, shiftId]);

    res.json({
      success: true,
      report: existingReport[0] || null,
      cash_collected: parseFloat(cash[0]?.total || 0),
      other_collected: parseFloat(other[0]?.total || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/frontdesk/shift-report
router.post('/shift-report', async (req, res) => {
  try {
    const { handover_notes, cash_collected, other_collected } = req.body;
    const shifts = await query('SELECT * FROM shifts LIMIT 1');
    const shiftId = shifts[0]?.shift_id || 1;

    await query(`
      INSERT INTO shift_reports (user_id, shift_id, report_date, cash_collected, other_collected, handover_notes)
      VALUES (?, ?, CURDATE(), ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        cash_collected = VALUES(cash_collected),
        other_collected = VALUES(other_collected),
        handover_notes = VALUES(handover_notes)
    `, [req.user.user_id, shiftId, cash_collected || 0, other_collected || 0, handover_notes || '']);

    await logActivity(
      req.user.user_id,
      'Submitted Shift Report',
      'shift_reports',
      null,
      `Front desk shift report submitted by ${req.user.full_name}.`
    );

    res.json({ success: true, message: 'Shift report submitted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontdesk/search (Top Search Bar: guests by name, phone, ID number, room number)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !String(q).trim()) {
      return res.json({ success: true, results: [] });
    }

    const term = `%${String(q).trim()}%`;
    const results = await query(`
      SELECT g.guest_id, g.full_name, g.phone, g.id_number,
             r.room_number, b.booking_code, br.status AS room_status
      FROM guests g
      LEFT JOIN bookings b ON g.guest_id = b.guest_id
      LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.room_id
      WHERE g.full_name LIKE ?
         OR g.phone LIKE ?
         OR g.id_number LIKE ?
         OR r.room_number LIKE ?
         OR b.booking_code LIKE ?
      LIMIT 15
    `, [term, term, term, term, term]);

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
