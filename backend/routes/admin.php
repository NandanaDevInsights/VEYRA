<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_middleware.php';

function handle_admin_routes($method, $path, $body, $query_params) {
    // Enforce admin authentication & authorization
    $authUser = authenticate();
    authorize('admin', 'administrator');

    // GET /overview
    if ($method === 'GET' && $path === '/overview') {
        try {
            $rooms = query("SELECT room_id, status FROM rooms WHERE is_sellable = 1");
            $totalRooms = count($rooms);
            $available = 0;
            $occupied = 0;
            $dirty = 0;
            foreach ($rooms as $r) {
                if ($r['status'] === 'vacant_ready') $available++;
                elseif ($r['status'] === 'occupied') $occupied++;
                elseif ($r['status'] === 'vacant_dirty') $dirty++;
            }
            $occupancyRate = ($totalRooms > 0) ? (int)round(($occupied / $totalRooms) * 100) : 0;

            $checkIns = query("SELECT COUNT(*) AS count FROM bookings WHERE check_in_date = CURDATE()");
            $checkOuts = query("SELECT COUNT(*) AS count FROM bookings WHERE check_out_date = CURDATE()");

            $recentActivity = query(
                "SELECT a.activity_id, a.action, a.entity_type, a.entity_id, a.description,
                        DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS at,
                        COALESCE(u.full_name, 'System') AS staff
                 FROM activity_log a
                 LEFT JOIN users u ON a.user_id = u.user_id
                 ORDER BY a.created_at DESC
                 LIMIT 10"
            );

            json_response([
                'success' => true,
                'stats' => [
                    'totalRooms' => $totalRooms,
                    'available' => $available,
                    'occupied' => $occupied,
                    'dirty' => $dirty,
                    'occupancyRate' => $occupancyRate,
                    'checkInsToday' => !empty($checkIns) ? (int)$checkIns[0]['count'] : 0,
                    'checkOutsToday' => !empty($checkOuts) ? (int)$checkOuts[0]['count'] : 0,
                ],
                'recentActivity' => $recentActivity,
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /operations
    if ($method === 'GET' && $path === '/operations') {
        try {
            $recentBookings = query(
                "SELECT b.booking_id, b.booking_code, g.full_name AS guest, g.phone,
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
                 LIMIT 15"
            );

            $serviceRequests = query(
                "SELECT sr.request_id, r.room_number, sr.category, sr.description,
                        sr.status,
                        COALESCE(u.full_name, 'Anita Joseph') AS staff,
                        DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i') AS created_at
                 FROM service_requests sr
                 JOIN rooms r ON sr.room_id = r.room_id
                 LEFT JOIN users u ON sr.assigned_to = u.user_id
                 ORDER BY sr.request_id DESC
                 LIMIT 15"
            );

            $ratings = query(
                "SELECT notification_id AS id, title, message,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS time
                 FROM notifications
                 WHERE title LIKE '%Rating%' OR message LIKE '%Rated%' OR message LIKE '%star%'
                 ORDER BY notification_id DESC
                 LIMIT 15"
            );

            $recentInvoices = query(
                "SELECT inv.invoice_id, inv.invoice_number, g.full_name AS guest,
                        COALESCE(r.room_number, '101') AS room,
                        inv.subtotal, inv.tax_total, inv.grand_total, inv.amount_paid, inv.status,
                        DATE_FORMAT(inv.created_at, '%Y-%m-%d %H:%i') AS created_at
                 FROM invoices inv
                 JOIN guests g ON inv.guest_id = g.guest_id
                 LEFT JOIN bookings b ON inv.booking_id = b.booking_id
                 LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
                 LEFT JOIN rooms r ON br.room_id = r.room_id
                 ORDER BY inv.invoice_id DESC
                 LIMIT 15"
            );

            $recentPayments = query(
                "SELECT p.payment_id, p.invoice_id, inv.invoice_number, g.full_name AS guest,
                        p.amount, p.method,
                        DATE_FORMAT(p.paid_at, '%Y-%m-%d %H:%i') AS payment_date,
                        COALESCE(u.full_name, 'Meera Nair') AS collected_by
                 FROM payments p
                 LEFT JOIN invoices inv ON p.invoice_id = inv.invoice_id
                 LEFT JOIN guests g ON inv.guest_id = g.guest_id
                 LEFT JOIN users u ON p.received_by = u.user_id
                 ORDER BY p.payment_id DESC
                 LIMIT 15"
            );

            $financialSummary = query(
                "SELECT
                   COALESCE(SUM(amount), 0) AS total_collected,
                   COALESCE(SUM(CASE WHEN DATE(paid_at) = CURDATE() THEN amount ELSE 0 END), 0) AS collected_today
                 FROM payments"
            );

            json_response([
                'success' => true,
                'frontdesk' => [
                    'recentBookings' => $recentBookings,
                ],
                'housekeeping' => [
                    'serviceRequests' => $serviceRequests,
                    'ratings' => $ratings,
                ],
                'billing' => [
                    'recentInvoices' => $recentInvoices,
                    'recentPayments' => $recentPayments,
                    'totalCollected' => !empty($financialSummary) ? (float)$financialSummary[0]['total_collected'] : 0.0,
                    'collectedToday' => !empty($financialSummary) ? (float)$financialSummary[0]['collected_today'] : 0.0,
                ]
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /users
    if ($method === 'GET' && $path === '/users') {
        try {
            $users = query(
                "SELECT u.user_id AS id, u.full_name AS name, u.email, u.username,
                        r.role_name AS role, r.role_code, u.is_active AS active, u.is_on_duty,
                        DATE_FORMAT(u.last_login_at, '%Y-%m-%d %H:%i') AS last_login,
                        DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at
                 FROM users u
                 JOIN roles r ON u.role_id = r.role_id
                 ORDER BY u.user_id ASC"
            );
            foreach ($users as &$u) {
                $u['id'] = (int)$u['id'];
                $u['active'] = (bool)$u['active'];
                $u['is_on_duty'] = (bool)$u['is_on_duty'];
            }
            json_response(['success' => true, 'users' => $users]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /users
    if ($method === 'POST' && $path === '/users') {
        try {
            $name = trim((string)($body['name'] ?? ''));
            $email = trim((string)($body['email'] ?? ''));
            $role = trim((string)($body['role'] ?? 'Front Desk'));
            $password = trim((string)($body['password'] ?? 'password123'));

            if ($name === '' || $email === '') {
                json_response(['error' => 'Name and email are required.'], 400);
            }

            $roles = query(
                "SELECT role_id, role_name FROM roles WHERE LOWER(role_name) = LOWER(?) OR LOWER(role_code) = LOWER(?) LIMIT 1",
                [$role, $role]
            );
            if (empty($roles)) {
                json_response(['error' => sprintf("Invalid role '%s'.", $role)], 400);
            }

            $roleId = $roles[0]['role_id'];
            $baseUser = explode('@', $email)[0];
            $username = strtolower($baseUser) ?: ('user_' . time());
            $pwHash = password_hash($password, PASSWORD_BCRYPT);

            $res = query(
                "INSERT INTO users (role_id, username, email, full_name, password_hash, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)",
                [$roleId, $username, $email, $name, $pwHash]
            );

            $newId = $res['insertId'];
            log_activity(
                $authUser['user_id'],
                "Created Staff Account",
                "users",
                $newId,
                sprintf("Created staff account for %s (%s).", $name, $roles[0]['role_name'])
            );

            json_response([
                'success' => true,
                'user' => [
                    'id' => $newId,
                    'name' => $name,
                    'email' => $email,
                    'username' => $username,
                    'role' => $roles[0]['role_name'],
                    'active' => true,
                ]
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /users/{id}
    if ($method === 'PUT' && preg_match('#^/users/(\d+)$#', $path, $matches)) {
        $userId = (int)$matches[1];
        try {
            $existing = query("SELECT * FROM users WHERE user_id = ?", [$userId]);
            if (empty($existing)) {
                json_response(['error' => 'User not found.'], 404);
            }

            $name = $body['name'] ?? null;
            $email = $body['email'] ?? null;
            $role = $body['role'] ?? null;
            $password = $body['password'] ?? null;
            $active = isset($body['active']) ? (bool)$body['active'] : null;

            $roleId = $existing[0]['role_id'];
            if ($role) {
                $roles = query("SELECT role_id FROM roles WHERE LOWER(role_name) = LOWER(?) OR LOWER(role_code) = LOWER(?) LIMIT 1", [$role, $role]);
                if (!empty($roles)) {
                    $roleId = $roles[0]['role_id'];
                }
            }

            $fields = [];
            $params = [];
            if ($name !== null) {
                $fields[] = "full_name = ?";
                $params[] = $name;
            }
            if ($email !== null) {
                $fields[] = "email = ?";
                $params[] = $email;
            }
            if ($role !== null) {
                $fields[] = "role_id = ?";
                $params[] = $roleId;
            }
            if ($active !== null) {
                $fields[] = "is_active = ?";
                $params[] = $active ? 1 : 0;
            }
            if (!empty($password)) {
                $fields[] = "password_hash = ?";
                $params[] = password_hash($password, PASSWORD_BCRYPT);
            }

            if (!empty($fields)) {
                $params[] = $userId;
                query("UPDATE users SET " . implode(', ', $fields) . " WHERE user_id = ?", $params);
            }

            log_activity(
                $authUser['user_id'],
                "Updated Staff Account",
                "users",
                $userId,
                sprintf("Updated profile for staff ID %d (%s).", $userId, $name ?: $existing[0]['full_name'])
            );

            json_response(['success' => true, 'message' => 'User updated successfully']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PATCH /users/{id}/toggle
    if ($method === 'PATCH' && preg_match('#^/users/(\d+)/toggle$#', $path, $matches)) {
        $userId = (int)$matches[1];
        try {
            $users = query("SELECT user_id, full_name, is_active FROM users WHERE user_id = ?", [$userId]);
            if (empty($users)) {
                json_response(['error' => 'User not found.'], 404);
            }

            $newStatus = empty($users[0]['is_active']) ? 1 : 0;
            query("UPDATE users SET is_active = ? WHERE user_id = ?", [$newStatus, $userId]);

            log_activity(
                $authUser['user_id'],
                $newStatus ? "Reactivated Staff Account" : "Deactivated Staff Account",
                "users",
                $userId,
                sprintf("%s staff account %s.", $newStatus ? 'Reactivated' : 'Deactivated', $users[0]['full_name'])
            );

            json_response(['success' => true, 'active' => (bool)$newStatus]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /rooms
    if ($method === 'GET' && $path === '/rooms') {
        try {
            $rooms = query(
                "SELECT r.room_id AS id, r.room_number AS no, r.floor_no AS floor,
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
                 ORDER BY r.floor_no ASC, r.room_number ASC"
            );
            foreach ($rooms as &$rm) {
                $rm['id'] = (int)$rm['id'];
                $rm['floor'] = (int)$rm['floor'];
                $rm['rate'] = (float)$rm['rate'];
            }
            json_response(['success' => true, 'rooms' => $rooms]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /rooms
    if ($method === 'POST' && $path === '/rooms') {
        try {
            $no = trim((string)($body['no'] ?? ''));
            $roomType = $body['type'] ?? 'Single';
            $floor = (int)($body['floor'] ?? 1);
            $rate = isset($body['rate']) ? (float)$body['rate'] : null;

            if ($no === '') {
                json_response(['error' => 'Room number is required.'], 400);
            }

            $types = query("SELECT room_type_id, base_rate FROM room_types WHERE type_name = ? LIMIT 1", [$roomType]);
            $roomTypeId = !empty($types) ? $types[0]['room_type_id'] : 1;
            $finalRate = $rate !== null ? $rate : (!empty($types) ? (float)$types[0]['base_rate'] : 2500.0);

            $res = query(
                "INSERT INTO rooms (room_number, floor_no, room_type_id, current_rate, status, is_sellable)
                 VALUES (?, ?, ?, ?, 'vacant_ready', 1)",
                [$no, $floor, $roomTypeId, $finalRate]
            );

            log_activity(
                $authUser['user_id'],
                "Added Room",
                "rooms",
                $res['insertId'],
                sprintf("Added room %s (%s, Rs %.2f).", $no, $roomType, $finalRate)
            );

            json_response(['success' => true, 'id' => $res['insertId']]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /rooms/{room_no}
    if ($method === 'PUT' && preg_match('#^/rooms/([^/]+)$#', $path, $matches)) {
        $roomNo = urldecode($matches[1]);
        try {
            $existing = query("SELECT room_id, current_rate, status FROM rooms WHERE room_number = ?", [$roomNo]);
            if (empty($existing)) {
                json_response(['error' => 'Room not found.'], 404);
            }

            $roomType = $body['type'] ?? null;
            $floor = isset($body['floor']) ? (int)$body['floor'] : null;
            $rate = isset($body['rate']) ? (float)$body['rate'] : null;
            $status = $body['status'] ?? null;

            $fields = [];
            $params = [];

            if ($roomType) {
                $types = query("SELECT room_type_id FROM room_types WHERE type_name = ?", [$roomType]);
                if (!empty($types)) {
                    $fields[] = "room_type_id = ?";
                    $params[] = $types[0]['room_type_id'];
                }
            }
            if ($floor !== null) {
                $fields[] = "floor_no = ?";
                $params[] = $floor;
            }
            if ($rate !== null) {
                $fields[] = "current_rate = ?";
                $params[] = $rate;
            }
            if ($status) {
                $dbStatus = 'vacant_ready';
                if ($status === 'Occupied') $dbStatus = 'occupied';
                elseif ($status === 'Dirty') $dbStatus = 'vacant_dirty';
                elseif ($status === 'Reserved') $dbStatus = 'reserved';
                $fields[] = "status = ?";
                $params[] = $dbStatus;
            }

            if (!empty($fields)) {
                $params[] = $roomNo;
                query("UPDATE rooms SET " . implode(', ', $fields) . " WHERE room_number = ?", $params);
            }

            json_response(['success' => true, 'message' => 'Room updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /records
    if ($method === 'GET' && $path === '/records') {
        try {
            $bookings = query(
                "SELECT b.booking_id, b.booking_code AS id, g.full_name AS guest,
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
                 ORDER BY b.check_in_date DESC"
            );
            foreach ($bookings as &$b) {
                $b['amount'] = (float)$b['amount'];
                $b['nights'] = (int)$b['nights'];
            }
            json_response(['success' => true, 'bookings' => $bookings]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /pricing
    if ($method === 'GET' && $path === '/pricing') {
        try {
            $types = query("SELECT type_name, base_rate FROM room_types");
            $taxes = query("SELECT tax_id, tax_name, rate_percent FROM tax_rules WHERE is_active = 1");

            $rates = [];
            foreach ($types as $t) {
                $rates[$t['type_name']] = (float)$t['base_rate'];
            }
            $gst = 12.0;
            $service = 0.0;
            foreach ($taxes as $tx) {
                if (stripos($tx['tax_name'], 'GST') !== false) {
                    $gst = (float)$tx['rate_percent'];
                } elseif (stripos($tx['tax_name'], 'SERVICE') !== false) {
                    $service = (float)$tx['rate_percent'];
                }
            }

            json_response([
                'success' => true,
                'rates' => $rates,
                'tax' => ['gst' => $gst, 'service' => $service]
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /pricing
    if ($method === 'PUT' && $path === '/pricing') {
        try {
            $rates = $body['rates'] ?? [];
            $gst = isset($body['gst']) ? (float)$body['gst'] : null;
            $service = isset($body['service']) ? (float)$body['service'] : null;

            if (is_array($rates)) {
                foreach ($rates as $roomType => $rate) {
                    query("UPDATE room_types SET base_rate = ? WHERE type_name = ?", [(float)$rate, $roomType]);
                }
            }
            if ($gst !== null) {
                query("UPDATE tax_rules SET rate_percent = ? WHERE tax_name LIKE '%GST%'", [$gst]);
            }
            if ($service !== null) {
                query("UPDATE tax_rules SET rate_percent = ? WHERE tax_name LIKE '%Service%'", [$service]);
            }

            log_activity(
                $authUser['user_id'],
                "Updated Pricing & Tax",
                "tax_rules",
                null,
                sprintf("Updated pricing: GST %.1f%%, service %.1f%%.", $gst ?? 12.0, $service ?? 0.0)
            );

            json_response(['success' => true, 'message' => 'Pricing and tax updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /activity or /activities
    if ($method === 'GET' && ($path === '/activity' || $path === '/activities')) {
        try {
            $staff = $query_params['staff'] ?? null;
            $dateFrom = $query_params['from'] ?? null;
            $dateTo = $query_params['to'] ?? null;

            $sql = "SELECT a.activity_id AS id, a.action, a.entity_type, a.entity_id, a.description,
                           DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS at,
                           COALESCE(u.full_name, 'System') AS staff,
                           COALESCE(r.role_name, 'System') AS role
                    FROM activity_log a
                    LEFT JOIN users u ON a.user_id = u.user_id
                    LEFT JOIN roles r ON u.role_id = r.role_id
                    WHERE 1 = 1";
            $params = [];
            if ($staff && $staff !== 'All') {
                $sql .= " AND u.full_name = ?";
                $params[] = $staff;
            }
            if ($dateFrom) {
                $sql .= " AND a.created_at >= ?";
                $params[] = $dateFrom . " 00:00:00";
            }
            if ($dateTo) {
                $sql .= " AND a.created_at <= ?";
                $params[] = $dateTo . " 23:59:59";
            }

            $sql .= " ORDER BY a.created_at DESC LIMIT 100";
            $logs = query($sql, $params);
            json_response(['success' => true, 'log' => $logs]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /leaves or /leave-requests
    if ($method === 'GET' && ($path === '/leaves' || $path === '/leave-requests')) {
        try {
            $leaves = query(
                "SELECT lr.leave_id, lr.user_id, u.full_name AS staff_name, r.role_name AS role,
                        lr.leave_type,
                        DATE_FORMAT(lr.start_date, '%Y-%m-%d') AS start_date,
                        DATE_FORMAT(lr.end_date, '%Y-%m-%d') AS end_date,
                        lr.reason, lr.status, lr.reviewed_by
                 FROM leave_requests lr
                 JOIN users u ON lr.user_id = u.user_id
                 JOIN roles r ON u.role_id = r.role_id
                 ORDER BY lr.leave_id DESC"
            );
            foreach ($leaves as &$l) {
                $l['leave_id'] = (int)$l['leave_id'];
                $l['user_id'] = (int)$l['user_id'];
            }
            json_response(['success' => true, 'leaves' => $leaves]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /leaves/{id}
    if ($method === 'PUT' && preg_match('#^/leaves/(\d+)$#', $path, $matches)) {
        $leaveId = (int)$matches[1];
        try {
            $status = strtolower($body['status'] ?? 'approved'); // approved | rejected
            $leaves = query("SELECT user_id, leave_type FROM leave_requests WHERE leave_id = ?", [$leaveId]);
            if (empty($leaves)) {
                json_response(['error' => 'Leave request not found.'], 404);
            }

            $userId = $leaves[0]['user_id'];
            $leaveType = $leaves[0]['leave_type'];

            query("UPDATE leave_requests SET status = ?, reviewed_by = ? WHERE leave_id = ?", [$status, $authUser['user_id'], $leaveId]);

            create_notification(
                $userId,
                sprintf("Leave Request %s", ucfirst($status)),
                sprintf("Your request for %s has been %s by Administrator.", $leaveType, $status)
            );

            log_activity(
                $authUser['user_id'],
                sprintf("Leave Request %s", ucfirst($status)),
                "leave_requests",
                $leaveId,
                sprintf("Admin %s leave request #%d.", $status, $leaveId)
            );

            json_response(['success' => true, 'status' => $status]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /announcements
    if ($method === 'POST' && $path === '/announcements') {
        try {
            $title = $body['title'] ?? 'Hotel Announcement';
            $message = trim((string)($body['message'] ?? ''));

            if ($message === '') {
                json_response(['error' => 'Announcement message is required.'], 400);
            }

            create_notification(null, $title, $message);

            log_activity(
                $authUser['user_id'],
                "Sent Announcement",
                "notifications",
                null,
                sprintf("Admin broadcasted announcement: %s", $title)
            );

            json_response(['success' => true, 'message' => 'Announcement sent to staff.']);
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
                 ORDER BY notification_id DESC
                 LIMIT 50"
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

    json_response(['error' => 'Endpoint not found'], 404);
}
