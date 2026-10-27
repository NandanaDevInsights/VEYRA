<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_middleware.php';

function handle_auth_routes($method, $path, $body, $query_params) {
    if ($method === 'POST' && $path === '/login') {
        try {
            $username = trim((string)($body['username'] ?? ''));
            $password = trim((string)($body['password'] ?? ''));
            $role = $body['role'] ?? null;
            $keepSigned = !empty($body['keepSigned']);

            if ($username === '') {
                json_response(['error' => 'Username or email is required.'], 400);
            }
            if ($password === '') {
                json_response(['error' => 'Password is required.'], 400);
            }

            $users = query(
                "SELECT u.user_id, u.role_id, u.username, u.email, u.full_name, u.password_hash,
                        u.is_active, u.is_on_duty, r.role_code, r.role_name
                 FROM users u
                 JOIN roles r ON u.role_id = r.role_id
                 WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?))
                 LIMIT 1",
                [$username, $username]
            );

            if (empty($users)) {
                json_response(['error' => 'Invalid username or password.'], 401);
            }

            $user = $users[0];

            if (empty($user['is_active'])) {
                json_response(['error' => 'Your staff account is currently inactive. Contact Administrator.'], 403);
            }

            $requestedNormRole = normalize_role($role);
            $userNormRole = normalize_role($user['role_code'] ?? $user['role_name']);

            if ($requestedNormRole !== '' && $requestedNormRole !== $userNormRole) {
                json_response([
                    'error' => sprintf("Access denied: Account '%s' is assigned to role '%s', not '%s'.", $user['username'], $user['role_name'], $role)
                ], 403);
            }

            if (!password_verify($password, $user['password_hash'])) {
                json_response(['error' => 'Invalid username or password.'], 401);
            }

            query("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [$user['user_id']]);

            log_activity(
                $user['user_id'],
                "User Login",
                "users",
                $user['user_id'],
                sprintf("%s (%s) signed in to portal.", $user['full_name'], $user['role_name'])
            );

            $token = generate_token($user, $keepSigned);

            json_response([
                'success' => true,
                'token' => $token,
                'user' => [
                    'user_id' => (int)$user['user_id'],
                    'username' => $user['username'],
                    'email' => $user['email'],
                    'full_name' => $user['full_name'],
                    'role' => $user['role_name'],
                    'role_code' => $user['role_code'],
                    'is_on_duty' => (bool)$user['is_on_duty'],
                ]
            ]);
        } catch (Exception $err) {
            error_log('[Login Error] ' . $err->getMessage());
            json_response(['error' => 'Server error during login authentication.'], 500);
        }
    }

    if ($method === 'POST' && $path === '/register') {
        try {
            $fullName = trim((string)($body['full_name'] ?? ''));
            $username = trim((string)($body['username'] ?? ''));
            $email = trim((string)($body['email'] ?? ''));
            $password = trim((string)($body['password'] ?? ''));
            $role = trim((string)($body['role'] ?? 'Front Desk'));

            if ($fullName === '') {
                json_response(['error' => 'Full name is required.'], 400);
            }
            if ($username === '') {
                json_response(['error' => 'Username is required.'], 400);
            }
            if ($password === '' || strlen($password) < 4) {
                json_response(['error' => 'Password must be at least 4 characters.'], 400);
            }

            $trimmedUser = strtolower($username);
            $trimmedEmail = ($email !== '') ? strtolower($email) : ($trimmedUser . '@hotel.in');

            $existing = query(
                "SELECT user_id FROM users WHERE LOWER(username) = ? OR (email IS NOT NULL AND LOWER(email) = ?) LIMIT 1",
                [$trimmedUser, $trimmedEmail]
            );
            if (!empty($existing)) {
                json_response(['error' => 'A staff account with this username or email already exists.'], 400);
            }

            $targetNorm = normalize_role($role);
            $roles = query(
                "SELECT role_id, role_code, role_name FROM roles WHERE LOWER(role_name) = LOWER(?) OR LOWER(role_code) = LOWER(?) LIMIT 1",
                [$role, $targetNorm]
            );
            if (empty($roles)) {
                json_response(['error' => sprintf("Invalid role '%s'.", $role)], 400);
            }

            $roleObj = $roles[0];
            $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

            $result = query(
                "INSERT INTO users (role_id, username, email, full_name, password_hash, is_active, is_on_duty, created_at, last_login_at)
                 VALUES (?, ?, ?, ?, ?, 1, 0, NOW(), NOW())",
                [$roleObj['role_id'], $trimmedUser, $trimmedEmail, $fullName, $hashedPassword]
            );

            $newUserId = $result['insertId'];

            log_activity(
                $newUserId,
                "Staff Registered",
                "users",
                $newUserId,
                sprintf("New staff account registered: %s as %s (%s).", $fullName, $roleObj['role_name'], $trimmedUser)
            );

            $newUser = [
                'user_id' => $newUserId,
                'username' => $trimmedUser,
                'email' => $trimmedEmail,
                'full_name' => $fullName,
                'role_name' => $roleObj['role_name'],
                'role_code' => $roleObj['role_code'],
            ];
            $token = generate_token($newUser, false);

            json_response([
                'success' => true,
                'message' => 'Account registered successfully.',
                'token' => $token,
                'user' => [
                    'user_id' => $newUserId,
                    'username' => $trimmedUser,
                    'email' => $trimmedEmail,
                    'full_name' => $fullName,
                    'role' => $roleObj['role_name'],
                    'role_code' => $roleObj['role_code'],
                    'is_on_duty' => false,
                ]
            ]);
        } catch (Exception $err) {
            error_log('[Register Error] ' . $err->getMessage());
            json_response(['error' => 'Server error during registration.'], 500);
        }
    }

    if ($method === 'GET' && $path === '/me') {
        $authUser = authenticate();
        try {
            $users = query(
                "SELECT u.user_id, u.username, u.email, u.full_name, u.is_active, u.is_on_duty,
                        r.role_code, r.role_name
                 FROM users u
                 JOIN roles r ON u.role_id = r.role_id
                 WHERE u.user_id = ?",
                [$authUser['user_id']]
            );

            if (empty($users) || empty($users[0]['is_active'])) {
                json_response(['error' => 'User no longer active or found'], 401);
            }

            $u = $users[0];
            $u['user_id'] = (int)$u['user_id'];
            $u['is_active'] = (bool)$u['is_active'];
            $u['is_on_duty'] = (bool)$u['is_on_duty'];

            json_response(['success' => true, 'user' => $u]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    if ($method === 'POST' && $path === '/logout') {
        $authUser = authenticate();
        try {
            log_activity(
                $authUser['user_id'],
                "User Logout",
                "users",
                $authUser['user_id'],
                sprintf("%s signed out.", $authUser['full_name'] ?? 'User')
            );
            json_response(['success' => true]);
        } catch (Exception $err) {
            json_response(['error' => $err->getMessage()], 500);
        }
    }

    json_response(['error' => 'Endpoint not found'], 404);
}
