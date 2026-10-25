import bcrypt from 'bcryptjs';
import { query } from './db.js';

export async function seedDatabase() {
  try {
    // 1. Roles
    const existingRoles = await query('SELECT COUNT(*) AS count FROM roles');
    if (existingRoles[0].count === 0) {
      console.log('Seeding roles...');
      await query(`
        INSERT INTO roles (role_code, role_name) VALUES
        ('admin', 'Administrator'),
        ('frontdesk', 'Front Desk'),
        ('housekeeping', 'Housekeeping'),
        ('billing', 'Billing')
      `);
    }

    const roles = await query('SELECT * FROM roles');
    const roleMap = {};
    roles.forEach(r => {
      roleMap[r.role_code] = r.role_id;
      roleMap[r.role_name.toLowerCase()] = r.role_id;
    });

    // 2. Users
    const existingUsers = await query('SELECT COUNT(*) AS count FROM users');
    if (existingUsers[0].count === 0) {
      console.log('Seeding users...');
      const adminPass = await bcrypt.hash('admin123', 10);
      const frontPass = await bcrypt.hash('front123', 10);
      const housePass = await bcrypt.hash('house123', 10);
      const billPass = await bcrypt.hash('bill123', 10);

      await query(`
        INSERT INTO users (role_id, username, email, full_name, password_hash, is_active, is_on_duty) VALUES
        (?, 'anita', 'anita@hotel.in', 'Anita Menon', ?, 1, 1),
        (?, 'admin', 'admin@veyra.com', 'Admin User', ?, 1, 1),
        (?, 'rohan', 'rohan@hotel.in', 'Rohan Das', ?, 1, 1),
        (?, 'frontdesk', 'frontdesk@veyra.com', 'Front Desk Staff', ?, 1, 1),
        (?, 'meera', 'meera@hotel.in', 'Meera Nair', ?, 1, 1),
        (?, 'housekeeping', 'housekeeping@veyra.com', 'Housekeeping Staff', ?, 1, 1),
        (?, 'vikram', 'vikram@hotel.in', 'Vikram Rao', ?, 1, 0),
        (?, 'billing', 'billing@veyra.com', 'Billing Accountant', ?, 1, 1)
      `, [
        roleMap['admin'], adminPass,
        roleMap['admin'], adminPass,
        roleMap['frontdesk'], frontPass,
        roleMap['frontdesk'], frontPass,
        roleMap['housekeeping'], housePass,
        roleMap['housekeeping'], housePass,
        roleMap['billing'], billPass,
        roleMap['billing'], billPass,
      ]);
    }

    // 3. Room Types
    const existingTypes = await query('SELECT COUNT(*) AS count FROM room_types');
    if (existingTypes[0].count === 0) {
      console.log('Seeding room_types...');
      await query(`
        INSERT INTO room_types (type_name, base_rate) VALUES
        ('Single', 2500.00),
        ('Double', 3800.00),
        ('Suite', 6500.00)
      `);
    }

    const roomTypes = await query('SELECT * FROM room_types');
    const typeMap = {};
    roomTypes.forEach(t => { typeMap[t.type_name] = t.room_type_id; });

    // 4. Tax Rules
    const existingTaxes = await query('SELECT COUNT(*) AS count FROM tax_rules');
    if (existingTaxes[0].count === 0) {
      console.log('Seeding tax_rules...');
      await query(`
        INSERT INTO tax_rules (tax_name, rate_percent, min_amount, is_active) VALUES
        ('GST', 12.00, 0.00, 1),
        ('Service Charge', 5.00, 0.00, 1)
      `);
    }

    // 5. Shifts
    const existingShifts = await query('SELECT COUNT(*) AS count FROM shifts');
    if (existingShifts[0].count === 0) {
      console.log('Seeding shifts...');
      await query(`
        INSERT INTO shifts (shift_name, start_time, end_time) VALUES
        ('Morning Shift', '07:00:00', '15:00:00'),
        ('Evening Shift', '15:00:00', '23:00:00'),
        ('Night Shift', '23:00:00', '07:00:00')
      `);
    }

    // 6. Rooms
    const existingRooms = await query('SELECT COUNT(*) AS count FROM rooms');
    if (existingRooms[0].count === 0) {
      console.log('Seeding rooms...');
      await query(`
        INSERT INTO rooms (room_number, floor_no, room_type_id, current_rate, status, is_sellable) VALUES
        ('101', 1, ?, 2500.00, 'vacant_ready', 1),
        ('102', 1, ?, 2500.00, 'occupied', 1),
        ('103', 1, ?, 2500.00, 'vacant_ready', 1),
        ('104', 1, ?, 2500.00, 'vacant_ready', 1),
        ('105', 1, ?, 2500.00, 'vacant_dirty', 1),
        ('106', 1, ?, 2500.00, 'vacant_ready', 1),
        ('201', 2, ?, 3800.00, 'vacant_dirty', 1),
        ('202', 2, ?, 3800.00, 'vacant_ready', 1),
        ('203', 2, ?, 3800.00, 'occupied', 1),
        ('204', 2, ?, 3800.00, 'vacant_ready', 1),
        ('205', 2, ?, 3800.00, 'being_cleaned', 1),
        ('206', 2, ?, 3800.00, 'vacant_ready', 1),
        ('301', 3, ?, 6500.00, 'vacant_ready', 1),
        ('302', 3, ?, 6500.00, 'reserved', 1),
        ('303', 3, ?, 3800.00, 'vacant_ready', 1),
        ('304', 3, ?, 6500.00, 'occupied', 1),
        ('305', 3, ?, 6500.00, 'vacant_ready', 1),
        ('401', 4, ?, 6500.00, 'vacant_ready', 1),
        ('402', 4, ?, 6500.00, 'vacant_ready', 1),
        ('403', 4, ?, 6500.00, 'vacant_ready', 1),
        ('404', 4, ?, 6500.00, 'reserved', 1),
        ('501', 5, ?, 6500.00, 'vacant_ready', 1),
        ('502', 5, ?, 6500.00, 'vacant_ready', 1)
      `, [
        typeMap['Single'],
        typeMap['Single'],
        typeMap['Single'],
        typeMap['Single'],
        typeMap['Single'],
        typeMap['Single'],
        typeMap['Double'],
        typeMap['Double'],
        typeMap['Double'],
        typeMap['Double'],
        typeMap['Double'],
        typeMap['Double'],
        typeMap['Suite'],
        typeMap['Suite'],
        typeMap['Double'],
        typeMap['Suite'],
        typeMap['Suite'],
        typeMap['Suite'],
        typeMap['Suite'],
        typeMap['Suite'],
        typeMap['Suite'],
        typeMap['Suite'],
        typeMap['Suite'],
      ]);
    }

    // 7. Guests
    const existingGuests = await query('SELECT COUNT(*) AS count FROM guests');
    if (existingGuests[0].count === 0) {
      console.log('Seeding guests...');
      await query(`
        INSERT INTO guests (full_name, phone, email, address, id_type, id_number) VALUES
        ('Arjun Pillai', '+91 98471 22334', 'arjun.p@example.com', 'Kochi, Kerala', 'Passport', 'Z1234567'),
        ('Sara Thomas', '+91 97450 33445', 'sara.t@example.com', 'Bengaluru, Karnataka', 'Aadhaar', '9876-5432-1098'),
        ('Dev Kumar', '+91 94472 44556', 'dev.k@example.com', 'Mumbai, Maharashtra', 'Driving License', 'DL-0420110012345'),
        ('Ananya Sharma', '+91 99887 76655', 'ananya.s@example.com', 'Delhi', 'Passport', 'A7654321')
      `);
    }

    // 8. Bookings & Booking Rooms
    const existingBookings = await query('SELECT COUNT(*) AS count FROM bookings');
    if (existingBookings[0].count === 0) {
      console.log('Seeding bookings & booking_rooms...');
      const guests = await query('SELECT guest_id, full_name FROM guests');
      const roomsList = await query('SELECT room_id, room_number, current_rate FROM rooms');
      const adminUsers = await query('SELECT user_id FROM users LIMIT 1');
      const userId = adminUsers[0]?.user_id || 1;

      const room102 = roomsList.find(r => r.room_number === '102') || roomsList[0];
      const room201 = roomsList.find(r => r.room_number === '201') || roomsList[1];
      const room301 = roomsList.find(r => r.room_number === '301') || roomsList[2];

      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

      // Booking 1: Checked in (Room 102)
      const b1 = await query(`
        INSERT INTO bookings (booking_code, guest_id, check_in_date, check_out_date, adults, children, status, advance_amount, created_by)
        VALUES ('B-1042', ?, ?, ?, 2, 0, 'checked_in', 2500.00, ?)
      `, [guests[0].guest_id, yesterday, tomorrow, userId]);

      await query(`
        INSERT INTO booking_rooms (booking_id, room_id, rate_per_night, actual_check_in, status)
        VALUES (?, ?, ?, NOW(), 'in_house')
      `, [b1.insertId, room102.room_id, room102.current_rate]);

      // Booking 2: Checked out (Room 201)
      const b2 = await query(`
        INSERT INTO bookings (booking_code, guest_id, check_in_date, check_out_date, adults, children, status, advance_amount, created_by)
        VALUES ('B-1043', ?, ?, ?, 1, 0, 'checked_out', 3800.00, ?)
      `, [guests[1].guest_id, yesterday, today, userId]);

      await query(`
        INSERT INTO booking_rooms (booking_id, room_id, rate_per_night, actual_check_in, actual_check_out, status)
        VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), 'departed')
      `, [b2.insertId, room201.room_id, room201.current_rate]);

      // Booking 3: Reserved (Room 301)
      const b3 = await query(`
        INSERT INTO bookings (booking_code, guest_id, check_in_date, check_out_date, adults, children, status, advance_amount, created_by)
        VALUES ('B-1044', ?, ?, ?, 2, 1, 'confirmed', 5000.00, ?)
      `, [guests[2].guest_id, today, dayAfter, userId]);

      await query(`
        INSERT INTO booking_rooms (booking_id, room_id, rate_per_night, status)
        VALUES (?, ?, ?, 'reserved')
      `, [b3.insertId, room301.room_id, room301.current_rate]);
    }

    // 9. Supplies
    const existingSupplies = await query('SELECT COUNT(*) AS count FROM supplies');
    if (existingSupplies[0].count === 0) {
      console.log('Seeding supplies...');
      await query(`
        INSERT INTO supplies (item_name, unit, quantity_in_stock, reorder_level) VALUES
        ('Bath Towels', 'pcs', 45, 20),
        ('Hand Towels', 'pcs', 60, 25),
        ('Bed Linens (King)', 'sets', 30, 15),
        ('Bed Linens (Single)', 'sets', 25, 12),
        ('Luxury Herbal Soap', 'bars', 120, 40),
        ('Botanical Shampoo 50ml', 'bottles', 85, 30),
        ('Floor Disinfectant', 'litres', 15, 8),
        ('Dental Kits', 'kits', 70, 25)
      `);
    }

    // 10. Housekeeping Tasks
    const existingTasks = await query('SELECT COUNT(*) AS count FROM housekeeping_tasks');
    if (existingTasks[0].count === 0) {
      console.log('Seeding housekeeping_tasks...');
      const roomsList = await query('SELECT room_id, room_number FROM rooms');
      const hkUsers = await query("SELECT user_id FROM users WHERE username IN ('meera', 'housekeeping') LIMIT 1");
      const hkUserId = hkUsers[0]?.user_id || null;
      const room201 = roomsList.find(r => r.room_number === '201') || roomsList[0];
      const room101 = roomsList.find(r => r.room_number === '101') || roomsList[1];

      await query(`
        INSERT INTO housekeeping_tasks (room_id, task_type, est_minutes, priority, status, assigned_to) VALUES
        (?, 'Checkout Deep Clean', 45, 'high', 'pending', ?),
        (?, 'Daily Stayover Cleaning', 20, 'normal', 'completed', ?)
      `, [room201.room_id, hkUserId, room101.room_id, hkUserId]);
    }

    // 11. Invoices & Invoice Items & Payments
    const existingInvoices = await query('SELECT COUNT(*) AS count FROM invoices');
    if (existingInvoices[0].count === 0) {
      console.log('Seeding invoices & payments...');
      const bookingsList = await query('SELECT booking_id, guest_id FROM bookings LIMIT 2');
      const adminUsers = await query('SELECT user_id FROM users LIMIT 1');
      const userId = adminUsers[0]?.user_id || 1;

      if (bookingsList.length > 0) {
        const b = bookingsList[0];
        const inv = await query(`
          INSERT INTO invoices (invoice_number, booking_id, guest_id, subtotal, tax_total, grand_total, amount_paid, status, created_by)
          VALUES ('INV-1001', ?, ?, 5000.00, 600.00, 5600.00, 2500.00, 'partially_paid', ?)
        `, [b.booking_id, b.guest_id, userId]);

        await query(`
          INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, tax_amount, line_total)
          VALUES (?, 'room', 'Room 102 Stay (2 nights)', 2, 2500.00, 600.00, 5600.00)
        `, [inv.insertId]);

        await query(`
          INSERT INTO payments (invoice_id, booking_id, payment_type, method, amount, received_by)
          VALUES (?, ?, 'advance', 'card', 2500.00, ?)
        `, [inv.insertId, b.booking_id, userId]);
      }
    }

    // 12. Activity Log Initial Entries
    const existingLog = await query('SELECT COUNT(*) AS count FROM activity_log');
    if (existingLog[0].count === 0) {
      console.log('Seeding initial activity log...');
      const usersList = await query('SELECT user_id, full_name FROM users LIMIT 2');
      const u1 = usersList[0]?.user_id || 1;
      const u2 = usersList[1]?.user_id || 1;

      await query(`
        INSERT INTO activity_log (user_id, action, entity_type, entity_id, description, created_at) VALUES
        (?, 'System Initialized', 'system', NULL, 'Database schema and initial configuration verified.', NOW()),
        (?, 'Created Booking', 'bookings', 1, 'Created reservation B-1042 for Arjun Pillai', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
        (?, 'Room Status Updated', 'rooms', 2, 'Room 201 marked as vacant_dirty upon guest departure', DATE_SUB(NOW(), INTERVAL 1 HOUR))
      `, [u1, u1, u2]);
    }

    console.log('Database seeding check completed successfully.');
  } catch (err) {
    console.error('Error in seedDatabase:', err);
  }
}
