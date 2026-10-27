<?php
require_once __DIR__ . '/config.php';

function get_db() {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, $options);
        } catch (PDOException $e) {
            error_log('[Database Connection Error] ' . $e->getMessage());
            throw $e;
        }
    }
    return $pdo;
}

function query($sql, $params = []) {
    $pdo = get_db();
    $stmt = $pdo->prepare($sql);
    
    // Bind parameters if any
    if (!empty($params)) {
        // Support indexed array (from 1) or assoc array
        $i = 1;
        foreach ($params as $key => $val) {
            $paramKey = is_int($key) ? $i++ : $key;
            if (is_null($val)) {
                $stmt->bindValue($paramKey, null, PDO::PARAM_NULL);
            } elseif (is_bool($val)) {
                $stmt->bindValue($paramKey, $val ? 1 : 0, PDO::PARAM_INT);
            } elseif (is_int($val)) {
                $stmt->bindValue($paramKey, $val, PDO::PARAM_INT);
            } else {
                $stmt->bindValue($paramKey, (string)$val, PDO::PARAM_STR);
            }
        }
    }
    
    $stmt->execute();
    
    $trimmed = strtoupper(ltrim($sql));
    if (str_starts_with($trimmed, 'SELECT') ||
        str_starts_with($trimmed, 'SHOW') ||
        str_starts_with($trimmed, 'DESCRIBE') ||
        str_starts_with($trimmed, 'EXPLAIN')) {
        return $stmt->fetchAll();
    }
    
    $lastId = (int)$pdo->lastInsertId();
    $rowCount = $stmt->rowCount();
    return [
        'insertId' => $lastId,
        'affectedRows' => $rowCount,
        'lastrowid' => $lastId,
        'rowcount' => $rowCount,
    ];
}

function db_begin() {
    $pdo = get_db();
    if (!$pdo->inTransaction()) {
        $pdo->beginTransaction();
    }
}

function db_commit() {
    $pdo = get_db();
    if ($pdo->inTransaction()) {
        $pdo->commit();
    }
}

function db_rollback() {
    $pdo = get_db();
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}

function db_transaction(callable $callback) {
    $pdo = get_db();
    try {
        db_begin();
        $result = $callback($pdo);
        db_commit();
        return $result;
    } catch (Exception $e) {
        db_rollback();
        throw $e;
    }
}

function log_activity($userId, $action, $entityType = null, $entityId = null, $description = null) {
    try {
        query(
            "INSERT INTO activity_log (user_id, action, entity_type, entity_id, description, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())",
            [$userId ? (int)$userId : null, $action, $entityType, $entityId, $description]
        );
    } catch (Exception $err) {
        error_log("[ActivityLog Error] " . $err->getMessage());
    }
}

function create_notification($userId, $title, $message) {
    try {
        query(
            "INSERT INTO notifications (user_id, title, message, is_read, created_at)
             VALUES (?, ?, ?, 0, NOW())",
            [$userId ? (int)$userId : null, $title, $message]
        );
    } catch (Exception $err) {
        error_log("[Notification Error] " . $err->getMessage());
    }
}
