<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_middleware.php';

function handle_housekeeping_routes($method, $path, $body, $query_params) {
    $authUser = authenticate();
    authorize('housekeeping', 'admin', 'administrator');

    // GET /overview
    if ($method === 'GET' && $path === '/overview') {
        try {
            $tasks = query(
                "SELECT COUNT(*) AS total,
                        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
                        SUM(CASE WHEN status = 'completed' AND DATE(completed_at) = CURDATE() THEN 1 ELSE 0 END) AS completed_today
                 FROM housekeeping_tasks"
            );
            $dirtyRooms = query("SELECT COUNT(*) AS c FROM rooms WHERE status IN ('vacant_dirty', 'being_cleaned')");
            $maintOpen = query("SELECT COUNT(*) AS c FROM maintenance_requests WHERE status IN ('open', 'in_progress')");
            $complaintsPending = query("SELECT COUNT(*) AS c FROM complaints WHERE status IN ('pending', 'investigating')");
            $arrivalsToday = query("SELECT COUNT(*) AS c FROM bookings WHERE check_in_date = CURDATE()");
            $checkoutsToday = query("SELECT COUNT(*) AS c FROM bookings WHERE check_out_date = CURDATE()");
            $userRow = query("SELECT is_on_duty FROM users WHERE user_id = ?", [$authUser['user_id']]);

            json_response([
                'success' => true,
                'stats' => [
                    'totalTasks' => !empty($tasks) ? (int)$tasks[0]['total'] : 0,
                    'pendingTasks' => !empty($tasks) ? (int)$tasks[0]['pending'] : 0,
                    'inProgressTasks' => !empty($tasks) ? (int)$tasks[0]['in_progress'] : 0,
                    'completedToday' => !empty($tasks) ? (int)$tasks[0]['completed_today'] : 0,
                    'dirtyRooms' => !empty($dirtyRooms) ? (int)$dirtyRooms[0]['c'] : 0,
                    'maintenanceOpen' => !empty($maintOpen) ? (int)$maintOpen[0]['c'] : 0,
                    'complaintsPending' => !empty($complaintsPending) ? (int)$complaintsPending[0]['c'] : 0,
                    'arrivalsToday' => !empty($arrivalsToday) ? (int)$arrivalsToday[0]['c'] : 0,
                    'checkoutsToday' => !empty($checkoutsToday) ? (int)$checkoutsToday[0]['c'] : 0,
                    'isOnDuty' => !empty($userRow) ? (bool)$userRow[0]['is_on_duty'] : false,
                ]
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /tasks
    if ($method === 'GET' && $path === '/tasks') {
        try {
            $tasks = query(
                "SELECT ht.task_id AS id, ht.room_id, r.room_number, r.floor_no,
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
                 ORDER BY FIELD(ht.priority, 'high', 'normal', 'low'), ht.task_id DESC"
            );
            foreach ($tasks as &$t) {
                $t['id'] = (int)$t['id'];
                $t['room_id'] = (int)$t['room_id'];
                $t['floor_no'] = (int)$t['floor_no'];
                $t['est_minutes'] = (int)$t['est_minutes'];
            }
            json_response(['success' => true, 'tasks' => $tasks]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /ratings
    if ($method === 'GET' && $path === '/ratings') {
        try {
            $ratings = query(
                "SELECT rating_id AS id, housekeeper_name AS staff, room_number AS room,
                        service_type AS type, rating, comment, tags,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
                        DATE_FORMAT(created_at, '%H:%i') AS time
                 FROM housekeeper_ratings
                 ORDER BY rating_id DESC LIMIT 50"
            );
            foreach ($ratings as &$r) {
                $r['id'] = (int)$r['id'];
                $r['rating'] = (int)$r['rating'];
                $r['room'] = is_numeric($r['room']) ? (int)$r['room'] : $r['room'];
                $r['tags'] = !empty($r['tags']) ? array_map('trim', explode(',', $r['tags'])) : ['Clean & Tidy'];
            }
            json_response(['success' => true, 'ratings' => $ratings]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST/PUT /tasks/{id}/start
    if (($method === 'POST' || $method === 'PUT') && preg_match('#^/tasks/(\d+)/start$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            db_begin();
            // 1. Check if $id is an existing task_id
            $task = query(
                "SELECT ht.task_id, ht.room_id, r.room_number
                 FROM housekeeping_tasks ht
                 JOIN rooms r ON ht.room_id = r.room_id
                 WHERE ht.task_id = ?
                 LIMIT 1",
                [$id]
            );

            // 2. If not found by task_id, look for task for this room
            if (empty($task)) {
                $task = query(
                    "SELECT ht.task_id, ht.room_id, r.room_number
                     FROM housekeeping_tasks ht
                     JOIN rooms r ON ht.room_id = r.room_id
                     WHERE r.room_number = ? OR ht.room_id = ?
                     ORDER BY (CASE WHEN ht.status = 'in_progress' THEN 1 WHEN ht.status = 'pending' THEN 2 ELSE 3 END), ht.task_id DESC
                     LIMIT 1",
                    [(string)$id, $id]
                );
            }

            if (!empty($task)) {
                $taskId = $task[0]['task_id'];
                $roomId = $task[0]['room_id'];
                $roomNo = $task[0]['room_number'];
                query(
                    "UPDATE housekeeping_tasks
                     SET status = 'in_progress', started_at = NOW(), assigned_to = COALESCE(assigned_to, ?)
                     WHERE task_id = ?",
                    [$authUser['user_id'], $taskId]
                );
                query("UPDATE rooms SET status = 'being_cleaned' WHERE room_id = ?", [$roomId]);
            } else {
                $rm = query("SELECT room_id, room_number FROM rooms WHERE room_number = ? OR room_id = ? LIMIT 1", [(string)$id, $id]);
                if (empty($rm)) {
                    db_rollback();
                    json_response(['error' => 'Room or task not found.'], 404);
                }
                $roomId = $rm[0]['room_id'];
                $roomNo = $rm[0]['room_number'];
                $res = query(
                    "INSERT INTO housekeeping_tasks (room_id, task_type, est_minutes, priority, status, assigned_to, started_at, created_at)
                     VALUES (?, 'Room Cleaning', 30, 'normal', 'in_progress', ?, NOW(), NOW())",
                    [$roomId, $authUser['user_id']]
                );
                $taskId = $res['insertId'];
                query("UPDATE rooms SET status = 'being_cleaned' WHERE room_id = ?", [$roomId]);
            }

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Started Cleaning Task",
                "housekeeping_tasks",
                $taskId,
                sprintf("Housekeeping started cleaning task for Room %s.", $roomNo)
            );

            json_response(['success' => true, 'message' => 'Task marked as in progress.']);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST/PUT /tasks/{id}/complete
    if (($method === 'POST' || $method === 'PUT') && preg_match('#^/tasks/(\d+)/complete$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            db_begin();
            // 1. Check if $id is an existing task_id
            $task = query(
                "SELECT ht.task_id, ht.room_id, r.room_number
                 FROM housekeeping_tasks ht
                 JOIN rooms r ON ht.room_id = r.room_id
                 WHERE ht.task_id = ?
                 LIMIT 1",
                [$id]
            );

            // 2. If not found by task_id, look for task for this room
            if (empty($task)) {
                $task = query(
                    "SELECT ht.task_id, ht.room_id, r.room_number
                     FROM housekeeping_tasks ht
                     JOIN rooms r ON ht.room_id = r.room_id
                     WHERE r.room_number = ? OR ht.room_id = ?
                     ORDER BY (CASE WHEN ht.status = 'in_progress' THEN 1 WHEN ht.status = 'pending' THEN 2 ELSE 3 END), ht.task_id DESC
                     LIMIT 1",
                    [(string)$id, $id]
                );
            }

            if (!empty($task)) {
                $taskId = $task[0]['task_id'];
                $roomId = $task[0]['room_id'];
                $roomNumber = $task[0]['room_number'];
                query(
                    "UPDATE housekeeping_tasks
                     SET status = 'completed', completed_at = NOW()
                     WHERE task_id = ?",
                    [$taskId]
                );
                query("UPDATE rooms SET status = 'vacant_ready' WHERE room_id = ?", [$roomId]);
            } else {
                $rm = query("SELECT room_id, room_number FROM rooms WHERE room_id = ? OR room_number = ? LIMIT 1", [$id, (string)$id]);
                if (empty($rm)) {
                    db_rollback();
                    json_response(['error' => 'Room or task not found.'], 404);
                }
                $roomId = $rm[0]['room_id'];
                $roomNumber = $rm[0]['room_number'];
                $res = query(
                    "INSERT INTO housekeeping_tasks (room_id, task_type, est_minutes, priority, status, assigned_to, completed_at, created_at)
                     VALUES (?, 'Room Cleaning', 30, 'normal', 'completed', ?, NOW(), NOW())",
                    [$roomId, $authUser['user_id']]
                );
                $taskId = $res['insertId'];
                query("UPDATE rooms SET status = 'vacant_ready' WHERE room_id = ?", [$roomId]);
            }

            query(
                "INSERT INTO notifications (title, message, is_read, created_at)
                 VALUES (?, ?, 0, NOW())",
                [
                    "Housekeeping Task Completed",
                    sprintf("Anita Joseph completed room cleaning for Room %s. Please rate housekeeper.", $roomNumber)
                ]
            );

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Completed Cleaning Task",
                "housekeeping_tasks",
                $taskId,
                sprintf("Housekeeping completed cleaning for Room %s. Marked room vacant_ready.", $roomNumber)
            );

            json_response(['success' => true, 'message' => 'Task completed. Room is now clean and ready.']);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /rooms
    if ($method === 'GET' && $path === '/rooms') {
        try {
            $rooms = query(
                "SELECT r.room_id AS id, r.room_number AS no, r.floor_no AS floor,
                        t.type_name AS type, r.status,
                        CASE
                          WHEN r.status = 'vacant_ready' THEN 'Ready'
                          WHEN r.status = 'vacant_dirty' THEN 'Dirty'
                          WHEN r.status = 'being_cleaned' THEN 'Cleaning'
                          WHEN r.status = 'occupied' THEN 'Occupied'
                          WHEN r.status = 'reserved' THEN 'Reserved'
                          WHEN r.status = 'out_of_service' THEN 'Maintenance'
                          ELSE 'Ready'
                        END AS display_status,
                        (SELECT COUNT(*) FROM booking_rooms br WHERE br.room_id = r.room_id AND (br.status = 'departed' OR br.actual_check_out IS NOT NULL)) AS checkout_count,
                        (SELECT COUNT(*) FROM housekeeping_tasks ht WHERE ht.room_id = r.room_id) AS task_count,
                        (SELECT COUNT(*) FROM service_requests sr WHERE sr.room_id = r.room_id) AS service_request_count
                 FROM rooms r
                 JOIN room_types t ON r.room_type_id = t.room_type_id
                 ORDER BY r.floor_no ASC, r.room_number ASC"
            );
            foreach ($rooms as &$rm) {
                $rm['id'] = (int)$rm['id'];
                $rm['floor'] = (int)$rm['floor'];
                $rm['checkout_count'] = (int)$rm['checkout_count'];
                $rm['task_count'] = (int)$rm['task_count'];
                $rm['service_request_count'] = (int)$rm['service_request_count'];
            }
            json_response(['success' => true, 'rooms' => $rooms]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /maintenance
    if ($method === 'POST' && $path === '/maintenance') {
        try {
            $roomNumber = $body['room_number'] ?? null;
            $issue = $body['issue'] ?? null;

            if (!$roomNumber || !$issue) {
                json_response(['error' => 'Room number and issue description are required.'], 400);
            }

            db_begin();
            $room = query("SELECT room_id FROM rooms WHERE room_number = ? LIMIT 1", [$roomNumber]);
            if (empty($room)) {
                db_rollback();
                json_response(['error' => sprintf("Room %s not found.", $roomNumber)], 404);
            }

            $roomId = $room[0]['room_id'];
            $res = query(
                "INSERT INTO maintenance_requests (room_id, issue, status, reported_by, reported_at)
                 VALUES (?, ?, 'open', ?, NOW())",
                [$roomId, $issue, $authUser['user_id']]
            );
            $mId = $res['insertId'];
            query("UPDATE rooms SET status = 'out_of_service' WHERE room_id = ?", [$roomId]);

            query(
                "INSERT INTO notifications (title, message, is_read, created_at)
                 VALUES (?, ?, 0, NOW())",
                [
                    "Maintenance Issue Reported",
                    sprintf("Room %s: %s (Reported by Housekeeping)", $roomNumber, $issue)
                ]
            );

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Reported Maintenance",
                "maintenance_requests",
                $mId,
                sprintf("Reported maintenance issue for Room %s. Marked room out_of_service.", $roomNumber)
            );

            json_response(['success' => true, 'id' => $mId, 'message' => 'Maintenance requested and room set to out of service.']);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /service-requests
    if ($method === 'GET' && $path === '/service-requests') {
        try {
            $requests = query(
                "SELECT sr.request_id AS id, COALESCE(r.room_number, '101') AS room_number, sr.category, sr.description,
                        sr.status, sr.assigned_to,
                        DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i') AS created_at,
                        DATE_FORMAT(sr.completed_at, '%Y-%m-%d %H:%i') AS completed_at
                 FROM service_requests sr
                 LEFT JOIN rooms r ON sr.room_id = r.room_id
                 ORDER BY sr.created_at DESC"
            );
            foreach ($requests as &$sr) {
                $sr['id'] = (int)$sr['id'];
            }
            json_response(['success' => true, 'requests' => $requests]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /service-requests/{id}
    if ($method === 'PUT' && preg_match('#^/service-requests/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $status = $body['status'] ?? null;
            if (!$status) {
                json_response(['error' => 'Status is required.'], 400);
            }
            query(
                "UPDATE service_requests
                 SET status = ?,
                     assigned_to = COALESCE(assigned_to, ?),
                     completed_at = CASE WHEN ? = 'completed' THEN NOW() ELSE completed_at END
                 WHERE request_id = ?",
                [$status, $authUser['user_id'] ?? null, $status, $id]
            );

            if ($status === 'completed') {
                $srRows = query(
                    "SELECT sr.request_id, r.room_number, sr.category
                     FROM service_requests sr
                     LEFT JOIN rooms r ON sr.room_id = r.room_id
                     WHERE sr.request_id = ?",
                    [$id]
                );
                $roomNum = !empty($srRows) && !empty($srRows[0]['room_number']) ? $srRows[0]['room_number'] : '-';
                $cat = !empty($srRows) && !empty($srRows[0]['category']) ? $srRows[0]['category'] : 'Service Request';

                create_notification(
                    null,
                    "Housekeeping Task Completed",
                    sprintf("Anita Joseph completed %s for Room %s. Please rate housekeeper.", $cat, $roomNum)
                );
            }

            log_activity(
                $authUser['user_id'] ?? 1,
                "Updated Service Request",
                "service_requests",
                $id,
                sprintf("Housekeeping marked service request #%d as %s.", $id, $status)
            );

            json_response(['success' => true, 'message' => 'Status updated.', 'status' => $status]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /supplies/restock
    if ($method === 'POST' && $path === '/supplies/restock') {
        try {
            $items = $body['items'] ?? 'Requested items';
            create_notification(
                null,
                "Supplies Restocked",
                sprintf("Supplies Restocked: %s have been delivered & restocked.", $items)
            );
            json_response(['success' => true, 'message' => 'Restock notification created.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /complaints
    if ($method === 'GET' && $path === '/complaints') {
        try {
            $complaints = query(
                "SELECT c.complaint_id AS id, COALESCE(r.room_number, 'General') AS room_number,
                        c.subject, c.description, c.status,
                        DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS created_at,
                        DATE_FORMAT(c.resolved_at, '%Y-%m-%d %H:%i') AS resolved_at,
                        g.full_name AS guest_name
                 FROM complaints c
                 LEFT JOIN rooms r ON c.room_id = r.room_id
                 LEFT JOIN guests g ON c.guest_id = g.guest_id
                 ORDER BY c.created_at DESC"
            );
            foreach ($complaints as &$c) {
                $c['id'] = (int)$c['id'];
            }
            json_response(['success' => true, 'complaints' => $complaints]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /complaints
    if ($method === 'POST' && $path === '/complaints') {
        try {
            $roomNumber = $body['room_number'] ?? null;
            $subject = $body['subject'] ?? null;
            $description = $body['description'] ?? '';

            if (!$subject) {
                json_response(['error' => 'Subject is required.'], 400);
            }

            $roomId = null;
            if ($roomNumber) {
                $rooms = query("SELECT room_id FROM rooms WHERE room_number = ? LIMIT 1", [$roomNumber]);
                if (!empty($rooms)) {
                    $roomId = $rooms[0]['room_id'];
                }
            }

            $res = query(
                "INSERT INTO complaints (room_id, subject, description, status, assigned_to, created_at)
                 VALUES (?, ?, ?, 'pending', ?, NOW())",
                [$roomId, $subject, $description, $authUser['user_id']]
            );

            create_notification(
                null,
                "New Guest Complaint Registered",
                sprintf("%s (Room %s)", $subject, $roomNumber ?: 'General')
            );

            json_response(['success' => true, 'id' => $res['insertId']]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /complaints/{id}
    if ($method === 'PUT' && preg_match('#^/complaints/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $status = $body['status'] ?? null;
            query(
                "UPDATE complaints
                 SET status = ?, resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END
                 WHERE complaint_id = ?",
                [$status, $status, $id]
            );
            json_response(['success' => true, 'message' => 'Complaint status updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /supplies
    if ($method === 'GET' && $path === '/supplies') {
        try {
            $supplies = query(
                "SELECT supply_id AS id, item_name AS name, unit,
                        quantity_in_stock AS qty, reorder_level AS min_qty
                 FROM supplies
                 ORDER BY item_name ASC"
            );
            foreach ($supplies as &$s) {
                $s['id'] = (int)$s['id'];
                $s['qty'] = (int)$s['qty'];
                $s['min_qty'] = (int)$s['min_qty'];
            }
            json_response(['success' => true, 'supplies' => $supplies]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /supplies
    if ($method === 'POST' && $path === '/supplies') {
        try {
            $name = trim((string)($body['name'] ?? ''));
            $unit = $body['unit'] ?? 'pcs';
            $qty = (int)($body['qty'] ?? 0);
            $minQty = (int)($body['min_qty'] ?? 10);

            if ($name === '') {
                json_response(['error' => 'Item name is required.'], 400);
            }

            $res = query(
                "INSERT INTO supplies (item_name, unit, quantity_in_stock, reorder_level)
                 VALUES (?, ?, ?, ?)",
                [$name, $unit, $qty, $minQty]
            );

            json_response(['success' => true, 'id' => $res['insertId']]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /supplies/{id}
    if ($method === 'PUT' && preg_match('#^/supplies/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $name = $body['name'] ?? null;
            $unit = $body['unit'] ?? null;
            $qty = isset($body['qty']) ? (int)$body['qty'] : null;
            $minQty = isset($body['min_qty']) ? (int)$body['min_qty'] : null;

            $fields = [];
            $params = [];
            if ($name !== null) {
                $fields[] = "item_name = ?";
                $params[] = $name;
            }
            if ($unit !== null) {
                $fields[] = "unit = ?";
                $params[] = $unit;
            }
            if ($qty !== null) {
                $fields[] = "quantity_in_stock = ?";
                $params[] = $qty;
            }
            if ($minQty !== null) {
                $fields[] = "reorder_level = ?";
                $params[] = $minQty;
            }

            if (!empty($fields)) {
                $params[] = $id;
                query("UPDATE supplies SET " . implode(', ', $fields) . " WHERE supply_id = ?", $params);
            }

            json_response(['success' => true, 'message' => 'Supply item updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // DELETE /supplies/{id}
    if ($method === 'DELETE' && preg_match('#^/supplies/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query("DELETE FROM supplies WHERE supply_id = ?", [$id]);
            json_response(['success' => true, 'message' => 'Item deleted.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /attendance
    if ($method === 'GET' && $path === '/attendance') {
        try {
            $today = date('Y-m-d');
            $records = query(
                "SELECT attendance_id AS id, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
                        DATE_FORMAT(clock_in, '%H:%i') AS in_time,
                        DATE_FORMAT(clock_out, '%H:%i') AS out_time
                 FROM attendance
                 WHERE user_id = ?
                 ORDER BY work_date DESC
                 LIMIT 14",
                [$authUser['user_id']]
            );

            $todayRecord = null;
            foreach ($records as $r) {
                if ($r['work_date'] === $today) {
                    $todayRecord = $r;
                    break;
                }
            }
            $clockedIn = (bool)($todayRecord && !empty($todayRecord['in_time']) && empty($todayRecord['out_time']));

            json_response([
                'success' => true,
                'records' => $records,
                'clockedIn' => $clockedIn,
                'todayRecord' => $todayRecord,
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /attendance/clock
    if ($method === 'POST' && $path === '/attendance/clock') {
        try {
            $today = date('Y-m-d');
            $existing = query(
                "SELECT attendance_id, clock_in, clock_out FROM attendance WHERE user_id = ? AND work_date = ? LIMIT 1",
                [$authUser['user_id'], $today]
            );

            if (empty($existing)) {
                query(
                    "INSERT INTO attendance (user_id, work_date, clock_in) VALUES (?, ?, NOW())",
                    [$authUser['user_id'], $today]
                );
                query("UPDATE users SET is_on_duty = 1 WHERE user_id = ?", [$authUser['user_id']]);
                json_response(['success' => true, 'action' => 'clocked_in', 'message' => 'Clocked in successfully.']);
            } elseif (!empty($existing[0]['clock_in']) && empty($existing[0]['clock_out'])) {
                query("UPDATE attendance SET clock_out = NOW() WHERE attendance_id = ?", [$existing[0]['attendance_id']]);
                query("UPDATE users SET is_on_duty = 0 WHERE user_id = ?", [$authUser['user_id']]);
                json_response(['success' => true, 'action' => 'clocked_out', 'message' => 'Clocked out successfully.']);
            } else {
                json_response(['success' => true, 'message' => 'Already completed shift for today.']);
            }
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /leave
    if ($method === 'GET' && $path === '/leave') {
        try {
            $requests = query(
                "SELECT leave_id AS id, leave_type,
                        DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
                        DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
                        reason, status
                 FROM leave_requests
                 WHERE user_id = ?
                 ORDER BY leave_id DESC",
                [$authUser['user_id']]
            );
            foreach ($requests as &$l) {
                $l['id'] = (int)$l['id'];
            }
            json_response(['success' => true, 'requests' => $requests]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /leave
    if ($method === 'POST' && $path === '/leave') {
        try {
            $leaveType = $body['leave_type'] ?? 'Casual Leave';
            $startDate = $body['start_date'] ?? null;
            $endDate = $body['end_date'] ?? null;
            $reason = $body['reason'] ?? '';

            if (!$startDate || !$endDate) {
                json_response(['error' => 'Start and end dates are required.'], 400);
            }

            $res = query(
                "INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')",
                [$authUser['user_id'], $leaveType, $startDate, $endDate, $reason]
            );

            create_notification(
                null,
                "New Leave Request Submitted",
                sprintf("%s applied for %s (%s to %s).", $authUser['full_name'] ?? 'Staff', $leaveType, $startDate, $endDate)
            );

            json_response(['success' => true, 'id' => $res['insertId'], 'message' => 'Leave request submitted.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // DELETE /leave/{id}
    if ($method === 'DELETE' && preg_match('#^/leave/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query("DELETE FROM leave_requests WHERE leave_id = ? AND user_id = ? AND status = 'pending'", [$id, $authUser['user_id']]);
            json_response(['success' => true, 'message' => 'Leave request cancelled.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PATCH /duty
    if ($method === 'PATCH' && $path === '/duty') {
        try {
            $user = query("SELECT is_on_duty FROM users WHERE user_id = ?", [$authUser['user_id']]);
            $nextDuty = (!empty($user) && !empty($user[0]['is_on_duty'])) ? 0 : 1;
            query("UPDATE users SET is_on_duty = ? WHERE user_id = ?", [$nextDuty, $authUser['user_id']]);
            json_response(['success' => true, 'is_on_duty' => (bool)$nextDuty]);
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
            $isRead = isset($body['is_read']) ? ($body['is_read'] ? 1 : 0) : 1;
            query("UPDATE notifications SET is_read = ? WHERE notification_id = ?", [$isRead, $id]);
            json_response(['success' => true, 'message' => $isRead ? 'Notification marked as read.' : 'Notification marked as unread.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /notifications/mark-all-read
    if (($method === 'POST' || $method === 'PATCH') && $path === '/notifications/mark-all-read') {
        try {
            query("UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL", [$authUser['user_id']]);
            json_response(['success' => true, 'message' => 'All notifications marked as read.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // DELETE /notifications/{id}
    if ($method === 'DELETE' && preg_match('#^/notifications/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query("DELETE FROM notifications WHERE notification_id = ?", [$id]);
            json_response(['success' => true, 'message' => 'Notification deleted.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // DELETE /notifications
    if ($method === 'DELETE' && $path === '/notifications') {
        try {
            query("DELETE FROM notifications WHERE user_id = ? OR user_id IS NULL", [$authUser['user_id']]);
            json_response(['success' => true, 'message' => 'All notifications deleted.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    json_response(['error' => 'Endpoint not found'], 404);
}
