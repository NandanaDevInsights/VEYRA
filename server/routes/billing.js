import { Router } from 'express';
import { query, logActivity, createNotification, getConnection } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Billing staff & Admin
router.use(authenticate, authorize('billing', 'accountant', 'admin', 'administrator'));

// GET /api/billing/overview
router.get('/overview', async (req, res) => {
  try {
    // Outstanding dues
    const dues = await query(`
      SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS total_due
      FROM invoices
      WHERE status IN ('issued', 'partially_paid', 'draft')
    `);

    // Collected today
    const collected = await query(`
      SELECT COALESCE(SUM(amount), 0) AS total_collected
      FROM payments
      WHERE DATE(paid_at) = CURDATE()
    `);

    // Bills today
    const billsToday = await query(`
      SELECT COUNT(*) AS count
      FROM invoices
      WHERE DATE(created_at) = CURDATE()
    `);

    // Awaiting billing: booking_rooms departed/in_house checking out without a paid invoice
    const awaiting = await query(`
      SELECT COUNT(DISTINCT b.booking_id) AS count
      FROM bookings b
      LEFT JOIN invoices inv ON b.booking_id = inv.booking_id AND inv.status = 'paid'
      WHERE inv.invoice_id IS NULL AND b.status IN ('checked_in', 'checked_out', 'confirmed')
    `);

    res.json({
      success: true,
      stats: {
        awaitingBilling: awaiting[0]?.count || 0,
        outstandingDues: parseFloat(dues[0]?.total_due || 0),
        collectedToday: parseFloat(collected[0]?.total_collected || 0),
        billsToday: billsToday[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error('Billing overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/next-to-bill (Departed or checking out guests without fully paid invoices)
router.get('/next-to-bill', async (req, res) => {
  try {
    const list = await query(`
      SELECT b.booking_id, b.booking_code, b.check_in_date, b.check_out_date,
             g.guest_id, g.full_name AS guest_name, g.phone, g.email,
             r.room_number, t.type_name AS room_type, br.rate_per_night,
             COALESCE(b.advance_amount, 0) AS advance_amount,
             inv.invoice_id, inv.invoice_number, inv.status AS invoice_status,
             inv.grand_total, inv.amount_paid
      FROM bookings b
      JOIN guests g ON b.guest_id = g.guest_id
      JOIN booking_rooms br ON b.booking_id = br.booking_id
      JOIN rooms r ON br.room_id = r.room_id
      JOIN room_types t ON r.room_type_id = t.room_type_id
      LEFT JOIN invoices inv ON b.booking_id = inv.booking_id
      WHERE (inv.invoice_id IS NULL OR inv.status IN ('draft', 'issued', 'partially_paid'))
      ORDER BY b.check_out_date ASC
    `);
    res.json({ success: true, list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/invoices (Pending Bills / Billing History)
router.get('/invoices', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT inv.invoice_id AS id, inv.invoice_number, inv.booking_id,
             b.booking_code, g.guest_id, g.full_name AS guest_name,
             g.email AS guest_email, g.phone AS guest_phone,
             r.room_number,
             inv.subtotal, inv.tax_total, inv.grand_total, inv.amount_paid,
             (inv.grand_total - inv.amount_paid) AS balance_due,
             inv.status,
             DATE_FORMAT(inv.created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM invoices inv
      JOIN guests g ON inv.guest_id = g.guest_id
      LEFT JOIN bookings b ON inv.booking_id = b.booking_id
      LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.room_id
      WHERE 1 = 1
    `;
    const params = [];

    if (status && status !== 'All') {
      sql += ' AND inv.status = ?';
      params.push(status.toLowerCase());
    }

    sql += ' ORDER BY inv.invoice_id DESC';

    const invoices = await query(sql, params);
    const payments = await query(`
      SELECT payment_id AS id, invoice_id, booking_id, payment_type, method AS mode,
             amount AS amt, transaction_ref AS ref,
             DATE_FORMAT(paid_at, '%Y-%m-%d') AS date,
             DATE_FORMAT(paid_at, '%H:%i') AS time,
             'Paid' AS status
      FROM payments ORDER BY paid_at ASC
    `);
    const invWithPayments = invoices.map(inv => ({
      ...inv,
      payments: payments.filter(p => p.invoice_id === inv.id)
    }));
    res.json({ success: true, invoices: invWithPayments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/invoices/:id (Single invoice with items and payments)
router.get('/invoices/:id', async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const inv = await query(`
      SELECT inv.*, g.full_name AS guest_name, g.phone, g.email, g.address,
             b.booking_code, r.room_number,
             DATE_FORMAT(inv.created_at, '%Y-%m-%d %H:%i') AS invoice_date
      FROM invoices inv
      JOIN guests g ON inv.guest_id = g.guest_id
      LEFT JOIN bookings b ON inv.booking_id = b.booking_id
      LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
      LEFT JOIN rooms r ON br.room_id = r.room_id
      WHERE inv.invoice_id = ?
    `, [invoiceId]);

    if (inv.length === 0) return res.status(404).json({ error: 'Invoice not found.' });

    const items = await query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    const payments = await query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC', [invoiceId]);

    res.json({ success: true, invoice: inv[0], items, payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/invoices (New Bill transaction)
router.post('/invoices', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const {
      booking_id, guest_id, items = [],
      status = 'issued'
    } = req.body;

    if (!guest_id) {
      await conn.rollback();
      return res.status(400).json({ error: 'Guest ID is required.' });
    }

    // Generate auto invoice number (INV-xxxx)
    const [maxInv] = await conn.query('SELECT MAX(invoice_id) AS max_id FROM invoices');
    const nextSeq = (maxInv[0]?.max_id || 1000) + 1;
    const invoiceNumber = `INV-${nextSeq}`;

    // Get active GST tax rate
    const [taxRules] = await conn.query("SELECT tax_id, rate_percent FROM tax_rules WHERE is_active = 1 AND tax_name LIKE '%GST%' LIMIT 1");
    const gstRate = parseFloat(taxRules[0]?.rate_percent || 12);
    const taxId = taxRules[0]?.tax_id || null;

    let subtotal = 0;
    let taxTotal = 0;

    const processedItems = items.map(item => {
      const qty = parseFloat(item.quantity || 1);
      const price = parseFloat(item.unit_price || 0);
      const lineSub = qty * price;
      const lineTax = (lineSub * gstRate) / 100;
      const lineTot = lineSub + lineTax;

      subtotal += lineSub;
      taxTotal += lineTax;

      return {
        item_type: item.item_type || 'room',
        description: item.description || 'Hotel Charge',
        quantity: qty,
        unit_price: price,
        tax_amount: lineTax,
        line_total: lineTot,
      };
    });

    const grandTotal = subtotal + taxTotal;

    // Check if booking has advance payment
    let advanceDeducted = 0;
    if (booking_id) {
      const [advPayments] = await conn.query(
        "SELECT COALESCE(SUM(amount), 0) AS total_adv FROM payments WHERE booking_id = ? AND payment_type = 'advance'",
        [booking_id]
      );
      advanceDeducted = parseFloat(advPayments[0]?.total_adv || 0);
    }

    const amountPaid = Math.min(advanceDeducted, grandTotal);
    let finalStatus = status;
    if (amountPaid >= grandTotal && grandTotal > 0) finalStatus = 'paid';
    else if (amountPaid > 0) finalStatus = 'partially_paid';

    // Insert invoice
    const [invRes] = await conn.query(`
      INSERT INTO invoices (invoice_number, booking_id, guest_id, subtotal, tax_total, grand_total, amount_paid, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [invoiceNumber, booking_id || null, guest_id, subtotal, taxTotal, grandTotal, amountPaid, finalStatus, req.user.user_id]);

    const invoiceId = invRes.insertId;

    // Insert items
    for (const it of processedItems) {
      await conn.query(`
        INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_id, tax_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [invoiceId, it.item_type, it.description, it.quantity, it.unit_price, taxId, it.tax_amount, it.line_total]);
    }

    // Link advance payments to this invoice
    if (booking_id && advanceDeducted > 0) {
      await conn.query('UPDATE payments SET invoice_id = ? WHERE booking_id = ? AND payment_type = "advance"', [invoiceId, booking_id]);
    }

    await conn.commit();

    await logActivity(
      req.user.user_id,
      'Created Invoice',
      'invoices',
      invoiceId,
      `Generated invoice ${invoiceNumber} for Rs ${grandTotal.toFixed(2)}.`
    );

    res.json({
      success: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      grand_total: grandTotal,
    });
  } catch (err) {
    await conn.rollback();
    console.error('Invoice creation error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/billing/invoices/:id (Edit draft invoice)
router.put('/invoices/:id', async (req, res) => {
  try {
    const { status, subtotal, tax_total, grand_total } = req.body;
    await query(`
      UPDATE invoices
      SET status = COALESCE(?, status),
          subtotal = COALESCE(?, subtotal),
          tax_total = COALESCE(?, tax_total),
          grand_total = COALESCE(?, grand_total)
      WHERE invoice_id = ?
    `, [status, subtotal, tax_total, grand_total, req.params.id]);

    res.json({ success: true, message: 'Invoice updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/invoices/:id/void (Void invoice)
router.post('/invoices/:id/void', async (req, res) => {
  try {
    await query("UPDATE invoices SET status = 'void' WHERE invoice_id = ?", [req.params.id]);

    await logActivity(
      req.user.user_id,
      'Voided Invoice',
      'invoices',
      req.params.id,
      `Invoice ID ${req.params.id} marked as void.`
    );

    res.json({ success: true, message: 'Invoice marked void.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/payments (Add payment transaction)
router.post('/payments', async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const { invoice_id, amount, method = 'cash', payment_type = 'payment', transaction_ref } = req.body;
    const payAmount = parseFloat(amount);

    if (!invoice_id || isNaN(payAmount) || payAmount <= 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Valid invoice ID and positive payment amount are required.' });
    }

    const [invoices] = await conn.query(
      'SELECT invoice_id, booking_id, grand_total, amount_paid, status, invoice_number FROM invoices WHERE invoice_id = ?',
      [invoice_id]
    );

    if (invoices.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    const inv = invoices[0];
    const newPaid = parseFloat(inv.amount_paid) + payAmount;
    let newStatus = inv.status;

    if (newPaid >= parseFloat(inv.grand_total)) {
      newStatus = 'paid';
    } else {
      newStatus = 'partially_paid';
    }

    // Insert payment
    const [payRes] = await conn.query(`
      INSERT INTO payments (invoice_id, booking_id, payment_type, method, amount, transaction_ref, received_by, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [invoice_id, inv.booking_id, payment_type, method.toLowerCase(), payAmount, transaction_ref || (method.toLowerCase() === 'cash' ? 'CASH-REC' : `TXN-${Date.now().toString().slice(-6)}`), req.user.user_id]);

    // Update invoice amount_paid & status
    await conn.query(`
      UPDATE invoices
      SET amount_paid = ?, status = ?
      WHERE invoice_id = ?
    `, [newPaid, newStatus, invoice_id]);

    await conn.commit();

    await logActivity(
      req.user.user_id,
      'Payment Received',
      'payments',
      payRes.insertId,
      `Received Rs ${payAmount} (${method}) for ${inv.invoice_number}. New status: ${newStatus}.`
    );

    // Notification for all dashboards
    await createNotification(
      null,
      'Payment Received',
      `Payment of Rs ${payAmount} (${method}) received for invoice ${inv.invoice_number}. Status: ${newStatus}.`
    );

    res.json({
      success: true,
      payment_id: payRes.insertId,
      amount_paid: newPaid,
      invoice_status: newStatus,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/billing/refunds
router.get('/refunds', async (req, res) => {
  try {
    const refunds = await query(`
      SELECT ref.refund_id AS id, ref.invoice_id, inv.invoice_number,
             ref.amount, ref.reason, ref.status,
             DATE_FORMAT(ref.created_at, '%Y-%m-%d %H:%i') AS created_at,
             u.full_name AS requested_by,
             ua.full_name AS approved_by
      FROM refunds ref
      LEFT JOIN invoices inv ON ref.invoice_id = inv.invoice_id
      LEFT JOIN users u ON ref.requested_by = u.user_id
      LEFT JOIN users ua ON ref.approved_by = ua.user_id
      ORDER BY ref.created_at DESC
    `);
    res.json({ success: true, refunds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/refunds
router.post('/refunds', async (req, res) => {
  try {
    const { invoice_id, amount, reason } = req.body;
    if (!amount || !reason) return res.status(400).json({ error: 'Amount and reason are required.' });

    const result = await query(`
      INSERT INTO refunds (invoice_id, amount, reason, status, requested_by, created_at)
      VALUES (?, ?, ?, 'pending', ?, NOW())
    `, [invoice_id || null, amount, reason, req.user.user_id]);

    res.json({ success: true, id: result.insertId, message: 'Refund request created.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/billing/refunds/:id/status (Approve / Reject / Process refund)
router.put('/refunds/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await query(`
      UPDATE refunds
      SET status = ?, approved_by = ?
      WHERE refund_id = ?
    `, [status, req.user.user_id, req.params.id]);

    await logActivity(
      req.user.user_id,
      'Refund Status Updated',
      'refunds',
      req.params.id,
      `Refund #${req.params.id} marked as ${status}.`
    );

    res.json({ success: true, message: `Refund marked as ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/revenue (Daily Revenue & Reports)
router.get('/revenue', async (req, res) => {
  try {
    const daily = await query(`
      SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') AS date,
             SUM(amount) AS total,
             SUM(CASE WHEN method = 'cash' THEN amount ELSE 0 END) AS cash,
             SUM(CASE WHEN method = 'card' THEN amount ELSE 0 END) AS card,
             SUM(CASE WHEN method = 'upi' THEN amount ELSE 0 END) AS upi
      FROM payments
      GROUP BY DATE_FORMAT(paid_at, '%Y-%m-%d')
      ORDER BY date DESC
      LIMIT 14
    `);
    res.json({ success: true, daily });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/guests (Guest Accounts with balances)
router.get('/guests', async (req, res) => {
  try {
    const guests = await query(`
      SELECT g.guest_id AS id, g.full_name AS name, g.phone, g.email,
             COUNT(inv.invoice_id) AS total_invoices,
             COALESCE(SUM(inv.grand_total), 0) AS total_billed,
             COALESCE(SUM(inv.amount_paid), 0) AS total_paid,
             COALESCE(SUM(inv.grand_total - inv.amount_paid), 0) AS balance_due
      FROM guests g
      LEFT JOIN invoices inv ON g.guest_id = inv.guest_id AND inv.status != 'void'
      GROUP BY g.guest_id
      ORDER BY balance_due DESC
    `);
    res.json({ success: true, guests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/activity
router.get('/activity', async (req, res) => {
  try {
    const activity = await query(`
      SELECT a.activity_id AS id, a.action, a.description,
             DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS at,
             COALESCE(u.full_name, 'Staff') AS staff
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.user_id
      WHERE a.entity_type IN ('invoices', 'payments', 'refunds')
         OR a.action LIKE '%Bill%'
         OR a.action LIKE '%Payment%'
      ORDER BY a.created_at DESC
      LIMIT 20
    `);
    res.json({ success: true, activity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/notifications
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

// GET /api/billing/salaries (Staff payroll, bonuses, incentives and points)
router.get('/salaries', async (req, res) => {
  try {
    const salaries = await query(`
      SELECT salary_id, employee_id, employee_name, designation, department,
             basic_salary, allowances, bonus, points, deductions,
             total_earnings, net_salary, period, status,
             DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date,
             payment_method, transaction_ref,
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
      FROM employee_salaries
      ORDER BY salary_id DESC
    `);
    res.json({ success: true, salaries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/salaries (Create/calculate new salary record)
router.post('/salaries', async (req, res) => {
  try {
    const {
      employee_id, employee_name, designation, department,
      basic_salary = 0, allowances = 0, bonus = 0, points = 0, deductions = 0,
      period = 'October 2026', payment_method = 'Bank Transfer'
    } = req.body;

    if (!employee_name || !designation) {
      return res.status(400).json({ error: 'Employee name and designation are required.' });
    }

    const b = parseFloat(basic_salary) || 0;
    const a = parseFloat(allowances) || 0;
    const bo = parseFloat(bonus) || 0;
    const d = parseFloat(deductions) || 0;
    const pts = parseInt(points, 10) || 0;
    const totEarn = b + a + bo;
    const net = Math.max(0, totEarn - d);
    const empId = employee_id || `EMP-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await query(`
      INSERT INTO employee_salaries
        (employee_id, employee_name, designation, department, basic_salary, allowances, bonus, points, deductions, total_earnings, net_salary, period, status, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
    `, [empId, employee_name, designation, department || 'General', b, a, bo, pts, d, totEarn, net, period, payment_method]);

    await logActivity(
      req.user.user_id,
      'Created Salary Record',
      'employee_salaries',
      result.insertId,
      `Created payroll for ${employee_name} (${period}): Net Rs ${net}.`
    );

    res.json({ success: true, salary_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/billing/salaries/:id (Update salary / incentives / points)
router.put('/salaries/:id', async (req, res) => {
  try {
    const { basic_salary, allowances, bonus, points, deductions, status, payment_method } = req.body;
    const existing = await query('SELECT * FROM employee_salaries WHERE salary_id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Salary record not found.' });

    const prev = existing[0];
    const b = basic_salary !== undefined ? parseFloat(basic_salary) : parseFloat(prev.basic_salary);
    const a = allowances !== undefined ? parseFloat(allowances) : parseFloat(prev.allowances);
    const bo = bonus !== undefined ? parseFloat(bonus) : parseFloat(prev.bonus);
    const d = deductions !== undefined ? parseFloat(deductions) : parseFloat(prev.deductions);
    const pts = points !== undefined ? parseInt(points, 10) : prev.points;
    const st = status || prev.status;
    const pm = payment_method || prev.payment_method;
    const totEarn = b + a + bo;
    const net = Math.max(0, totEarn - d);

    await query(`
      UPDATE employee_salaries
      SET basic_salary = ?, allowances = ?, bonus = ?, points = ?, deductions = ?,
          total_earnings = ?, net_salary = ?, status = ?, payment_method = ?
      WHERE salary_id = ?
    `, [b, a, bo, pts, d, totEarn, net, st, pm, req.params.id]);

    res.json({ success: true, message: 'Salary record updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/salaries/:id/disburse (Disburse / Mark salary as paid)
router.post('/salaries/:id/disburse', async (req, res) => {
  try {
    const txnRef = `SAL-TXN-${Date.now().toString().slice(-6)}`;
    await query(`
      UPDATE employee_salaries
      SET status = 'Paid', payment_date = CURDATE(), transaction_ref = ?
      WHERE salary_id = ?
    `, [txnRef, req.params.id]);

    await logActivity(
      req.user.user_id,
      'Disbursed Salary',
      'employee_salaries',
      req.params.id,
      `Disbursed salary for record #${req.params.id} (Txn: ${txnRef}).`
    );

    res.json({ success: true, transaction_ref: txnRef });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/billing/notifications/:id/read
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = 1 WHERE notification_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
