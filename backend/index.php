<?php
// Set timezone
date_default_timezone_set('Asia/Kolkata');

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Global response helper
function json_response($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Request path parsing
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH);

// Built-in server static file check
if (php_sapi_name() === 'cli-server') {
    $file = __DIR__ . $path;
    if ($path !== '/' && is_file($file)) {
        return false;
    }
}

// Method
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Parse Body
$rawInput = file_get_contents('php://input');
$body = [];
if ($rawInput !== false && trim($rawInput) !== '') {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}
if (empty($body) && !empty($_POST)) {
    $body = $_POST;
}

// Query parameters
$queryParams = $_GET ?? [];

// Include config & db
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_middleware.php';

try {
    // Health Check
    if ($path === '/api/health' || $path === '/health') {
        json_response([
            'status' => 'online',
            'app' => 'VEYRA Hotel Management API (PHP Backend)',
            'database' => DB_NAME,
            'host' => DB_HOST . ':' . DB_PORT,
            'time' => date('c'),
        ]);
    }

    // Auth Routes
    if (str_starts_with($path, '/api/auth')) {
        require_once __DIR__ . '/routes/auth.php';
        $subpath = substr($path, strlen('/api/auth'));
        if ($subpath === '') $subpath = '/';
        handle_auth_routes($method, $subpath, $body, $queryParams);
    }

    // Admin Routes
    if (str_starts_with($path, '/api/admin')) {
        require_once __DIR__ . '/routes/admin.php';
        $subpath = substr($path, strlen('/api/admin'));
        if ($subpath === '') $subpath = '/';
        handle_admin_routes($method, $subpath, $body, $queryParams);
    }

    // Front Desk Routes
    if (str_starts_with($path, '/api/frontdesk')) {
        require_once __DIR__ . '/routes/frontdesk.php';
        $subpath = substr($path, strlen('/api/frontdesk'));
        if ($subpath === '') $subpath = '/';
        handle_frontdesk_routes($method, $subpath, $body, $queryParams);
    }

    // Housekeeping Routes
    if (str_starts_with($path, '/api/housekeeping')) {
        require_once __DIR__ . '/routes/housekeeping.php';
        $subpath = substr($path, strlen('/api/housekeeping'));
        if ($subpath === '') $subpath = '/';
        handle_housekeeping_routes($method, $subpath, $body, $queryParams);
    }

    // Billing Routes
    if (str_starts_with($path, '/api/billing')) {
        require_once __DIR__ . '/routes/billing.php';
        $subpath = substr($path, strlen('/api/billing'));
        if ($subpath === '') $subpath = '/';
        handle_billing_routes($method, $subpath, $body, $queryParams);
    }

    // Not Found
    json_response(['error' => 'Endpoint not found'], 404);

} catch (Exception $e) {
    error_log('[Unhandled Server Error] ' . $e->getMessage());
    json_response(['error' => 'Internal server error', 'details' => $e->getMessage()], 500);
}
