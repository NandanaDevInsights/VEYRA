import { Router } from 'express';
import { query, logActivity, createNotification, getConnection } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Housekeeping staff & Admin
router.use(authenticate, authorize('housekeeping', 'admin', 'administrator'));

// GET /api/housekeeping/overview
router.get('/overview', async (req, res) => {
  try {
    const tasks = await query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
             SUM(CASE WHEN status = 'completed' AND DATE(completed_at) = CURDATE() THEN 1 ELSE 0 END) AS completed_today
      FROM housekeeping_tasks
    `);

    const dirtyRooms = await query("SELECT COUNT(*) AS c FROM rooms WHERE status IN ('vacant_dirty', 'being_cleaned')");
    const maintenanceOpen = await query("SELECT COUNT(*) AS c FROM maintenance_requests WHERE status IN ('open', 'in_progress')");
    const complaintsPending = await query("SELECT COUNT(*) AS c FROM complaints WHERE status IN ('pending', 'investigating')");
    const arrivalsToday = await query("SELECT COUNT(*) AS c FROM bookings WHERE check_in_date = CURDATE()");
    const checkoutsToday = await query("SELECT COUNT(*) AS c FROM bookings WHERE check_out_date = CURDATE()");

    // Duty status of current user
    const userRow = await query("SELECT is_on_duty FROM users WHERE user_id = ?", [req.user.user_id]);

    res.json({
      success: true,
      stats: {
        totalTasks: tasks[0]?.total || 0,
        pendingTasks: tasks[0]?.pending || 0,
        inProgressTasks: tasks[0]?.in_progress || 0,
        completedToday: tasks[0]?.completed_today || 0,
        dirtyRooms: dirtyRooms[0]?.c || 0,
        maintenanceOpen: maintenanceOpen[0]?.c || 0,
        complaintsPending: complaintsPending[0]?.c || 0,
        arrivalsToday: arrivalsToday[0]?.c || 0,
        checkoutsToday: checkoutsToday[0]?.c || 0,
        isOnDuty: Boolean(userRow[0]?.is_on_duty),
      },
    });
  } catch (err) {
    console.error('Housekeeping overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/housekeeping/tasks (My Rooms / All Housekeeping tasks)
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await query(`
      SELECT ht.task_id AS id, ht.room_id, r.room_number, r.floor_no,
             t.type_name AS room_type, ht.task_type, ht.est_minutes,
             ht.priority, ht.status, ht.assigned_to,
             u.full_name AS staff_name,
             DATE_FORMAT(ht.started_at, '%Y-%m-%d %H:%i') AS started_at,
             DATE_FORMAT(ht.completed_at, '%Y-%m-%d %H:%i') AS completed_at,
             DATE_FORMAT(ht.created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM housekeeping_tasks ht
      JOIN rooms r ON ht.room_id = r.room_id
      JOIN room_types t ON r.room_type_id = t.room_type_id
      LEFT JOIN users u ON ht.assigned_to = u.user_id
      ORDER BY FIELD(ht.priority, 'high', 'normal', 'low'), ht.task_id DESC
    `);
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/housekeeping/tasks/:id/start (Start sets in_progress + started_at + rooms.status = being_cleaned)
router.post('/tasks/:id/start', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const taskId = req.params.id;

    const [tasks] = await conn.query('SELECT task_id, room_id, assigned_to FROM housekeeping_tasks WHERE task_id = ?', [taskId]);
    if (tasks.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Task not found.' });
    }

    const { room_id } = tasks[0];

    await conn.query(`
      UPDATE housekeeping_tasks
      SET status = 'in_progress', started_at = NOW(), assigned_to = COALESCE(assigned_to, ?)
      WHERE task_id = ?
    `, [req.user.user_id, taskId]);

    await conn.query("UPDATE rooms SET status = 'being_cleaned' WHERE room_id = ?", [room_id]);

    await conn.commit();

    await logActivity(
      req.user.user_id,
      'Started Cleaning Task',
      'housekeeping_tasks',
      taskId,
      `Housekeeping started cleaning task #${taskId} for room ID ${room_id}.`
    );

    res.json({ success: true, message: 'Task marked as in progress.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/housekeeping/tasks/:id/complete (Complete sets completed + completed_at + rooms.status = vacant_ready)
router.post('/tasks/:id/complete', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const taskId = req.params.id;

    const [tasks] = await conn.query('SELECT task_id, room_id FROM housekeeping_tasks WHERE task_id = ?', [taskId]);
    if (tasks.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Task not found.' });
    }

    const { room_id } = tasks[0];

    await conn.query(`
      UPDATE housekeeping_tasks
      SET status = 'completed', completed_at = NOW()
      WHERE task_id = ?
    `, [taskId]);

    await conn.query("UPDATE rooms SET status = 'vacant_ready' WHERE room_id = ?", [room_id]);

    await conn.commit();

    // Query room number for descriptive notification
    const [rmRows] = await conn.query('SELECT room_number FROM rooms WHERE room_id = ?', [room_id]);
    const roomNumber = rmRows[0]?.room_number || room_id;

    await createNotification(
      null,
      'Housekeeping Task Completed',
      `Anita Joseph completed room cleaning for Room ${roomNumber}. Please rate housekeeper.`
    );

    await logActivity(
      req.user.user_id,
      'Completed Cleaning Task',
      'housekeeping_tasks',
      taskId,
      `Housekeeping completed task #${taskId}. Room ${roomNumber} marked vacant_ready.`
    );

    res.json({ success: true, message: 'Task completed. Room is now clean and available.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/housekeeping/rooms
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await query(`
      SELECT r.room_id AS id, r.room_number AS no, r.floor_no AS floor,
             t.type_name AS type, r.status,
             CASE
               WHEN r.status = 'vacant_ready' THEN 'Ready'
               WHEN r.status = 'vacant_dirty' THEN 'Dirty'
               WHEN r.status = 'being_cleaned' THEN 'Cleaning'
               WHEN r.status = 'occupied' THEN 'Occupied'
               WHEN r.status = 'reserved' THEN 'Reserved'
               WHEN r.status = 'out_of_service' THEN 'Maintenance'
               ELSE 'Ready'
             END AS display_status
      FROM rooms r
      JOIN room_types t ON r.room_type_id = t.room_type_id
      ORDER BY r.floor_no ASC, r.room_number ASC
    `);
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/housekeeping/maintenance (Mark for maintenance -> maintenance_requests + rooms.status = out_of_service)
router.post('/maintenance', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const { room_number, issue } = req.body;

    if (!room_number || !issue) {
      await conn.rollback();
      return res.status(400).json({ error: 'Room number and issue description are required.' });
    }

    const [rooms] = await conn.query('SELECT room_id FROM rooms WHERE room_number = ? LIMIT 1', [room_number]);
    if (rooms.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: `Room ${room_number} not found.` });
    }

    const roomId = rooms[0].room_id;

    const [resM] = await conn.query(`
      INSERT INTO maintenance_requests (room_id, issue, status, reported_by, reported_at)
      VALUES (?, ?, 'open', ?, NOW())
    `, [roomId, issue, req.user.user_id]);

    await conn.query("UPDATE rooms SET status = 'out_of_service' WHERE room_id = ?", [roomId]);

    await conn.commit();

    await logActivity(
      req.user.user_id,
      'Reported Maintenance',
      'maintenance_requests',
      resM.insertId,
      `Reported maintenance issue for Room ${room_number}. Marked room out_of_service.`
    );

    // Create system notification so Front Desk and other dashboards immediately see the maintenance issue
    await createNotification(
      null,
      'Maintenance Issue Reported',
      `Room ${room_number}: ${issue} (Reported by Housekeeping)`
    );

    res.json({ success: true, id: resM.insertId, message: 'Maintenance requested and room set to out of service.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/housekeeping/service-requests (Service requests assigned to or relevant to housekeeping)
router.get('/service-requests', async (req, res) => {
  try {
    const requests = await query(`
      SELECT sr.request_id AS id, r.room_number, sr.category, sr.description,
             sr.status, DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM service_requests sr
      JOIN rooms r ON sr.room_id = r.room_id
      ORDER BY sr.created_at DESC
    `);
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/housekeeping/service-requests/:id (Update status)
router.put('/service-requests/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await query(`
      UPDATE service_requests
      SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN NOW() ELSE completed_at END
      WHERE request_id = ?
    `, [status, status, req.params.id]);

    if (status === 'completed') {
      const srRows = await query(`
        SELECT sr.request_id, r.room_number, sr.category
        FROM service_requests sr
        JOIN rooms r ON sr.room_id = r.room_id
        WHERE sr.request_id = ?
      `, [req.params.id]);
      const roomNum = srRows[0]?.room_number || '-';
      const cat = srRows[0]?.category || 'Service Request';

      await createNotification(
        null,
        'Housekeeping Task Completed',
        `Anita Joseph completed ${cat} for Room ${roomNum}. Please rate housekeeper.`
      );
    }

    res.json({ success: true, message: 'Status updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/housekeeping/supplies/restock (Notify supplies restocked)
router.post('/supplies/restock', async (req, res) => {
  try {
    const { items } = req.body;
    await createNotification(
      null,
      'Supplies Restocked',
      `Requested supplies (${items || 'Linens & Towels'}) have been restocked by Inventory.`
    );
    res.json({ success: true, message: 'Restock notification created.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/housekeeping/complaints
router.get('/complaints', async (req, res) => {
  try {
    const complaints = await query(`
      SELECT c.complaint_id AS id, COALESCE(r.room_number, 'General') AS room_number,
             c.subject, c.description, c.status,
             DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS created_at,
             DATE_FORMAT(c.resolved_at, '%Y-%m-%d %H:%i') AS resolved_at,
             g.full_name AS guest_name
      FROM complaints c
      LEFT JOIN rooms r ON c.room_id = r.room_id
      LEFT JOIN guests g ON c.guest_id = g.guest_id
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, complaints });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/housekeeping/complaints
router.post('/complaints', async (req, res) => {
  try {
    const { room_number, subject, description } = req.body;
    if (!subject) return res.status(400).json({ error: 'Subject is required.' });

    let roomId = null;
    if (room_number) {
      const rooms = await query('SELECT room_id FROM rooms WHERE room_number = ? LIMIT 1', [room_number]);
      if (rooms.length > 0) roomId = rooms[0].room_id;
    }

    const result = await query(`
      INSERT INTO complaints (room_id, subject, description, status, assigned_to, created_at)
      VALUES (?, ?, ?, 'pending', ?, NOW())
    `, [roomId, subject, description || '', req.user.user_id]);

    await createNotification(
      null,
      'New Guest Complaint Registered',
      `${subject} (Room ${room_number || 'General'})`
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/housekeeping/complaints/:id
router.put('/complaints/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await query(`
      UPDATE complaints
      SET status = ?, resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END
      WHERE complaint_id = ?
    `, [status, status, req.params.id]);

    res.json({ success: true, message: 'Complaint status updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/housekeeping/supplies
router.get('/supplies', async (req, res) => {
  try {
    const supplies = await query(`
      SELECT supply_id AS id, item_name AS name, unit,
             quantity_in_stock AS qty, reorder_level AS min_qty
      FROM supplies
      ORDER BY item_name ASC
    `);
    res.json({ success: true, supplies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/housekeeping/supplies
router.post('/supplies', async (req, res) => {
  try {
    const { name, unit = 'pcs', qty = 0, min_qty = 10 } = req.body;
    if (!name) return res.status(400).json({ error: 'Item name is required.' });

    const result = await query(`
      INSERT INTO supplies (item_name, unit, quantity_in_stock, reorder_level)
      VALUES (?, ?, ?, ?)
    `, [name, unit, qty, min_qty]);

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Supply item already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/housekeeping/supplies/:id
router.put('/supplies/:id', async (req, res) => {
  try {
    const { name, unit, qty, min_qty } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push('item_name = ?'); params.push(name); }
    if (unit) { updates.push('unit = ?'); params.push(unit); }
    if (typeof qty !== 'undefined') { updates.push('quantity_in_stock = ?'); params.push(qty); }
    if (typeof min_qty !== 'undefined') { updates.push('reorder_level = ?'); params.push(min_qty); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await query(`UPDATE supplies SET ${updates.join(', ')} WHERE supply_id = ?`, params);
    }

    res.json({ success: true, message: 'Supply item updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/housekeeping/supplies/:id
router.delete('/supplies/:id', async (req, res) => {
  try {
    await query('DELETE FROM supplies WHERE supply_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Item deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/housekeeping/attendance
router.get('/attendance', async (req, res) => {
  try {
    const records = await query(`
      SELECT attendance_id AS id, work_date,
             DATE_FORMAT(clock_in, '%H:%i') AS in_time,
             DATE_FORMAT(clock_out, '%H:%i') AS out_time
      FROM attendance
      WHERE user_id = ?
      ORDER BY work_date DESC
      LIMIT 14
    `, [req.user.user_id]);

    const todayRecord = records.find(r => r.work_date === new Date().toISOString().slice(0, 10));

    res.json({
      success: true,
      records,
      clockedIn: Boolean(todayRecord && todayRecord.in_time && !todayRecord.out_time),
      todayRecord: todayRecord || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/housekeeping/attendance/clock (Clock in / Clock out)
router.post('/attendance/clock', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await query(
      'SELECT attendance_id, clock_in, clock_out FROM attendance WHERE user_id = ? AND work_date = ? LIMIT 1',
      [req.user.user_id, today]
    );

    if (existing.length === 0) {
      // Clock in
      await query(`
        INSERT INTO attendance (user_id, work_date, clock_in)
        VALUES (?, ?, NOW())
      `, [req.user.user_id, today]);

      await query('UPDATE users SET is_on_duty = 1 WHERE user_id = ?', [req.user.user_id]);

      return res.json({ success: true, action: 'clocked_in', message: 'Clocked in successfully.' });
    } else if (existing[0].clock_in && !existing[0].clock_out) {
      // Clock out
      await query(`
        UPDATE attendance SET clock_out = NOW() WHERE attendance_id = ?
      `, [existing[0].attendance_id]);

      await query('UPDATE users SET is_on_duty = 0 WHERE user_id = ?', [req.user.user_id]);

      return res.json({ success: true, action: 'clocked_out', message: 'Clocked out successfully.' });
    } else {
      return res.json({ success: true, message: 'Already completed shift for today.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/housekeeping/leave
router.get('/leave', async (req, res) => {
  try {
    const requests = await query(`
      SELECT leave_id AS id, leave_type,
             DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
             DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
             reason, status
      FROM leave_requests
      WHERE user_id = ?
      ORDER BY leave_id DESC
    `, [req.user.user_id]);
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/housekeeping/leave
router.post('/leave', async (req, res) => {
  try {
    const { leave_type, start_date, end_date, reason } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start and end dates are required.' });
    }

    const result = await query(`
      INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [req.user.user_id, leave_type || 'Casual Leave', start_date, end_date, reason || '']);

    res.json({ success: true, id: result.insertId, message: 'Leave request submitted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/housekeeping/leave/:id (Cancel pending leave request)
router.delete('/leave/:id', async (req, res) => {
  try {
    await query("DELETE FROM leave_requests WHERE leave_id = ? AND user_id = ? AND status = 'pending'", [req.params.id, req.user.user_id]);
    res.json({ success: true, message: 'Leave request cancelled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/housekeeping/duty (Toggle on duty badge)
router.patch('/duty', async (req, res) => {
  try {
    const user = await query('SELECT is_on_duty FROM users WHERE user_id = ?', [req.user.user_id]);
    const nextDuty = user[0]?.is_on_duty ? 0 : 1;
    await query('UPDATE users SET is_on_duty = ? WHERE user_id = ?', [nextDuty, req.user.user_id]);
    res.json({ success: true, is_on_duty: Boolean(nextDuty) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/housekeeping/notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await query(`
      SELECT notification_id AS id, title, message, is_read,
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM notifications
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY notification_id DESC
      LIMIT 50
    `, [req.user.user_id]);
    res.json({ success: true, notifications: notifications.map(n => ({ ...n, is_read: Boolean(n.is_read) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/housekeeping/notifications/:id/read
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = 1 WHERE notification_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
