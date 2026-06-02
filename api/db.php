<?php
/**
 * Shared PDO connection for Nexarion Infinity API.
 * Reads credentials from environment variables (Railway/Docker),
 * falling back to the school DB defaults.
 */

define('DB_HOST',    getenv('DB_HOST')    ?: 'mysql.escola25dejulho.com.br');
define('DB_NAME',    getenv('DB_NAME')    ?: 'escola25dejulh89');
define('DB_USER',    getenv('DB_USER')    ?: 'escola25dejulh89');
define('DB_PASS',    getenv('DB_PASS')    ?: 'aula2024');
define('DB_CHARSET', 'utf8mb4');

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}
