<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

echo str_repeat("=", 60) . "\n";
echo "  VEYRA Hotel Management System — PHP Backend Server\n";
echo str_repeat("=", 60) . "\n";

try {
    $res = query("SELECT DATABASE() AS db, VERSION() AS ver");
    $dbName = $res[0]['db'] ?? DB_NAME;
    $ver = $res[0]['ver'] ?? 'Unknown';
    echo "✓ Connected to MySQL database '{$dbName}' at " . DB_HOST . ":" . DB_PORT . "\n";
    echo "  MySQL Server version: {$ver}\n";
} catch (Exception $err) {
    echo "✗ Failed to connect to MySQL database '" . DB_NAME . "': " . $err->getMessage() . "\n";
    exit(1);
}

$port = PORT;
$router = __DIR__ . '/index.php';

echo "✓ Starting VEYRA PHP backend server on http://0.0.0.0:{$port}\n";
echo "  Portals enabled: Auth, Admin, Front Desk, Housekeeping, Billing\n";
echo str_repeat("=", 60) . "\n";

// Launch PHP built-in web server
$cmd = sprintf(
    '%s -S 0.0.0.0:%d %s',
    escapeshellarg(PHP_BINARY),
    $port,
    escapeshellarg($router)
);

passthru($cmd);
