<?php
/**
 * Shared PDO connection for NEXUS CORE API.
 * Include this file in any API script that needs DB access.
 * Returns a singleton PDO instance via db().
 */

define('DB_HOST', 'mysql.escola25dejulho.com.br');
define('DB_NAME', 'escola25dejulh89');
define('DB_USER', 'escola25dejulh89');
define('DB_PASS', 'aula2024');
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
