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
        // Migrações automáticas — executadas silenciosamente na primeira conexão
        $migrations = [
            "ALTER TABLE `usuarios` ADD COLUMN `boss_dmg_x2` TINYINT(1) NOT NULL DEFAULT 0",
            "ALTER TABLE `usuarios` ADD COLUMN `criado_em`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE `usuarios` ADD COLUMN `ultimo_visto` TIMESTAMP NULL DEFAULT NULL",
            "CREATE TABLE IF NOT EXISTS `transacoes` (
                `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `user_id`          INT UNSIGNED NOT NULL,
                `item_id`          VARCHAR(50)  NOT NULL,
                `item_tipo`        VARCHAR(20)  NOT NULL,
                `valor`            DECIMAL(10,2) NOT NULL,
                `status`           ENUM('pending','approved','rejected','cancelled','refunded') NOT NULL DEFAULT 'pending',
                `mp_payment_id`    VARCHAR(100) NULL DEFAULT NULL,
                `mp_preference_id` VARCHAR(100) NULL DEFAULT NULL,
                `criado_em`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `atualizado_em`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_tx_user`   (`user_id`),
                KEY `idx_tx_mp_pay` (`mp_payment_id`),
                KEY `idx_tx_status` (`status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ];
        foreach ($migrations as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) { /* coluna/tabela já existe */ }
        }
    }
    return $pdo;
}
