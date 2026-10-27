<?php
require_once __DIR__ . '/config.php';

function normalize_role($role) {
    if (!$role) {
        return '';
    }
    $r = strtolower(trim((string)$role));
    $r = str_replace([' ', '_', '-'], '', $r);
    if ($r === 'admin' || $r === 'administrator') {
        return 'admin';
    }
    if ($r === 'frontdesk' || $r === 'front' || $r === 'reception') {
        return 'frontdesk';
    }
    if ($r === 'housekeeping' || $r === 'cleaning') {
        return 'housekeeping';
    }
    if ($r === 'billing' || $r === 'accountant' || $r === 'accounts') {
        return 'billing';
    }
    return $r;
}

function jwt_base64_url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function jwt_base64_url_decode($data) {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $padlen = 4 - $remainder;
        $data .= str_repeat('=', $padlen);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function generate_token($user, $keep_signed = false) {
    $duration = $keep_signed ? (30 * 24 * 3600) : (24 * 3600);
    $now = time();
    $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
    $payload = json_encode([
        'user_id' => (int)$user['user_id'],
        'username' => (string)$user['username'],
        'email' => $user['email'] ?? null,
        'full_name' => $user['full_name'] ?? null,
        'role' => $user['role_name'] ?? $user['role'] ?? null,
        'role_code' => $user['role_code'] ?? null,
        'iat' => $now,
        'exp' => $now + $duration,
    ]);

    $base64UrlHeader = jwt_base64_url_encode($header);
    $base64UrlPayload = jwt_base64_url_encode($payload);
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);
    $base64UrlSignature = jwt_base64_url_encode($signature);

    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

function verify_token($token) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        throw new Exception("Invalid token structure");
    }

    list($base64UrlHeader, $base64UrlPayload, $base64UrlSignature) = $parts;

    $signature = jwt_base64_url_decode($base64UrlSignature);
    $expectedSignature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);

    if (!hash_equals($expectedSignature, $signature)) {
        throw new Exception("Invalid token signature");
    }

    $payload = json_decode(jwt_base64_url_decode($base64UrlPayload), true);
    if (!$payload) {
        throw new Exception("Invalid token payload");
    }

    if (isset($payload['exp']) && $payload['exp'] < time()) {
        throw new Exception("Token has expired. Please log in again.");
    }

    return $payload;
}

function get_auth_header() {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return trim($_SERVER['HTTP_AUTHORIZATION']);
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    }
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $k => $v) {
            if (strcasecmp($k, 'Authorization') === 0) {
                return trim($v);
            }
        }
    }
    return null;
}

function authenticate() {
    $authHeader = get_auth_header();
    if (!$authHeader || !str_starts_with($authHeader, 'Bearer ')) {
        http_response_code(401);
        echo json_encode(['error' => 'Authorization token required']);
        exit;
    }

    $token = trim(substr($authHeader, 7));
    try {
        $decoded = verify_token($token);
        $GLOBALS['auth_user'] = $decoded;
        return $decoded;
    } catch (Exception $err) {
        http_response_code(401);
        if (str_contains($err->getMessage(), 'expired')) {
            echo json_encode(['error' => 'Token has expired. Please log in again.']);
        } else {
            echo json_encode(['error' => 'Invalid token', 'details' => $err->getMessage()]);
        }
        exit;
    }
}

function authorize(...$allowedRoles) {
    $user = $GLOBALS['auth_user'] ?? null;
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }

    $userRole = normalize_role($user['role_code'] ?? $user['role'] ?? '');

    // Administrators can access any portal
    if ($userRole === 'admin') {
        return true;
    }

    $normalizedAllowed = array_map('normalize_role', $allowedRoles);
    if (!in_array($userRole, $normalizedAllowed, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied: insufficient permissions for this portal']);
        exit;
    }

    return true;
}
