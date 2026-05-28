<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function out(array $d, int $c = 200): void {
    http_response_code($c);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

// Ensure table exists on first call
try {
    db()->exec("
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
} catch (PDOException $e) { /* already exists */ }

$ct    = $_SERVER['CONTENT_TYPE'] ?? '';
$input = strpos($ct, 'application/json') !== false
       ? (json_decode(file_get_contents('php://input'), true) ?? [])
       : $_POST;
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {

case 'submit': {
    if (empty($_SESSION['uid'])) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);

    $neurons   = max(0, (float)($input['lifetime_neurons'] ?? 0));
    $level     = max(1, min(99999, (int)($input['level']          ?? 1)));
    $prestiges = max(0,           (int)($input['total_prestiges'] ?? 0));
    $vip       = empty($input['vip']) ? 0 : 1;

    try {
        db()->prepare("
            INSERT INTO leaderboard (user_id, lifetime_neurons, level, total_prestiges, vip)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                lifetime_neurons = GREATEST(lifetime_neurons, VALUES(lifetime_neurons)),
                level            = VALUES(level),
                total_prestiges  = VALUES(total_prestiges),
                vip              = VALUES(vip),
                updated_at       = CURRENT_TIMESTAMP
        ")->execute([$_SESSION['uid'], $neurons, $level, $prestiges, $vip]);
        out(['ok' => true]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao salvar.'], 500);
    }
    break;
}

case 'top': {
    $limit = min(50, max(1, (int)($_GET['limit'] ?? 50)));
    try {
        $s = db()->prepare("
            SELECT l.user_id AS id, u.nome_usuario AS username, u.foto,
                   l.lifetime_neurons, l.level, l.total_prestiges, l.vip
            FROM leaderboard l
            INNER JOIN usuarios u ON l.user_id = u.id
            ORDER BY l.lifetime_neurons DESC
            LIMIT ?
        ");
        $s->execute([$limit]);
        $rows    = $s->fetchAll(PDO::FETCH_ASSOC);
        $entries = array_map(fn($r) => [
            'id'              => (int)$r['id'],
            'username'        => $r['username'],
            'foto'            => $r['foto'],
            'lifetimeNeurons' => (float)$r['lifetime_neurons'],
            'level'           => (int)$r['level'],
            'totalPrestiges'  => (int)$r['total_prestiges'],
            'vip'             => (bool)$r['vip'],
        ], $rows);
        out(['ok' => true, 'entries' => $entries]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao buscar.'], 500);
    }
    break;
}

case 'rank': {
    if (empty($_SESSION['uid'])) out(['ok' => false, 'rank' => null]);
    try {
        $s1 = db()->prepare("SELECT lifetime_neurons FROM leaderboard WHERE user_id = ?");
        $s1->execute([$_SESSION['uid']]);
        $row = $s1->fetch();
        if (!$row) out(['ok' => false, 'rank' => null]);

        $s2 = db()->prepare("SELECT COUNT(*) + 1 AS rank FROM leaderboard WHERE lifetime_neurons > ?");
        $s2->execute([(float)$row['lifetime_neurons']]);
        $r = $s2->fetch();
        out(['ok' => true, 'rank' => $r ? (int)$r['rank'] : null]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'rank' => null]);
    }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
