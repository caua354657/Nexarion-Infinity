<?php
/**
 * NEXUS CORE — Database setup script.
 * Run once (or anytime) to create / verify the usuarios table.
 * Access via browser: http://localhost/Clicker%20Simulator/api/setup.php
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

try {
    $pdo = db();

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `leaderboard` (
            `user_id`          INT UNSIGNED      NOT NULL,
            `lifetime_neurons` DOUBLE            NOT NULL DEFAULT 0,
            `level`            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            `total_prestiges`  INT UNSIGNED      NOT NULL DEFAULT 0,
            `vip`              TINYINT(1)        NOT NULL DEFAULT 0,
            `updated_at`       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`user_id`),
            KEY `idx_score` (`lifetime_neurons` DESC),
            CONSTRAINT `fk_lb_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `usuarios` (
            `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
            `foto`         VARCHAR(255)    NULL DEFAULT NULL COMMENT 'Filename in /foto/ directory',
            `nome_usuario` VARCHAR(50)     NOT NULL,
            `email`        VARCHAR(150)    NOT NULL,
            `senha`        VARCHAR(255)    NOT NULL COMMENT 'bcrypt hash',
            `created_at`   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_email`        (`email`),
            UNIQUE KEY `uq_nome_usuario` (`nome_usuario`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    echo json_encode([
        'ok'  => true,
        'msg' => 'Tabelas `usuarios` e `leaderboard` criadas (ou já existiam).',
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'ok'  => false,
        'msg' => 'Erro ao criar tabela: ' . $e->getMessage(),
    ]);
}
