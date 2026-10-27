<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_middleware.php';

function handle_billing_routes($method, $path, $body, $query_params) {
    $authUser = authenticate();
    authorize('billing', 'accountant', 'admin', 'administrator');

    // GET /overview
    if ($method === 'GET' && $path === '/overview') {
        try {
            $dues = query(
                "SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS total_due
                 FROM invoices
                 WHERE status IN ('issued', 'partially_paid', 'draft')"
            );
            $collected = query(
                "SELECT COALESCE(SUM(amount), 0) AS total_collected
                 FROM payments
                 WHERE DATE(paid_at) = CURDATE()"
            );
            $billsToday = query(
                "SELECT COUNT(*) AS count
                 FROM invoices
                 WHERE DATE(created_at) = CURDATE()"
            );
            $awaiting = query(
                "SELECT COUNT(DISTINCT b.booking_id) AS count
                 FROM bookings b
                 LEFT JOIN invoices inv ON b.booking_id = inv.booking_id AND inv.status = 'paid'
                 WHERE inv.invoice_id IS NULL AND b.status IN ('checked_in', 'checked_out', 'confirmed')"
            );

            json_response([
                'success' => true,
                'stats' => [
                    'awaitingBilling' => !empty($awaiting) ? (int)$awaiting[0]['count'] : 0,
                    'outstandingDues' => !empty($dues) ? (float)$dues[0]['total_due'] : 0.0,
                    'collectedToday' => !empty($collected) ? (float)$collected[0]['total_collected'] : 0.0,
                    'billsToday' => !empty($billsToday) ? (int)$billsToday[0]['count'] : 0,
                ]
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /next-to-bill
    if ($method === 'GET' && $path === '/next-to-bill') {
        try {
            $rows = query(
                "SELECT b.booking_id, b.booking_code,
                        DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS check_in_date,
                        DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS check_out_date,
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
                 ORDER BY b.check_out_date ASC"
            );
            foreach ($rows as &$r) {
                $r['booking_id'] = (int)$r['booking_id'];
                $r['guest_id'] = (int)$r['guest_id'];
                $r['advance_amount'] = (float)$r['advance_amount'];
                if (isset($r['rate_per_night'])) $r['rate_per_night'] = (float)$r['rate_per_night'];
                if (isset($r['grand_total'])) $r['grand_total'] = (float)$r['grand_total'];
                if (isset($r['amount_paid'])) $r['amount_paid'] = (float)$r['amount_paid'];
            }
            json_response(['success' => true, 'list' => $rows]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /invoices or /pending-bills
    if ($method === 'GET' && ($path === '/invoices' || $path === '/pending-bills')) {
        try {
            $statusParam = $query_params['status'] ?? ($path === '/pending-bills' ? 'unpaid' : null);
            $sql = "SELECT inv.invoice_id AS id, inv.invoice_number, inv.booking_id,
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
                    WHERE 1 = 1";
            $params = [];
            if ($statusParam && $statusParam !== 'All') {
                if (strtolower($statusParam) === 'unpaid') {
                    $sql .= " AND inv.status != 'paid' AND inv.status != 'void' AND (inv.grand_total - inv.amount_paid) > 0";
                } else {
                    $sql .= " AND inv.status = ?";
                    $params[] = strtolower($statusParam);
                }
            }
            $sql .= " ORDER BY inv.invoice_id DESC";
            $invoices = query($sql, $params);

            // Fetch payment history for real-time association
            $payments = query(
                "SELECT payment_id AS id, invoice_id, booking_id, payment_type, method AS mode,
                        amount AS amt, CONCAT('PAY-', payment_id) AS ref,
                        DATE_FORMAT(paid_at, '%Y-%m-%d') AS date,
                        DATE_FORMAT(paid_at, '%H:%i') AS time,
                        'Paid' AS status
                 FROM payments
                 ORDER BY paid_at ASC"
            );

            $payMap = [];
            foreach ($payments as $p) {
                $invId = $p['invoice_id'];
                if (!isset($payMap[$invId])) {
                    $payMap[$invId] = [];
                }
                $p['amt'] = (float)$p['amt'];
                $payMap[$invId][] = $p;
            }

            foreach ($invoices as &$inv) {
                $inv['id'] = (int)$inv['id'];
                $inv['subtotal'] = (float)$inv['subtotal'];
                $inv['tax_total'] = (float)$inv['tax_total'];
                $inv['grand_total'] = (float)$inv['grand_total'];
                $inv['amount_paid'] = (float)$inv['amount_paid'];
                $inv['balance_due'] = (float)$inv['balance_due'];
                $inv['payments'] = $payMap[$inv['id']] ?? [];
            }

            json_response(['success' => true, 'invoices' => $invoices]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /invoices/{id}
    if ($method === 'GET' && preg_match('#^/invoices/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $inv = query(
                "SELECT inv.*, g.full_name AS guest_name, g.phone, g.email, g.address,
                        b.booking_code, r.room_number,
                        DATE_FORMAT(inv.created_at, '%Y-%m-%d %H:%i') AS invoice_date
                 FROM invoices inv
                 JOIN guests g ON inv.guest_id = g.guest_id
                 LEFT JOIN bookings b ON inv.booking_id = b.booking_id
                 LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
                 LEFT JOIN rooms r ON br.room_id = r.room_id
                 WHERE inv.invoice_id = ?",
                [$id]
            );
            if (empty($inv)) {
                json_response(['error' => 'Invoice not found.'], 404);
            }

            $items = query("SELECT * FROM invoice_items WHERE invoice_id = ?", [$id]);
            $payments = query("SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC", [$id]);

            json_response(['success' => true, 'invoice' => $inv[0], 'items' => $items, 'payments' => $payments]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /invoices
    if ($method === 'POST' && $path === '/invoices') {
        try {
            db_begin();
            $bookingId = $body['booking_id'] ?? null;
            $guestId = $body['guest_id'] ?? null;
            $items = $body['items'] ?? [];
            $discount = (float)($body['discount'] ?? 0);

            if (!$guestId && $bookingId) {
                $bRow = query("SELECT guest_id FROM bookings WHERE booking_id = ?", [$bookingId]);
                if (!empty($bRow)) {
                    $guestId = $bRow[0]['guest_id'];
                }
            }

            if (!$guestId) {
                db_rollback();
                json_response(['error' => 'Guest ID or valid Booking ID is required.'], 400);
            }

            $subtotal = 0.0;
            foreach ($items as $it) {
                $qty = (float)($it['quantity'] ?? 1);
                $price = (float)($it['unit_price'] ?? 0);
                $subtotal += ($qty * $price);
            }

            $taxRate = 0.12;
            $taxTotal = round(max(0, $subtotal - $discount) * $taxRate, 2);
            $grandTotal = round(max(0, $subtotal - $discount) + $taxTotal, 2);

            $advancePaid = 0.0;
            if ($bookingId) {
                $advRow = query(
                    "SELECT COALESCE(SUM(amount), 0) AS adv FROM payments WHERE booking_id = ? AND payment_type = 'advance'",
                    [$bookingId]
                );
                if (!empty($advRow)) {
                    $advancePaid = (float)$advRow[0]['adv'];
                }
            }

            $invoiceNumber = sprintf("INV-%d", rand(1000, 9999));
            $status = ($advancePaid >= $grandTotal) ? 'paid' : (($advancePaid > 0) ? 'partially_paid' : 'issued');

            $invRes = query(
                "INSERT INTO invoices (invoice_number, booking_id, guest_id, subtotal, tax_total, grand_total, amount_paid, status, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [$invoiceNumber, $bookingId, $guestId, $subtotal, $taxTotal, $grandTotal, $advancePaid, $status, $authUser['user_id']]
            );
            $invoiceId = $invRes['insertId'];

            foreach ($items as $it) {
                $qty = (float)($it['quantity'] ?? 1);
                $price = (float)($it['unit_price'] ?? 0);
                $lineSub = $qty * $price;
                $lineTax = round($lineSub * $taxRate, 2);
                $lineTot = $lineSub + $lineTax;
                query(
                    "INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_amount, line_total)
                     VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [$invoiceId, $it['item_type'] ?? 'service', $it['description'] ?? 'Service Charge', $qty, $price, $lineTax, $lineTot]
                );
            }

            if ($bookingId && $advancePaid > 0) {
                query("UPDATE payments SET invoice_id = ? WHERE booking_id = ? AND payment_type = 'advance'", [$invoiceId, $bookingId]);
            }

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Created Invoice",
                "invoices",
                $invoiceId,
                sprintf("Generated invoice %s for Rs %.2f.", $invoiceNumber, $grandTotal)
            );

            json_response([
                'success' => true,
                'invoice_id' => $invoiceId,
                'invoice_number' => $invoiceNumber,
                'grand_total' => $grandTotal,
            ]);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /invoices/{id}
    if ($method === 'PUT' && preg_match('#^/invoices/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $fields = [];
            $params = [];
            foreach (['status', 'subtotal', 'tax_total', 'grand_total'] as $k) {
                if (isset($body[$k])) {
                    $fields[] = "{$k} = ?";
                    $params[] = $body[$k];
                }
            }

            if (!empty($fields)) {
                $params[] = $id;
                query("UPDATE invoices SET " . implode(', ', $fields) . " WHERE invoice_id = ?", $params);
            }

            json_response(['success' => true, 'message' => 'Invoice updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /invoices/{id}/void
    if ($method === 'POST' && preg_match('#^/invoices/(\d+)/void$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query("UPDATE invoices SET status = 'void' WHERE invoice_id = ?", [$id]);
            log_activity(
                $authUser['user_id'],
                "Voided Invoice",
                "invoices",
                $id,
                sprintf("Invoice ID %d marked as void.", $id)
            );
            json_response(['success' => true, 'message' => 'Invoice marked void.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /payments
    if ($method === 'POST' && $path === '/payments') {
        try {
            $invoiceId = $body['invoice_id'] ?? null;
            $amount = (float)($body['amount'] ?? 0);
            $methodRaw = strtolower(trim((string)($body['method'] ?? 'cash')));
            $methodMap = [
                'cash' => 'cash',
                'card' => 'card',
                'upi' => 'upi',
                'bank_transfer' => 'bank_transfer',
                'online' => 'upi',
                'bank' => 'bank_transfer'
            ];
            $methodVal = $methodMap[$methodRaw] ?? 'cash';
            $paymentType = (strtolower((string)($body['payment_type'] ?? '')) === 'advance') ? 'advance' : 'payment';

            if (!$invoiceId || $amount <= 0) {
                json_response(['error' => 'Valid invoice ID and positive payment amount are required.'], 400);
            }

            db_begin();
            $cleanInvId = is_numeric($invoiceId) ? (int)$invoiceId : (int)preg_replace('/\D/', '', $invoiceId);
            $invRow = query(
                "SELECT invoice_id, booking_id, grand_total, amount_paid, status, invoice_number
                 FROM invoices
                 WHERE invoice_id = ? OR invoice_id = ? OR invoice_number = ? OR invoice_number = CONCAT('INV-', ?)",
                [$invoiceId, $cleanInvId, (string)$invoiceId, (string)$cleanInvId]
            );
            if (empty($invRow)) {
                db_rollback();
                json_response(['error' => 'Invoice not found.'], 404);
            }

            $invoiceId = $invRow[0]['invoice_id'];
            $currentPaid = (float)($invRow[0]['amount_paid'] ?? 0);
            $newPaid = $currentPaid + $amount;
            $grandTotal = (float)($invRow[0]['grand_total'] ?? 0);

            $newStatus = ($newPaid >= $grandTotal) ? 'paid' : 'partially_paid';

            $payRes = query(
                "INSERT INTO payments (invoice_id, booking_id, payment_type, method, amount, received_by, paid_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())",
                [$invoiceId, $invRow[0]['booking_id'], $paymentType, $methodVal, $amount, $authUser['user_id']]
            );
            $payId = $payRes['insertId'];

            query("UPDATE invoices SET amount_paid = ?, status = ? WHERE invoice_id = ?", [$newPaid, $newStatus, $invoiceId]);

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Recorded Payment",
                "payments",
                $payId,
                sprintf("Received payment of Rs %.2f via %s for invoice %s (Status: %s).", $amount, strtoupper($methodVal), $invRow[0]['invoice_number'], $newStatus)
            );

            json_response([
                'success' => true,
                'payment_id' => $payId,
                'new_amount_paid' => $newPaid,
                'balance_due' => max(0.0, $grandTotal - $newPaid),
                'status' => $newStatus,
            ]);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /refunds
    if ($method === 'GET' && $path === '/refunds') {
        try {
            $refunds = query(
                "SELECT rf.refund_id AS id, rf.invoice_id,
                        inv.invoice_number, g.full_name AS guest,
                        rf.amount, rf.reason, rf.status,
                        u_req.full_name AS requested_by,
                        u_appr.full_name AS approved_by,
                        DATE_FORMAT(rf.created_at, '%Y-%m-%d') AS created_at
                 FROM refunds rf
                 JOIN invoices inv ON rf.invoice_id = inv.invoice_id
                 JOIN guests g ON inv.guest_id = g.guest_id
                 LEFT JOIN users u_req ON rf.requested_by = u_req.user_id
                 LEFT JOIN users u_appr ON rf.approved_by = u_appr.user_id
                 ORDER BY rf.refund_id DESC"
            );
            foreach ($refunds as &$rf) {
                $rf['id'] = (int)$rf['id'];
                $rf['amount'] = (float)$rf['amount'];
            }
            json_response(['success' => true, 'refunds' => $refunds]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /refunds
    if ($method === 'POST' && $path === '/refunds') {
        try {
            $invoiceId = $body['invoice_id'] ?? null;
            $amount = (float)($body['amount'] ?? 0);
            $reason = $body['reason'] ?? '';

            if (!$invoiceId || $amount <= 0) {
                json_response(['error' => 'Invoice ID and valid refund amount are required.'], 400);
            }

            $res = query(
                "INSERT INTO refunds (invoice_id, amount, reason, status, requested_by, created_at)
                 VALUES (?, ?, ?, 'pending', ?, NOW())",
                [$invoiceId, $amount, $reason, $authUser['user_id']]
            );

            json_response(['success' => true, 'refund_id' => $res['insertId']]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /refunds/{id}/status
    if ($method === 'PUT' && preg_match('#^/refunds/(\d+)/status$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $status = strtolower($body['status'] ?? 'approved');
            query("UPDATE refunds SET status = ?, approved_by = ? WHERE refund_id = ?", [$status, $authUser['user_id'], $id]);
            json_response(['success' => true, 'message' => sprintf("Refund marked as %s.", $status)]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /revenue
    if ($method === 'GET' && $path === '/revenue') {
        try {
            $paymentsByMethod = query(
                "SELECT method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
                 FROM payments
                 GROUP BY method"
            );
            $dailyRevenue = query(
                "SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') AS date,
                        COALESCE(SUM(amount), 0) AS total,
                        COUNT(*) AS count
                 FROM payments
                 GROUP BY DATE(paid_at)
                 ORDER BY DATE(paid_at) DESC
                 LIMIT 30"
            );
            $revByType = query(
                "SELECT it.item_type, COALESCE(SUM(it.line_total), 0) AS total
                 FROM invoice_items it
                 JOIN invoices inv ON it.invoice_id = inv.invoice_id
                 WHERE inv.status != 'void'
                 GROUP BY it.item_type"
            );

            foreach ($paymentsByMethod as &$p) {
                $p['total'] = (float)$p['total'];
                $p['count'] = (int)$p['count'];
            }
            foreach ($dailyRevenue as &$d) {
                $d['total'] = (float)$d['total'];
                $d['count'] = (int)$d['count'];
            }
            foreach ($revByType as &$r) {
                $r['total'] = (float)$r['total'];
            }

            json_response([
                'success' => true,
                'byMethod' => $paymentsByMethod,
                'dailyRevenue' => $dailyRevenue,
                'byCategory' => $revByType,
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /guests
    if ($method === 'GET' && $path === '/guests') {
        try {
            $guests = query(
                "SELECT g.guest_id AS id, g.full_name AS name, g.phone, g.email,
                        COALESCE(SUM(inv.grand_total), 0) AS total_billed,
                        COALESCE(SUM(inv.amount_paid), 0) AS total_paid,
                        COALESCE(SUM(inv.grand_total - inv.amount_paid), 0) AS balance_due,
                        COUNT(b.booking_id) AS total_bookings
                 FROM guests g
                 LEFT JOIN bookings b ON g.guest_id = b.guest_id
                 LEFT JOIN invoices inv ON b.booking_id = inv.booking_id AND inv.status != 'void'
                 GROUP BY g.guest_id
                 ORDER BY balance_due DESC, g.guest_id DESC"
            );
            foreach ($guests as &$g) {
                $g['id'] = (int)$g['id'];
                $g['total_billed'] = (float)$g['total_billed'];
                $g['total_paid'] = (float)$g['total_paid'];
                $g['balance_due'] = (float)$g['balance_due'];
                $g['total_bookings'] = (int)$g['total_bookings'];
            }
            json_response(['success' => true, 'guests' => $guests]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /guests/{id} or /guests/{id}/account
    if ($method === 'GET' && preg_match('#^/guests/(\d+)(?:/account)?$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $guest = query("SELECT * FROM guests WHERE guest_id = ?", [$id]);
            if (empty($guest)) {
                json_response(['error' => 'Guest not found.'], 404);
            }
            $bookings = query(
                "SELECT b.booking_id, b.booking_code,
                        DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS check_in_date,
                        DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS check_out_date,
                        b.status, r.room_number, t.type_name, br.rate_per_night, b.advance_amount
                 FROM bookings b
                 LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
                 LEFT JOIN rooms r ON br.room_id = r.room_id
                 LEFT JOIN room_types t ON r.room_type_id = t.room_type_id
                 WHERE b.guest_id = ?
                 ORDER BY b.booking_id DESC",
                [$id]
            );
            $invoices = query(
                "SELECT inv.*, DATE_FORMAT(inv.created_at, '%Y-%m-%d %H:%i') AS created_at
                 FROM invoices inv
                 WHERE inv.guest_id = ?
                 ORDER BY inv.invoice_id DESC",
                [$id]
            );
            $payments = query(
                "SELECT p.payment_id, p.invoice_id, p.amount, p.method, p.payment_type,
                        DATE_FORMAT(p.paid_at, '%Y-%m-%d %H:%i') AS paid_at
                 FROM payments p
                 JOIN invoices inv ON p.invoice_id = inv.invoice_id
                 WHERE inv.guest_id = ?
                 ORDER BY p.payment_id DESC",
                [$id]
            );
            json_response([
                'success' => true,
                'guest' => $guest[0],
                'bookings' => $bookings,
                'invoices' => $invoices,
                'payments' => $payments,
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /activity
    if ($method === 'GET' && $path === '/activity') {
        try {
            $activity = query(
                "SELECT a.activity_id, a.action, a.description,
                        DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS at,
                        COALESCE(u.full_name, 'System') AS staff
                 FROM activity_log a
                 LEFT JOIN users u ON a.user_id = u.user_id
                 ORDER BY a.created_at DESC
                 LIMIT 25"
            );
            json_response(['success' => true, 'activity' => $activity]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /notifications
    if ($method === 'GET' && $path === '/notifications') {
        try {
            $notifications = query(
                "SELECT notification_id AS id, title, message, is_read,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
                 FROM notifications
                 WHERE user_id = ? OR user_id IS NULL
                 ORDER BY notification_id DESC
                 LIMIT 50",
                [$authUser['user_id']]
            );
            foreach ($notifications as &$n) {
                $n['id'] = (int)$n['id'];
                $n['is_read'] = (bool)$n['is_read'];
            }
            json_response(['success' => true, 'notifications' => $notifications]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PATCH /notifications/{id}/read
    if ($method === 'PATCH' && preg_match('#^/notifications/(\d+)/read$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query("UPDATE notifications SET is_read = 1 WHERE notification_id = ?", [$id]);
            json_response(['success' => true, 'message' => 'Notification marked as read.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /salaries or /payroll
    if ($method === 'GET' && ($path === '/salaries' || $path === '/payroll')) {
        try {
            $salaries = query(
                "SELECT salary_id, employee_id, employee_name, designation, department,
                        basic_salary, allowances, bonus, points, deductions,
                        total_earnings, net_salary, period, status,
                        DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date,
                        payment_method, transaction_ref,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
                 FROM employee_salaries
                 ORDER BY salary_id DESC"
            );
            foreach ($salaries as &$s) {
                $s['salary_id'] = (int)$s['salary_id'];
                $s['basic_salary'] = (float)$s['basic_salary'];
                $s['allowances'] = (float)$s['allowances'];
                $s['bonus'] = (float)$s['bonus'];
                $s['points'] = (int)$s['points'];
                $s['deductions'] = (float)$s['deductions'];
                $s['total_earnings'] = (float)$s['total_earnings'];
                $s['net_salary'] = (float)$s['net_salary'];
            }
            json_response(['success' => true, 'salaries' => $salaries]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /salaries
    if ($method === 'POST' && $path === '/salaries') {
        try {
            $employeeId = $body['employee_id'] ?? sprintf("EMP-%d", rand(1000, 9999));
            $employeeName = $body['employee_name'] ?? null;
            $designation = $body['designation'] ?? null;
            $department = $body['department'] ?? 'General';
            $basicSalary = (float)($body['basic_salary'] ?? 0);
            $allowances = (float)($body['allowances'] ?? 0);
            $bonus = (float)($body['bonus'] ?? 0);
            $points = (int)($body['points'] ?? 0);
            $deductions = (float)($body['deductions'] ?? 0);
            $period = $body['period'] ?? 'October 2026';
            $paymentMethod = $body['payment_method'] ?? 'Bank Transfer';

            if (!$employeeName || !$designation) {
                json_response(['error' => 'Employee name and designation are required.'], 400);
            }

            $totEarn = $basicSalary + $allowances + $bonus;
            $net = max(0.0, $totEarn - $deductions);

            $res = query(
                "INSERT INTO employee_salaries
                   (employee_id, employee_name, designation, department, basic_salary, allowances, bonus, points, deductions, total_earnings, net_salary, period, status, payment_method)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)",
                [$employeeId, $employeeName, $designation, $department, $basicSalary, $allowances, $bonus, $points, $deductions, $totEarn, $net, $period, $paymentMethod]
            );

            log_activity(
                $authUser['user_id'],
                "Created Salary Record",
                "employee_salaries",
                $res['insertId'],
                sprintf("Created payroll for %s (%s): Net Rs %.2f.", $employeeName, $period, $net)
            );

            json_response(['success' => true, 'salary_id' => $res['insertId']]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /salaries/{id}
    if ($method === 'PUT' && preg_match('#^/salaries/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $existing = query("SELECT * FROM employee_salaries WHERE salary_id = ?", [$id]);
            if (empty($existing)) {
                json_response(['error' => 'Salary record not found.'], 404);
            }

            $prev = $existing[0];
            $b = isset($body['basic_salary']) ? (float)$body['basic_salary'] : (float)$prev['basic_salary'];
            $a = isset($body['allowances']) ? (float)$body['allowances'] : (float)$prev['allowances'];
            $bo = isset($body['bonus']) ? (float)$body['bonus'] : (float)$prev['bonus'];
            $d = isset($body['deductions']) ? (float)$body['deductions'] : (float)$prev['deductions'];
            $pts = isset($body['points']) ? (int)$body['points'] : (int)$prev['points'];
            $st = $body['status'] ?? $prev['status'];
            $pm = $body['payment_method'] ?? $prev['payment_method'];
            $totEarn = $b + $a + $bo;
            $net = max(0.0, $totEarn - $d);

            query(
                "UPDATE employee_salaries
                 SET basic_salary = ?, allowances = ?, bonus = ?, points = ?, deductions = ?,
                     total_earnings = ?, net_salary = ?, status = ?, payment_method = ?
                 WHERE salary_id = ?",
                [$b, $a, $bo, $pts, $d, $totEarn, $net, $st, $pm, $id]
            );

            json_response(['success' => true, 'message' => 'Salary record updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST/PUT /salaries/{id}/disburse
    if (($method === 'POST' || $method === 'PUT') && preg_match('#^/salaries/(\d+)/disburse$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $txnRef = sprintf("SAL-TXN-%06d", (int)(microtime(true) * 1000) % 1000000);
            query(
                "UPDATE employee_salaries
                 SET status = 'Paid', payment_date = CURDATE(), transaction_ref = ?
                 WHERE salary_id = ?",
                [$txnRef, $id]
            );

            log_activity(
                $authUser['user_id'],
                "Disbursed Salary",
                "employee_salaries",
                $id,
                sprintf("Disbursed salary for record #%d (Txn: %s).", $id, $txnRef)
            );

            json_response(['success' => true, 'transaction_ref' => $txnRef]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    json_response(['error' => 'Endpoint not found'], 404);
}
