<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_middleware.php';

function handle_frontdesk_routes($method, $path, $body, $query_params) {
    $authUser = authenticate();
    authorize('frontdesk', 'front desk', 'admin', 'administrator');

    // GET /overview
    if ($method === 'GET' && $path === '/overview') {
        try {
            $rooms = query("SELECT room_id, status FROM rooms WHERE is_sellable = 1");
            $totalRooms = count($rooms);
            $available = 0; $occupied = 0; $dirty = 0; $beingCleaned = 0; $reserved = 0;
            foreach ($rooms as $r) {
                if ($r['status'] === 'vacant_ready') $available++;
                elseif ($r['status'] === 'occupied') $occupied++;
                elseif ($r['status'] === 'vacant_dirty') $dirty++;
                elseif ($r['status'] === 'being_cleaned') $beingCleaned++;
                elseif ($r['status'] === 'reserved') $reserved++;
            }
            $occupancyRate = ($totalRooms > 0) ? (int)round(($occupied / $totalRooms) * 100) : 0;

            $arrivals = query("SELECT COUNT(*) AS c FROM bookings WHERE check_in_date = CURDATE()");
            $departures = query("SELECT COUNT(*) AS c FROM bookings WHERE check_out_date = CURDATE()");
            $pendingBookings = query("SELECT COUNT(*) AS c FROM bookings WHERE status = 'pending'");
            $overdueCheckouts = query(
                "SELECT COUNT(*) AS c
                 FROM bookings b
                 JOIN booking_rooms br ON b.booking_id = br.booking_id
                 WHERE b.check_out_date < CURDATE() AND br.status = 'in_house'"
            );
            $inHouse = query("SELECT COUNT(*) AS c FROM booking_rooms WHERE status = 'in_house'");
            $openRequests = query("SELECT COUNT(*) AS c FROM service_requests WHERE status = 'open'");
            $dues = query("SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS due FROM invoices WHERE status != 'paid' AND status != 'void'");
            $collectedToday = query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE DATE(paid_at) = CURDATE()");

            json_response([
                'success' => true,
                'stats' => [
                    'totalRooms' => $totalRooms,
                    'available' => $available,
                    'occupied' => $occupied,
                    'dirty' => $dirty,
                    'beingCleaned' => $beingCleaned,
                    'reserved' => $reserved,
                    'occupancyRate' => $occupancyRate,
                    'arrivalsToday' => !empty($arrivals) ? (int)$arrivals[0]['c'] : 0,
                    'departuresToday' => !empty($departures) ? (int)$departures[0]['c'] : 0,
                    'pendingBookings' => !empty($pendingBookings) ? (int)$pendingBookings[0]['c'] : 0,
                    'overdueCheckouts' => !empty($overdueCheckouts) ? (int)$overdueCheckouts[0]['c'] : 0,
                    'inHouseGuests' => !empty($inHouse) ? (int)$inHouse[0]['c'] : 0,
                    'openRequests' => !empty($openRequests) ? (int)$openRequests[0]['c'] : 0,
                    'outstandingDues' => !empty($dues) ? (float)$dues[0]['due'] : 0.0,
                    'collectedToday' => !empty($collectedToday) ? (float)$collectedToday[0]['total'] : 0.0,
                ]
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /rooms
    if ($method === 'GET' && $path === '/rooms') {
        try {
            $rooms = query(
                "SELECT r.room_id AS id, r.room_number AS no, r.floor_no AS floor,
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

    // PUT /rooms/{id}/status
    if ($method === 'PUT' && preg_match('#^/rooms/(\d+)/status$#', $path, $matches)) {
        $roomId = (int)$matches[1];
        try {
            $status = $body['status'] ?? '';
            $dbStatus = $status;
            if ($status === 'Available') $dbStatus = 'vacant_ready';
            elseif ($status === 'Occupied') $dbStatus = 'occupied';
            elseif ($status === 'Dirty') $dbStatus = 'vacant_dirty';
            elseif ($status === 'Cleaning') $dbStatus = 'being_cleaned';
            elseif ($status === 'Reserved') $dbStatus = 'reserved';
            elseif ($status === 'Maintenance') $dbStatus = 'out_of_service';

            query("UPDATE rooms SET status = ? WHERE room_id = ?", [$dbStatus, $roomId]);

            log_activity(
                $authUser['user_id'],
                "Room Status Changed",
                "rooms",
                $roomId,
                sprintf("Front desk changed Room ID %d status to %s.", $roomId, $dbStatus)
            );

            json_response(['success' => true, 'status' => $dbStatus]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /bookings
    if ($method === 'GET' && $path === '/bookings') {
        try {
            $bookings = query(
                "SELECT b.booking_id, b.booking_code,
                        DATE_FORMAT(b.check_in_date, '%Y-%m-%d') AS check_in_date,
                        DATE_FORMAT(b.check_out_date, '%Y-%m-%d') AS check_out_date,
                        b.adults, b.children, b.status AS booking_status, b.advance_amount,
                        g.guest_id, g.full_name AS guest_name, g.phone, g.email, g.id_number,
                        br.booking_room_id, br.room_id, br.rate_per_night, br.status AS room_status,
                        DATE_FORMAT(br.actual_check_in, '%Y-%m-%d %H:%i') AS actual_check_in,
                        DATE_FORMAT(br.actual_check_out, '%Y-%m-%d %H:%i') AS actual_check_out,
                        r.room_number, t.type_name AS room_type
                 FROM bookings b
                 JOIN guests g ON b.guest_id = g.guest_id
                 LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
                 LEFT JOIN rooms r ON br.room_id = r.room_id
                 LEFT JOIN room_types t ON r.room_type_id = t.room_type_id
                 ORDER BY b.check_in_date DESC"
            );
            foreach ($bookings as &$bk) {
                $bk['booking_id'] = (int)$bk['booking_id'];
                $bk['advance_amount'] = (float)$bk['advance_amount'];
                if (isset($bk['rate_per_night'])) $bk['rate_per_night'] = (float)$bk['rate_per_night'];
            }
            json_response(['success' => true, 'bookings' => $bookings]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /bookings
    if ($method === 'POST' && $path === '/bookings') {
        try {
            db_begin();

            $guestName = $body['guest_name'] ?? $body['name'] ?? null;
            $phone = $body['phone'] ?? null;
            $email = $body['email'] ?? null;
            $idType = $body['id_type'] ?? $body['idType'] ?? 'Aadhaar';
            $idNumber = $body['id_number'] ?? $body['idNumber'] ?? null;
            $roomId = $body['room_id'] ?? null;
            $roomNumber = $body['room_number'] ?? $body['room'] ?? null;
            $checkInDate = $body['check_in_date'] ?? $body['checkIn'] ?? null;
            $checkOutDate = $body['check_out_date'] ?? $body['checkOut'] ?? null;
            $adults = (int)($body['adults'] ?? 1);
            $children = (int)($body['children'] ?? 0);
            $advanceAmount = (float)($body['advance_amount'] ?? $body['advance'] ?? 0);
            $paymentMethod = $body['payment_method'] ?? $body['paymentMethod'] ?? 'cash';

            if (!$guestName || !$checkInDate || !$checkOutDate) {
                db_rollback();
                json_response(['error' => 'Guest name, check-in date, and check-out date are required.'], 400);
            }

            if ($checkOutDate <= $checkInDate) {
                db_rollback();
                json_response(['error' => 'Check-out date must be after check-in date.'], 400);
            }

            // 1. Resolve or create guest
            $guestId = null;
            if ($phone) {
                $gRow = query("SELECT guest_id FROM guests WHERE phone = ? LIMIT 1", [$phone]);
                if (!empty($gRow)) {
                    $guestId = $gRow[0]['guest_id'];
                }
            }

            if (!$guestId) {
                $gRes = query(
                    "INSERT INTO guests (full_name, phone, email, id_type, id_number, created_at)
                     VALUES (?, ?, ?, ?, ?, NOW())",
                    [$guestName, $phone ?: null, $email ?: null, $idType, $idNumber ?: null]
                );
                $guestId = $gRes['insertId'];
            }

            // 2. Resolve room
            $targetRoomId = $roomId;
            $targetRoomNumber = $roomNumber;
            $roomRate = 2500.0;

            if (!$targetRoomId && $roomNumber) {
                $rRow = query("SELECT room_id, room_number, current_rate FROM rooms WHERE room_number = ? LIMIT 1", [$roomNumber]);
                if (!empty($rRow)) {
                    $targetRoomId = $rRow[0]['room_id'];
                    $targetRoomNumber = $rRow[0]['room_number'];
                    $roomRate = (float)$rRow[0]['current_rate'];
                }
            } elseif ($targetRoomId) {
                $rRow = query("SELECT room_id, room_number, current_rate FROM rooms WHERE room_id = ?", [$targetRoomId]);
                if (!empty($rRow)) {
                    $targetRoomNumber = $rRow[0]['room_number'];
                    $roomRate = (float)$rRow[0]['current_rate'];
                }
            } else {
                $rRow = query("SELECT room_id, room_number, current_rate FROM rooms WHERE status = 'vacant_ready' AND is_sellable = 1 LIMIT 1");
                if (!empty($rRow)) {
                    $targetRoomId = $rRow[0]['room_id'];
                    $targetRoomNumber = $rRow[0]['room_number'];
                    $roomRate = (float)$rRow[0]['current_rate'];
                }
            }

            if (!$targetRoomId) {
                db_rollback();
                json_response(['error' => 'No suitable room available for booking.'], 400);
            }

            // Double booking conflict check
            $conflicts = query(
                "SELECT br.booking_room_id
                 FROM booking_rooms br
                 JOIN bookings b ON br.booking_id = b.booking_id
                 WHERE br.room_id = ?
                   AND br.status != 'cancelled'
                   AND b.status != 'cancelled'
                   AND NOT (b.check_out_date <= ? OR b.check_in_date >= ?)",
                [$targetRoomId, $checkInDate, $checkOutDate]
            );
            if (!empty($conflicts)) {
                db_rollback();
                json_response(['error' => 'This room is already booked for the selected date range.'], 400);
            }

            // 3. Create booking record
            $bookingCode = sprintf("BK-%d", rand(2000, 9999));
            $bkRes = query(
                "INSERT INTO bookings (booking_code, guest_id, check_in_date, check_out_date, adults, children, status, advance_amount, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, NOW())",
                [$bookingCode, $guestId, $checkInDate, $checkOutDate, $adults, $children, $advanceAmount, $authUser['user_id']]
            );
            $bookingId = $bkRes['insertId'];

            // 4. Create booking_rooms entry
            query(
                "INSERT INTO booking_rooms (booking_id, room_id, rate_per_night, status)
                 VALUES (?, ?, ?, 'reserved')",
                [$bookingId, $targetRoomId, $roomRate]
            );

            // Update room to reserved
            query("UPDATE rooms SET status = 'reserved' WHERE room_id = ?", [$targetRoomId]);

            // 5. Auto-generate corresponding Invoice and Items for Billing Dashboard
            $d1 = new DateTime(substr($checkInDate, 0, 10));
            $d2 = new DateTime(substr($checkOutDate, 0, 10));
            $diff = $d1->diff($d2);
            $nights = max(1, (int)$diff->days);
            $subtotal = $nights * $roomRate;
            $taxTotal = round($subtotal * 0.12, 2);
            $grandTotal = round($subtotal + $taxTotal, 2);
            $invStatus = ($advanceAmount >= $grandTotal) ? 'paid' : (($advanceAmount > 0) ? 'partially_paid' : 'issued');
            $invoiceNum = "INV-" . str_replace("BK-", "", $bookingCode);

            $invRes = query(
                "INSERT INTO invoices (invoice_number, booking_id, guest_id, subtotal, tax_total, grand_total, amount_paid, status, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                [$invoiceNum, $bookingId, $guestId, $subtotal, $taxTotal, $grandTotal, $advanceAmount, $invStatus, $authUser['user_id']]
            );
            $invoiceId = $invRes['insertId'];

            query(
                "INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_amount, line_total)
                 VALUES (?, 'room', ?, ?, ?, ?, ?)",
                [$invoiceId, sprintf("Room %s Stay (%d night(s))", $targetRoomNumber, $nights), $nights, $roomRate, $taxTotal, $grandTotal]
            );

            // 6. Record advance payment if present
            if ($advanceAmount > 0) {
                $methodVal = strtolower(trim((string)$paymentMethod));
                if (!in_array($methodVal, ['cash', 'card', 'upi', 'bank_transfer'], true)) {
                    $methodVal = 'cash';
                }
                query(
                    "INSERT INTO payments (invoice_id, booking_id, payment_type, method, amount, received_by, paid_at)
                     VALUES (?, ?, 'advance', ?, ?, ?, NOW())",
                    [$invoiceId, $bookingId, $methodVal, $advanceAmount, $authUser['user_id']]
                );
            }

            // 7. Notification for all dashboards
            query(
                "INSERT INTO notifications (title, message, is_read, created_at)
                 VALUES (?, ?, 0, NOW())",
                [
                    "New Booking Confirmed",
                    sprintf("Booking %s for %s (Room %s, %d night(s), %s to %s).", $bookingCode, $guestName, $targetRoomNumber, $nights, $checkInDate, $checkOutDate)
                ]
            );

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Created Booking",
                "bookings",
                $bookingId,
                sprintf("New booking %s for %s (Room %s, Advance: Rs %.2f).", $bookingCode, $guestName, $targetRoomNumber, $advanceAmount)
            );

            json_response([
                'success' => true,
                'booking_id' => $bookingId,
                'booking_code' => $bookingCode,
                'invoice_id' => $invoiceId,
                'invoice_number' => $invoiceNum,
                'message' => 'Booking created successfully.'
            ]);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /checkin/{id}
    if ($method === 'POST' && preg_match('#^/checkin/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            db_begin();
            $rows = query(
                "SELECT br.booking_room_id, br.booking_id, br.room_id, b.booking_code, r.room_number, g.full_name
                 FROM booking_rooms br
                 JOIN bookings b ON br.booking_id = b.booking_id
                 JOIN guests g ON b.guest_id = g.guest_id
                 JOIN rooms r ON br.room_id = r.room_id
                 WHERE br.booking_room_id = ? OR br.booking_id = ?
                 LIMIT 1",
                [$id, $id]
            );
            if (empty($rows)) {
                db_rollback();
                json_response(['error' => 'Booking room record not found.'], 404);
            }

            $row = $rows[0];
            $brId = $row['booking_room_id'];
            $bkId = $row['booking_id'];
            $rmId = $row['room_id'];
            $bkCode = $row['booking_code'];
            $rmNo = $row['room_number'];
            $gName = $row['full_name'];

            query("UPDATE booking_rooms SET status = 'in_house', actual_check_in = NOW() WHERE booking_room_id = ?", [$brId]);
            query("UPDATE bookings SET status = 'checked_in' WHERE booking_id = ?", [$bkId]);
            query("UPDATE rooms SET status = 'occupied' WHERE room_id = ?", [$rmId]);

            query(
                "INSERT INTO notifications (title, message, is_read, created_at)
                 VALUES (?, ?, 0, NOW())",
                ["Guest Checked In", sprintf("Guest %s checked into Room %s (%s).", $gName, $rmNo, $bkCode)]
            );

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Guest Check-in",
                "bookings",
                $bkId,
                sprintf("Checked in guest %s for booking %s (Room %s).", $gName, $bkCode, $rmNo)
            );

            json_response(['success' => true, 'message' => 'Check-in completed successfully.']);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /checkout/{id}
    if ($method === 'POST' && preg_match('#^/checkout/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            db_begin();
            $rows = query(
                "SELECT br.booking_room_id, br.booking_id, br.room_id, b.booking_code, r.room_number, g.full_name
                 FROM booking_rooms br
                 JOIN bookings b ON br.booking_id = b.booking_id
                 JOIN guests g ON b.guest_id = g.guest_id
                 JOIN rooms r ON br.room_id = r.room_id
                 WHERE br.booking_room_id = ? OR br.booking_id = ?
                 LIMIT 1",
                [$id, $id]
            );
            if (empty($rows)) {
                db_rollback();
                json_response(['error' => 'Booking room record not found.'], 404);
            }

            $row = $rows[0];
            $brId = $row['booking_room_id'];
            $bkId = $row['booking_id'];
            $rmId = $row['room_id'];
            $bkCode = $row['booking_code'];
            $rmNo = $row['room_number'];
            $gName = $row['full_name'];

            query("UPDATE booking_rooms SET status = 'departed', actual_check_out = NOW() WHERE booking_room_id = ?", [$brId]);
            query("UPDATE bookings SET status = 'checked_out' WHERE booking_id = ?", [$bkId]);
            query("UPDATE rooms SET status = 'vacant_dirty' WHERE room_id = ?", [$rmId]);

            // Handle damage charges and extra incidentals if provided
            $damageAmount = (float)($body['damages'] ?? 0);
            $damageDesc = trim((string)($body['damage_desc'] ?? 'Room damages / repair'));
            $extraAmount = (float)($body['extra_charges'] ?? 0);
            $extraDesc = trim((string)($body['extra_desc'] ?? 'Extra incidentals'));
            $settled = !empty($body['settled']);
            $validMethods = ['cash', 'card', 'upi', 'bank_transfer'];
            $payMethod = str_replace([' ', '-'], '_', strtolower((string)($body['payment_method'] ?? 'cash')));
            if (!in_array($payMethod, $validMethods)) $payMethod = 'cash';

            if ($damageAmount > 0 || $extraAmount > 0 || $settled) {
                // Find or create invoice for booking
                $inv = query("SELECT invoice_id, grand_total, subtotal, amount_paid FROM invoices WHERE booking_id = ? ORDER BY invoice_id DESC LIMIT 1", [$bkId]);
                $invId = null;
                $currentGrand = 0;
                $currentPaid = 0;
                $currentSub = 0;

                if (!empty($inv)) {
                    $invId = $inv[0]['invoice_id'];
                    $currentSub = (float)$inv[0]['subtotal'];
                    $currentGrand = (float)$inv[0]['grand_total'];
                    $currentPaid = (float)$inv[0]['amount_paid'];
                } else {
                    $invCode = 'INV-' . (1000 + $bkId);
                    $invRes = query(
                        "INSERT INTO invoices (invoice_number, booking_id, guest_id, subtotal, tax_total, grand_total, amount_paid, status, created_by)
                         VALUES (?, ?, ?, 0, 0, 0, 0, 'unpaid', ?)",
                        [$invCode, $bkId, $row['booking_id'], $authUser['user_id']]
                    );
                    $invId = $invRes['insertId'];
                }

                $addedTotal = 0;
                if ($damageAmount > 0) {
                    query(
                        "INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_amount, line_total)
                         VALUES (?, 'other', ?, 1, ?, 0, ?)",
                        [$invId, "Damage Charges: " . $damageDesc, $damageAmount, $damageAmount]
                    );
                    $addedTotal += $damageAmount;
                }
                if ($extraAmount > 0) {
                    query(
                        "INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_amount, line_total)
                         VALUES (?, 'other', ?, 1, ?, 0, ?)",
                        [$invId, "Extra Charges: " . $extraDesc, $extraAmount, $extraAmount]
                    );
                    $addedTotal += $extraAmount;
                }

                $newGrand = $currentGrand + $addedTotal;
                $newSub = $currentSub + $addedTotal;

                if ($settled) {
                    $balanceToPay = max(0, $newGrand - $currentPaid);
                    if ($balanceToPay > 0) {
                        query(
                            "INSERT INTO payments (invoice_id, booking_id, payment_type, method, amount, received_by, paid_at)
                             VALUES (?, ?, 'payment', ?, ?, ?, NOW())",
                            [$invId, $bkId, $payMethod, $balanceToPay, $authUser['user_id']]
                        );
                        $currentPaid += $balanceToPay;
                    }
                    query(
                        "UPDATE invoices SET subtotal = ?, grand_total = ?, amount_paid = ?, status = 'paid' WHERE invoice_id = ?",
                        [$newSub, $newGrand, $currentPaid, $invId]
                    );
                } else {
                    $newStatus = ($currentPaid >= $newGrand) ? 'paid' : (($currentPaid > 0) ? 'partially_paid' : 'unpaid');
                    query(
                        "UPDATE invoices SET subtotal = ?, grand_total = ?, status = ? WHERE invoice_id = ?",
                        [$newSub, $newGrand, $newStatus, $invId]
                    );
                }
            }

            // Create housekeeping cleaning task
            query(
                "INSERT INTO housekeeping_tasks (room_id, task_type, est_minutes, priority, status, created_at)
                 VALUES (?, 'Checkout Deep Clean', 40, 'high', 'pending', NOW())",
                [$rmId]
            );

            $notifMsg = sprintf("Room %s checked out by %s (%s). Ready for cleaning.", $rmNo, $gName, $bkCode);
            if ($damageAmount > 0) {
                $notifMsg .= sprintf(" Damage fee recorded: Rs %.2f (%s).", $damageAmount, $damageDesc);
            }
            if ($extraAmount > 0) {
                $notifMsg .= sprintf(" Extra incidentals: Rs %.2f (%s).", $extraAmount, $extraDesc);
            }

            query(
                "INSERT INTO notifications (title, message, is_read, created_at)
                 VALUES ('Room Checkout Cleaning Needed', ?, 0, NOW())",
                [$notifMsg]
            );

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Guest Check-out",
                "bookings",
                $bkId,
                sprintf("Checked out guest %s for booking %s (Room %s). Damages: Rs %.2f, Extras: Rs %.2f, Settled: %s.",
                    $gName, $bkCode, $rmNo, $damageAmount, $extraAmount, $settled ? 'Yes' : 'No')
            );

            json_response(['success' => true, 'message' => 'Check-out completed and housekeeping task scheduled.']);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /bookings/{id}/charges
    if ($method === 'POST' && preg_match('#^/bookings/(\d+)/charges$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $cat = $body['category'] ?? $body['cat'] ?? 'Other';
            $desc = $body['description'] ?? $body['desc'] ?? '';
            $amount = (float)($body['amount'] ?? 0);
            if ($amount <= 0) {
                json_response(['error' => 'Valid charge amount required.'], 400);
            }

            db_begin();
            // Lookup booking
            $bk = query(
                "SELECT b.booking_id, b.guest_id, b.booking_code, r.room_number, g.full_name
                 FROM bookings b
                 LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
                 LEFT JOIN rooms r ON br.room_id = r.room_id
                 LEFT JOIN guests g ON b.guest_id = g.guest_id
                 WHERE b.booking_id = ? OR br.booking_room_id = ?
                 LIMIT 1",
                [$id, $id]
            );

            if (empty($bk)) {
                db_rollback();
                json_response(['error' => 'Booking not found.'], 404);
            }

            $bkId = $bk[0]['booking_id'];
            $gId = $bk[0]['guest_id'];
            $roomNo = $bk[0]['room_number'] ?? 'N/A';
            $gName = $bk[0]['full_name'] ?? 'Guest';

            $inv = query("SELECT invoice_id, grand_total, subtotal, amount_paid FROM invoices WHERE booking_id = ? ORDER BY invoice_id DESC LIMIT 1", [$bkId]);
            if (!empty($inv)) {
                $invId = $inv[0]['invoice_id'];
                $newSub = (float)$inv[0]['subtotal'] + $amount;
                $newGrand = (float)$inv[0]['grand_total'] + $amount;
                $amtPaid = (float)$inv[0]['amount_paid'];
                $newStatus = ($amtPaid >= $newGrand) ? 'paid' : (($amtPaid > 0) ? 'partially_paid' : 'unpaid');
                query(
                    "INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_amount, line_total)
                     VALUES (?, 'other', ?, 1, ?, 0, ?)",
                    [$invId, "{$cat}: {$desc}", $amount, $amount]
                );
                query(
                    "UPDATE invoices SET subtotal = ?, grand_total = ?, status = ? WHERE invoice_id = ?",
                    [$newSub, $newGrand, $newStatus, $invId]
                );
            } else {
                $invCode = 'INV-' . (1000 + $bkId);
                $res = query(
                    "INSERT INTO invoices (invoice_number, booking_id, guest_id, subtotal, tax_total, grand_total, amount_paid, status, created_by)
                     VALUES (?, ?, ?, ?, 0, ?, 0, 'unpaid', ?)",
                    [$invCode, $bkId, $gId, $amount, $amount, $authUser['user_id']]
                );
                $invId = $res['insertId'];
                query(
                    "INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_amount, line_total)
                     VALUES (?, 'other', ?, 1, ?, 0, ?)",
                    [$invId, "{$cat}: {$desc}", $amount, $amount]
                );
            }

            // Also create notification for Billing
            query(
                "INSERT INTO notifications (title, message, is_read, created_at)
                 VALUES (?, ?, 0, NOW())",
                [
                    "New Charge Posted",
                    sprintf("Room %s (%s): %s charge of Rs %.2f posted by Front Desk.", $roomNo, $gName, $cat, $amount)
                ]
            );

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Posted Charge",
                "invoices",
                $invId,
                sprintf("Posted %s charge of Rs %.2f to Booking %s (Room %s).", $cat, $amount, $bk[0]['booking_code'], $roomNo)
            );

            json_response(['success' => true, 'invoice_id' => $invId, 'message' => 'Charge posted successfully.']);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /bookings/{id}/payments
    if ($method === 'POST' && preg_match('#^/bookings/(\d+)/payments$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $amount = (float)($body['amount'] ?? 0);
            $validMethods = ['cash', 'card', 'upi', 'bank_transfer'];
            $mode = str_replace([' ', '-'], '_', strtolower((string)($body['mode'] ?? 'cash')));
            if (!in_array($mode, $validMethods)) $mode = 'cash';

            if ($amount <= 0) {
                json_response(['error' => 'Valid payment amount required.'], 400);
            }

            db_begin();
            $bk = query(
                "SELECT b.booking_id, b.guest_id, b.booking_code, r.room_number, g.full_name
                 FROM bookings b
                 LEFT JOIN booking_rooms br ON b.booking_id = br.booking_id
                 LEFT JOIN rooms r ON br.room_id = r.room_id
                 LEFT JOIN guests g ON b.guest_id = g.guest_id
                 WHERE b.booking_id = ? OR br.booking_room_id = ?
                 LIMIT 1",
                [$id, $id]
            );

            if (empty($bk)) {
                db_rollback();
                json_response(['error' => 'Booking not found.'], 404);
            }

            $bkId = $bk[0]['booking_id'];
            $inv = query("SELECT invoice_id, grand_total, amount_paid FROM invoices WHERE booking_id = ? ORDER BY invoice_id DESC LIMIT 1", [$bkId]);
            if (empty($inv)) {
                db_rollback();
                json_response(['error' => 'Invoice not found for this booking.'], 404);
            }

            $invId = $inv[0]['invoice_id'];
            $grand = (float)$inv[0]['grand_total'];
            $prevPaid = (float)$inv[0]['amount_paid'];
            $newPaid = $prevPaid + $amount;
            $status = ($newPaid >= $grand) ? 'paid' : 'partially_paid';

            query(
                "INSERT INTO payments (invoice_id, booking_id, payment_type, method, amount, received_by, paid_at)
                 VALUES (?, ?, 'payment', ?, ?, ?, NOW())",
                [$invId, $bkId, $mode, $amount, $authUser['user_id']]
            );
            query(
                "UPDATE invoices SET amount_paid = ?, status = ? WHERE invoice_id = ?",
                [$newPaid, $status, $invId]
            );

            db_commit();

            log_activity(
                $authUser['user_id'],
                "Received Payment",
                "payments",
                $invId,
                sprintf("Received payment of Rs %.2f (%s) for Booking %s (Room %s).", $amount, strtoupper($mode), $bk[0]['booking_code'], $bk[0]['room_number'] ?? 'N/A')
            );

            json_response(['success' => true, 'message' => 'Payment recorded successfully.']);
        } catch (Exception $err) {
            db_rollback();
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /inhouse
    if ($method === 'GET' && $path === '/inhouse') {
        try {
            $inHouse = query(
                "SELECT br.booking_room_id, br.booking_id, r.room_number, t.type_name AS room_type,
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
                 ORDER BY r.room_number ASC"
            );
            json_response(['success' => true, 'inHouse' => $inHouse]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /service-requests
    if ($method === 'GET' && $path === '/service-requests') {
        try {
            $requests = query(
                "SELECT sr.request_id AS id, sr.room_id, r.room_number, sr.category,
                        sr.description, sr.status, sr.charge_amount,
                        DATE_FORMAT(sr.created_at, '%Y-%m-%d %H:%i') AS created_at,
                        g.full_name AS guest_name,
                        u.full_name AS assigned_staff
                 FROM service_requests sr
                 JOIN rooms r ON sr.room_id = r.room_id
                 LEFT JOIN guests g ON sr.guest_id = g.guest_id
                 LEFT JOIN users u ON sr.assigned_to = u.user_id
                 ORDER BY sr.created_at DESC"
            );
            foreach ($requests as &$sr) {
                $sr['id'] = (int)$sr['id'];
                $sr['charge_amount'] = (float)$sr['charge_amount'];
            }
            json_response(['success' => true, 'requests' => $requests]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /service-requests
    if ($method === 'POST' && $path === '/service-requests') {
        try {
            $roomNumber = $body['room_number'] ?? $body['room'] ?? null;
            $category = $body['category'] ?? $body['type'] ?? 'Housekeeping';
            $description = $body['description'] ?? $body['desc'] ?? $body['notes'] ?? $category;
            $chargeAmount = (float)($body['charge_amount'] ?? 0);
            $assignedTo = $body['assigned_to'] ?? null;

            if (!$roomNumber || !$description) {
                json_response(['error' => 'Room number and description are required.'], 400);
            }

            $rooms = query("SELECT room_id FROM rooms WHERE room_number = ? LIMIT 1", [$roomNumber]);
            if (empty($rooms)) {
                json_response(['error' => sprintf("Room %s not found.", $roomNumber)], 404);
            }
            $roomId = $rooms[0]['room_id'];

            $res = query(
                "INSERT INTO service_requests (room_id, category, description, status, charge_amount, assigned_to, created_at)
                 VALUES (?, ?, ?, 'open', ?, ?, NOW())",
                [$roomId, $category, $description, $chargeAmount, $assignedTo]
            );

            create_notification(null, "Work Assigned: Service Request", sprintf("Room %s: %s - %s", $roomNumber, $category, $description));

            log_activity(
                $authUser['user_id'],
                "Created Service Request",
                "service_requests",
                $res['insertId'],
                sprintf("New service request for Room %s: %s - %s.", $roomNumber, $category, $description)
            );

            json_response(['success' => true, 'id' => $res['insertId']]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /service-requests/{id}
    if ($method === 'PUT' && preg_match('#^/service-requests/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $status = $body['status'] ?? null;
            $assignedTo = $body['assigned_to'] ?? null;

            $fields = [];
            $params = [];
            if ($status) {
                $fields[] = "status = ?";
                $params[] = $status;
                if ($status === 'completed') {
                    $fields[] = "completed_at = NOW()";
                }
            }
            if ($assignedTo) {
                $fields[] = "assigned_to = ?";
                $params[] = $assignedTo;
            }

            if (!empty($fields)) {
                $params[] = $id;
                query("UPDATE service_requests SET " . implode(', ', $fields) . " WHERE request_id = ?", $params);
            }

            json_response(['success' => true, 'message' => 'Service request updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // DELETE /service-requests/{id}
    if ($method === 'DELETE' && preg_match('#^/service-requests/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query("DELETE FROM service_requests WHERE request_id = ?", [$id]);
            json_response(['success' => true, 'message' => 'Request deleted.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /rate-housekeeper
    if ($method === 'POST' && $path === '/rate-housekeeper') {
        try {
            $housekeeper = $body['housekeeper'] ?? 'Anita Joseph';
            $room = $body['room'] ?? '-';
            $rating = (int)($body['rating'] ?? 5);
            $comment = trim((string)($body['comment'] ?? ''));
            $note = $comment ?: ($rating >= 4 ? 'Excellent work! Room is spotless.' : 'Satisfactory service.');
            $tagsVal = is_array($body['tags'] ?? null) ? implode(', ', $body['tags']) : (string)($body['tags'] ?? 'Clean & Tidy');

            query(
                "INSERT INTO housekeeper_ratings (housekeeper_name, room_number, service_type, rating, comment, tags, rated_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
                [$housekeeper, (string)$room, $body['service_type'] ?? 'Room Cleaning', $rating, $note, $tagsVal, $authUser['user_id']]
            );

            create_notification(
                null,
                "Housekeeper Rating Received",
                sprintf("Front Desk rated %s %d stars for Room %s: \"%s\"", $housekeeper, $rating, $room, $note)
            );

            log_activity(
                $authUser['user_id'],
                "Rated Housekeeper",
                "housekeeper_ratings",
                null,
                sprintf("Front Desk rated %s %d stars for Room %s.", $housekeeper, $rating, $room)
            );

            json_response(['success' => true, 'message' => 'Rating saved to database and notification created.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /guests
    if ($method === 'GET' && $path === '/guests') {
        try {
            $qTerm = $query_params['q'] ?? null;
            $sql = "SELECT guest_id AS id, full_name AS name, phone, email, address,
                           id_type, id_number,
                           DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
                    FROM guests
                    WHERE 1 = 1";
            $params = [];
            if ($qTerm) {
                $sql .= " AND (full_name LIKE ? OR phone LIKE ? OR id_number LIKE ?)";
                $t = "%" . $qTerm . "%";
                $params = [$t, $t, $t];
            }
            $sql .= " ORDER BY guest_id DESC LIMIT 50";
            $guests = query($sql, $params);
            foreach ($guests as &$g) {
                $g['id'] = (int)$g['id'];
            }
            json_response(['success' => true, 'guests' => $guests]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /guests
    if ($method === 'POST' && $path === '/guests') {
        try {
            $name = trim((string)($body['name'] ?? ''));
            $phone = $body['phone'] ?? null;
            $email = $body['email'] ?? null;
            $address = $body['address'] ?? null;
            $idType = $body['id_type'] ?? 'Aadhaar';
            $idNumber = $body['id_number'] ?? null;

            if ($name === '') {
                json_response(['error' => 'Guest name is required.'], 400);
            }

            $res = query(
                "INSERT INTO guests (full_name, phone, email, address, id_type, id_number, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())",
                [$name, $phone, $email, $address, $idType, $idNumber]
            );

            json_response(['success' => true, 'id' => $res['insertId']]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // PUT /guests/{id}
    if ($method === 'PUT' && preg_match('#^/guests/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query(
                "UPDATE guests
                 SET full_name = ?, phone = ?, email = ?, address = ?, id_type = ?, id_number = ?
                 WHERE guest_id = ?",
                [$body['name'] ?? null, $body['phone'] ?? null, $body['email'] ?? null, $body['address'] ?? null, $body['id_type'] ?? null, $body['id_number'] ?? null, $id]
            );
            json_response(['success' => true, 'message' => 'Guest record updated.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // DELETE /guests/{id}
    if ($method === 'DELETE' && preg_match('#^/guests/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            $bookings = query("SELECT booking_id FROM bookings WHERE guest_id = ? LIMIT 1", [$id]);
            if (!empty($bookings)) {
                json_response(['error' => 'Cannot delete guest with active or past bookings.'], 400);
            }
            query("DELETE FROM guests WHERE guest_id = ?", [$id]);
            json_response(['success' => true, 'message' => 'Guest deleted.']);
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
                 ORDER BY created_at DESC
                 LIMIT 30",
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
            json_response(['success' => true]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // DELETE /notifications/{id}
    if ($method === 'DELETE' && preg_match('#^/notifications/(\d+)$#', $path, $matches)) {
        $id = (int)$matches[1];
        try {
            query("DELETE FROM notifications WHERE notification_id = ?", [$id]);
            json_response(['success' => true]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /shift-report
    if ($method === 'GET' && $path === '/shift-report') {
        try {
            $cash = query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE method = 'cash' AND DATE(paid_at) = CURDATE()");
            $other = query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE method != 'cash' AND DATE(paid_at) = CURDATE()");
            $shifts = query("SELECT * FROM shifts LIMIT 1");
            $shiftId = !empty($shifts) ? $shifts[0]['shift_id'] : 1;

            $existing = query(
                "SELECT * FROM shift_reports WHERE user_id = ? AND shift_id = ? AND report_date = CURDATE() LIMIT 1",
                [$authUser['user_id'], $shiftId]
            );

            json_response([
                'success' => true,
                'report' => !empty($existing) ? $existing[0] : null,
                'cash_collected' => !empty($cash) ? (float)$cash[0]['total'] : 0.0,
                'other_collected' => !empty($other) ? (float)$other[0]['total'] : 0.0,
            ]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // POST /shift-report
    if ($method === 'POST' && $path === '/shift-report') {
        try {
            $handoverNotes = $body['handover_notes'] ?? '';
            $cashCollected = (float)($body['cash_collected'] ?? 0);
            $otherCollected = (float)($body['other_collected'] ?? 0);

            $shifts = query("SELECT * FROM shifts LIMIT 1");
            $shiftId = !empty($shifts) ? $shifts[0]['shift_id'] : 1;

            query(
                "INSERT INTO shift_reports (user_id, shift_id, report_date, cash_collected, other_collected, handover_notes)
                 VALUES (?, ?, CURDATE(), ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   cash_collected = VALUES(cash_collected),
                   other_collected = VALUES(other_collected),
                   handover_notes = VALUES(handover_notes)",
                [$authUser['user_id'], $shiftId, $cashCollected, $otherCollected, $handoverNotes]
            );

            log_activity(
                $authUser['user_id'],
                "Submitted Shift Report",
                "shift_reports",
                null,
                sprintf("Front desk shift report submitted by %s.", $authUser['full_name'] ?? 'Staff')
            );

            json_response(['success' => true, 'message' => 'Shift report submitted.']);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    // GET /search
    if ($method === 'GET' && $path === '/search') {
        try {
            $qTerm = trim((string)($query_params['q'] ?? ''));
            if ($qTerm === '') {
                json_response(['success' => true, 'results' => []]);
            }

            $term = "%" . $qTerm . "%";
            $results = query(
                "SELECT g.guest_id, g.full_name, g.phone, g.id_number,
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
                 LIMIT 15",
                [$term, $term, $term, $term, $term]
            );

            json_response(['success' => true, 'results' => $results]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    json_response(['error' => 'Endpoint not found'], 404);
}
