<?php
/**
 * Nexarion Infinity — Database setup.
 * Run once (or anytime) to create / verify all tables.
 * Access: http://localhost/<nome-da-pasta>/api/setup.php
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

$criadas = [];
$erros   = [];

function exec_sql(PDO $pdo, string $sql, string $nome, array &$criadas, array &$erros): void {
    try { $pdo->exec($sql); $criadas[] = $nome; }
    catch (PDOException $e) { $erros[] = "$nome: " . $e->getMessage(); }
}

try {
    $pdo = db();

    // ── Usuários ──────────────────────────────────────────────────────────────
    exec_sql($pdo, "
        CREATE TABLE IF NOT EXISTS `usuarios` (
            `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `foto`         VARCHAR(255) NULL DEFAULT NULL,
            `nome_usuario` VARCHAR(50)  NOT NULL,
            `email`        VARCHAR(150) NOT NULL,
            `senha`        VARCHAR(255) NOT NULL,
            `criado_em`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_email`        (`email`),
            UNIQUE KEY `uq_nome_usuario` (`nome_usuario`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ", 'usuarios', $criadas, $erros);

    // ── Progresso do jogo (save server-side) ──────────────────────────────────
    exec_sql($pdo, "
        CREATE TABLE IF NOT EXISTS `progresso` (
            `user_id`       INT UNSIGNED NOT NULL PRIMARY KEY,
            `dados`         MEDIUMTEXT   NOT NULL,
            `atualizado_em` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT `fk_prog_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ", 'progresso', $criadas, $erros);

    // ── Placar global (ranking) ───────────────────────────────────────────────
    exec_sql($pdo, "
        CREATE TABLE IF NOT EXISTS `placar` (
            `user_id`          INT UNSIGNED    NOT NULL,
            `neuronios_vitais` DOUBLE          NOT NULL DEFAULT 0,
            `nivel`            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            `total_prestigios` INT UNSIGNED    NOT NULL DEFAULT 0,
            `total_cliques`    BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `vip`              TINYINT(1)      NOT NULL DEFAULT 0,
            `atualizado_em`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`user_id`),
            KEY `idx_neuronios`  (`neuronios_vitais` DESC),
            KEY `idx_nivel`      (`nivel` DESC),
            KEY `idx_prestigios` (`total_prestigios` DESC),
            KEY `idx_cliques`    (`total_cliques` DESC),
            CONSTRAINT `fk_placar_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ", 'placar', $criadas, $erros);

    // ── Chefe individual por jogador ──────────────────────────────────────────
    exec_sql($pdo, "
        CREATE TABLE IF NOT EXISTS `chefes_jogador` (
            `user_id`     INT UNSIGNED NOT NULL PRIMARY KEY,
            `nivel`       INT UNSIGNED NOT NULL DEFAULT 1,
            `tipo`        VARCHAR(50)  NOT NULL DEFAULT 'cyber_boss',
            `raridade`    ENUM('rare','epic','legendary') NOT NULL DEFAULT 'rare',
            `hp_max`      DOUBLE       NOT NULL DEFAULT 2000000,
            `hp_atual`    DOUBLE       NOT NULL DEFAULT 2000000,
            `iniciado_em` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT `fk_cj_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ", 'chefes_jogador', $criadas, $erros);

    // ── Dano vitalício + abates de chefe ──────────────────────────────────────
    exec_sql($pdo, "
        CREATE TABLE IF NOT EXISTS `dano_chefe_vitalicio` (
            `user_id`    INT UNSIGNED NOT NULL PRIMARY KEY,
            `total_dano` DOUBLE       NOT NULL DEFAULT 0,
            `abates`     INT UNSIGNED NOT NULL DEFAULT 0,
            KEY `idx_dano`   (`total_dano` DESC),
            KEY `idx_abates` (`abates` DESC),
            CONSTRAINT `fk_dcv_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ", 'dano_chefe_vitalicio', $criadas, $erros);

    // ── Migração: leaderboard → placar (se existir) ───────────────────────────
    try {
        $pdo->exec("
            INSERT IGNORE INTO `placar` (user_id, neuronios_vitais, nivel, total_prestigios, vip)
            SELECT user_id, lifetime_neurons, level, total_prestiges, vip FROM `leaderboard`
        ");
        $criadas[] = 'migração leaderboard→placar';
    } catch (PDOException $e) { /* tabela legada pode não existir */ }

    // ── Migração: boss_damage_lifetime → dano_chefe_vitalicio ─────────────────
    try {
        $pdo->exec("
            INSERT IGNORE INTO `dano_chefe_vitalicio` (user_id, total_dano)
            SELECT user_id, total_damage FROM `boss_damage_lifetime`
        ");
        $criadas[] = 'migração boss_damage_lifetime→dano_chefe_vitalicio';
    } catch (PDOException $e) { /* tabela legada pode não existir */ }

    // ── Migração: user_boss_level → chefes_jogador.nivel ─────────────────────
    try {
        $pdo->exec("
            INSERT IGNORE INTO `chefes_jogador` (user_id, nivel, hp_max, hp_atual)
            SELECT ubl.user_id,
                   ubl.boss_level,
                   2000000 * POW(GREATEST(1, ubl.boss_level), 1.35),
                   2000000 * POW(GREATEST(1, ubl.boss_level), 1.35)
            FROM `user_boss_level` ubl
        ");
        $criadas[] = 'migração user_boss_level→chefes_jogador';
    } catch (PDOException $e) { /* tabela legada pode não existir */ }

    // ── Adicionar colunas de timer/cooldown à tabela chefes_jogador ──────────────
    try { $pdo->exec("ALTER TABLE `chefes_jogador` ADD COLUMN `expira_em` TIMESTAMP NULL DEFAULT NULL"); $criadas[] = 'col chefes_jogador.expira_em'; }
    catch (PDOException $e) { /* já existe */ }
    try { $pdo->exec("ALTER TABLE `chefes_jogador` ADD COLUMN `proximo_em` TIMESTAMP NULL DEFAULT NULL"); $criadas[] = 'col chefes_jogador.proximo_em'; }
    catch (PDOException $e) { /* já existe */ }
    // Inicializar timer para registros sem expira_em
    try { $pdo->exec("UPDATE `chefes_jogador` SET expira_em = DATE_ADD(NOW(), INTERVAL 5 MINUTE) WHERE expira_em IS NULL AND proximo_em IS NULL"); }
    catch (PDOException $e) { /* ignore */ }

    // ── Resetar bosses expirados ou com expira_em antiga (fresh start) ────────────
    try {
        $pdo->exec("
            UPDATE `chefes_jogador`
            SET expira_em  = DATE_ADD(NOW(), INTERVAL 300 SECOND),
                proximo_em = NULL
            WHERE expira_em IS NULL
               OR expira_em < NOW()
               OR proximo_em IS NOT NULL
        ");
        $criadas[] = 'reset bosses expirados';
    } catch (PDOException $e) { /* ignore */ }

    // ── Adicionar colunas de compras à tabela usuarios (safe ALTER) ────────────
    $novaColunas = [
        'vip'          => 'TINYINT(1) NOT NULL DEFAULT 0',
        'double_neuron'=> 'TINYINT(1) NOT NULL DEFAULT 0',
        'diamantes'    => 'INT UNSIGNED NOT NULL DEFAULT 0',
        'skins'        => 'TEXT NULL DEFAULT NULL',
        'skin_ativa'   => 'VARCHAR(50) NULL DEFAULT NULL',
    ];
    foreach ($novaColunas as $col => $def) {
        try { $pdo->exec("ALTER TABLE `usuarios` ADD COLUMN `$col` $def"); $criadas[] = "col usuarios.$col"; }
        catch (PDOException $e) { /* coluna já existe */ }
    }

    // ── Colunas de timestamp ─────────────────────────────────────────────────
    try { $pdo->exec("ALTER TABLE `usuarios` ADD COLUMN `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"); $criadas[] = 'col usuarios.criado_em'; }
    catch (PDOException $e) { /* já existe */ }
    try { $pdo->exec("ALTER TABLE `usuarios` ADD COLUMN `ultimo_visto` TIMESTAMP NULL DEFAULT NULL"); $criadas[] = 'col usuarios.ultimo_visto'; }
    catch (PDOException $e) { /* já existe */ }
    try { $pdo->exec("ALTER TABLE `usuarios` ADD INDEX `idx_usr_visto` (`ultimo_visto`)"); $criadas[] = 'idx usuarios.ultimo_visto'; }
    catch (PDOException $e) { /* já existe */ }

    // ── Sistema de amizades ───────────────────────────────────────────────────
    exec_sql($pdo, "
        CREATE TABLE IF NOT EXISTS `amizades` (
            `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id`    INT UNSIGNED NOT NULL,
            `friend_id`  INT UNSIGNED NOT NULL,
            `status`     ENUM('pending','accepted') NOT NULL DEFAULT 'pending',
            `criado_em`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_amizade` (`user_id`, `friend_id`),
            KEY `idx_am_friend` (`friend_id`),
            KEY `idx_am_status` (`status`),
            CONSTRAINT `fk_am_user`   FOREIGN KEY (`user_id`)   REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_am_friend` FOREIGN KEY (`friend_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ", 'amizades', $criadas, $erros);

    // ── Índices de performance para queries comuns ────────────────────────────
    // progresso: lookup por user_id (PK já cobre, mas garantir índice em atualizado_em para cleanup)
    try { $pdo->exec("ALTER TABLE `progresso` ADD INDEX `idx_prog_atualizado` (`atualizado_em`)"); $criadas[] = 'idx progresso.atualizado_em'; }
    catch (PDOException $e) { /* já existe */ }

    // usuarios: lookup por nome_usuario (já tem UNIQUE, confirmar)
    try { $pdo->exec("ALTER TABLE `usuarios` ADD INDEX `idx_usr_criado` (`criado_em`)"); $criadas[] = 'idx usuarios.criado_em'; }
    catch (PDOException $e) { /* já existe */ }

    // chefes_jogador: índice em expira_em para queries de boss expirado
    try { $pdo->exec("ALTER TABLE `chefes_jogador` ADD INDEX `idx_cj_expira` (`expira_em`)"); $criadas[] = 'idx chefes_jogador.expira_em'; }
    catch (PDOException $e) { /* já existe */ }

    // ── Coluna boss_dmg_x2 em usuarios ───────────────────────────────────────
    try { $pdo->exec("ALTER TABLE `usuarios` ADD COLUMN `boss_dmg_x2` TINYINT(1) NOT NULL DEFAULT 0"); $criadas[] = 'col usuarios.boss_dmg_x2'; }
    catch (PDOException $e) { /* já existe */ }

    // ── Tabela de transações de pagamento ─────────────────────────────────────
    exec_sql($pdo, "
        CREATE TABLE IF NOT EXISTS `transacoes` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ", 'transacoes', $criadas, $erros);

    echo json_encode(['ok' => true, 'criadas' => $criadas, 'erros' => $erros]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'msg' => $e->getMessage()]);
}
