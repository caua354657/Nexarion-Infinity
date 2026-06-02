<?php
/**
 * Nexarion Infinity — Friends System API
 * Actions: search, send, accept, decline, remove, list, profile, heartbeat
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function out(array $d, int $c = 200): void {
    http_response_code($c);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

$uid    = $_SESSION['uid'] ?? null;
$ct     = $_SERVER['CONTENT_TYPE'] ?? '';
$raw    = strpos($ct, 'application/json') !== false
        ? (json_decode(file_get_contents('php://input'), true) ?? [])
        : $_POST;
$action = $raw['action'] ?? $_GET['action'] ?? '';

// Garante que tabelas necessárias e colunas existam antes de qualquer query
try {
    $pdo = db();
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `amizades` (
            `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id`    INT UNSIGNED NOT NULL,
            `friend_id`  INT UNSIGNED NOT NULL,
            `status`     ENUM('pending','accepted') NOT NULL DEFAULT 'pending',
            `criado_em`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_amizade` (`user_id`,`friend_id`),
            KEY `idx_am_friend` (`friend_id`),
            CONSTRAINT `fk_am_u` FOREIGN KEY (`user_id`)   REFERENCES `usuarios`(`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_am_f` FOREIGN KEY (`friend_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `dano_chefe_vitalicio` (
            `user_id`    INT UNSIGNED NOT NULL PRIMARY KEY,
            `total_dano` DOUBLE       NOT NULL DEFAULT 0,
            `abates`     INT UNSIGNED NOT NULL DEFAULT 0,
            CONSTRAINT `fk_dcv_u` FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    try { $pdo->exec("ALTER TABLE `usuarios` ADD COLUMN `ultimo_visto` TIMESTAMP NULL DEFAULT NULL"); } catch (PDOException $e) {}
    try { $pdo->exec("ALTER TABLE `usuarios` ADD COLUMN `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"); } catch (PDOException $e) {}
} catch (PDOException $e) { /* ignore */ }

// Update last seen on every authenticated request
if ($uid) {
    try { db()->prepare("UPDATE usuarios SET ultimo_visto = NOW() WHERE id = ?")->execute([$uid]); }
    catch (PDOException $e) { /* ignore */ }
}

function isOnline(?string $ts): bool {
    if (!$ts) return false;
    return (strtotime($ts) > time() - 300); // online within 5 minutes
}

function fmtUser(array $r): array {
    return [
        'id'       => (int)$r['id'],
        'username' => $r['nome_usuario'],
        'foto'     => $r['foto'],
        'vip'      => (bool)($r['vip'] ?? false),
        'online'   => isOnline($r['ultimo_visto'] ?? null),
        'nivel'    => (int)($r['nivel'] ?? 1),
    ];
}

switch ($action) {

// ── Heartbeat (keep online status alive) ─────────────────────────────────────
case 'heartbeat': {
    if (!$uid) out(['ok' => false], 401);
    out(['ok' => true]);
    break;
}

// ── Search players by username ────────────────────────────────────────────────
case 'search': {
    if (!$uid) out(['ok' => false, 'results' => []], 401);
    $q = trim($_GET['q'] ?? $raw['q'] ?? '');
    if (strlen($q) < 2) out(['ok' => true, 'results' => []]);

    try {
        $pdo = db();
        $s = $pdo->prepare("
            SELECT u.id, u.nome_usuario, u.foto,
                   COALESCE(u.vip, 0) AS vip, u.ultimo_visto,
                   COALESCE(p.nivel, 1) AS nivel,
                   CASE
                       WHEN a1.status = 'accepted' OR a2.status = 'accepted' THEN 'friend'
                       WHEN a1.status = 'pending'                            THEN 'sent'
                       WHEN a2.status = 'pending'                            THEN 'received'
                       ELSE 'none'
                   END AS rel
            FROM usuarios u
            LEFT JOIN placar p  ON u.id = p.user_id
            LEFT JOIN amizades a1 ON a1.user_id = ? AND a1.friend_id = u.id
            LEFT JOIN amizades a2 ON a2.friend_id = ? AND a2.user_id = u.id
            WHERE u.nome_usuario LIKE ? AND u.id != ?
            LIMIT 15
        ");
        $s->execute([$uid, $uid, '%' . $q . '%', $uid]);
        $results = array_map(
            fn($r) => array_merge(fmtUser($r), ['rel' => $r['rel']]),
            $s->fetchAll(PDO::FETCH_ASSOC)
        );
        out(['ok' => true, 'results' => $results]);
    } catch (PDOException $e) {
        out(['ok' => true, 'results' => []]);
    }
    break;
}

// ── Send friend request ───────────────────────────────────────────────────────
case 'send': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $fid = (int)($raw['friend_id'] ?? 0);
    if (!$fid || $fid === (int)$uid) out(['ok' => false, 'msg' => 'ID inválido.']);

    try {
        $pdo = db();
        $chk = $pdo->prepare("SELECT id FROM amizades WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)");
        $chk->execute([$uid, $fid, $fid, $uid]);
        if ($chk->fetch()) out(['ok' => false, 'msg' => 'Já existe um pedido ou amizade.']);
        $pdo->prepare("INSERT INTO amizades (user_id, friend_id, status) VALUES (?, ?, 'pending')")
            ->execute([$uid, $fid]);
        out(['ok' => true]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro ao enviar pedido.']);
    }
    break;
}

// ── Accept friend request ─────────────────────────────────────────────────────
case 'accept': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $fid = (int)($raw['friend_id'] ?? 0);
    try {
        $s = db()->prepare("UPDATE amizades SET status='accepted' WHERE user_id=? AND friend_id=? AND status='pending'");
        $s->execute([$fid, $uid]);
        out(['ok' => true, 'changed' => $s->rowCount() > 0]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro ao aceitar.']);
    }
    break;
}

// ── Decline or cancel request / Remove friend ─────────────────────────────────
case 'decline':
case 'remove': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $fid = (int)($raw['friend_id'] ?? 0);
    try {
        db()->prepare("DELETE FROM amizades WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)")
            ->execute([$uid, $fid, $fid, $uid]);
        out(['ok' => true]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro.']);
    }
    break;
}

// ── Friends list (accepted + pending received + pending sent) ─────────────────
case 'list': {
    if (!$uid) out(['ok' => true, 'friends' => [], 'received' => [], 'sent' => [], 'pending_count' => 0]);
    try {
        $pdo = db();

        $sf = $pdo->prepare("
            SELECT u.id, u.nome_usuario, u.foto, COALESCE(u.vip,0) AS vip,
                   u.ultimo_visto, COALESCE(p.nivel,1) AS nivel
            FROM amizades a
            JOIN   usuarios u ON u.id = IF(a.user_id=?, a.friend_id, a.user_id)
            LEFT JOIN placar p ON u.id = p.user_id
            WHERE (a.user_id=? OR a.friend_id=?) AND a.status='accepted'
            ORDER BY u.ultimo_visto DESC
        ");
        $sf->execute([$uid, $uid, $uid]);

        $sr = $pdo->prepare("
            SELECT u.id, u.nome_usuario, u.foto, COALESCE(u.vip,0) AS vip,
                   u.ultimo_visto, COALESCE(p.nivel,1) AS nivel
            FROM amizades a
            JOIN   usuarios u ON u.id = a.user_id
            LEFT JOIN placar p ON u.id = p.user_id
            WHERE a.friend_id=? AND a.status='pending'
        ");
        $sr->execute([$uid]);

        $ss = $pdo->prepare("
            SELECT u.id, u.nome_usuario, u.foto, COALESCE(u.vip,0) AS vip,
                   u.ultimo_visto, COALESCE(p.nivel,1) AS nivel
            FROM amizades a
            JOIN   usuarios u ON u.id = a.friend_id
            LEFT JOIN placar p ON u.id = p.user_id
            WHERE a.user_id=? AND a.status='pending'
        ");
        $ss->execute([$uid]);

        $received = array_map('fmtUser', $sr->fetchAll(PDO::FETCH_ASSOC));
        out([
            'ok'            => true,
            'friends'       => array_map('fmtUser', $sf->fetchAll(PDO::FETCH_ASSOC)),
            'received'      => $received,
            'sent'          => array_map('fmtUser', $ss->fetchAll(PDO::FETCH_ASSOC)),
            'pending_count' => count($received),
        ]);
    } catch (PDOException $e) {
        // Table issues — return empty gracefully
        out(['ok' => true, 'friends' => [], 'received' => [], 'sent' => [], 'pending_count' => 0]);
    }
    break;
}

// ── Full player profile (for viewing friends) ─────────────────────────────────
case 'profile': {
    $pid = (int)($_GET['id'] ?? $raw['id'] ?? 0);
    if (!$pid) out(['ok' => false, 'msg' => 'ID inválido.']);
    try {
        $pdo = db();
        $s = $pdo->prepare("
            SELECT u.id, u.nome_usuario, u.foto,
                   COALESCE(u.vip, 0)       AS vip,
                   COALESCE(u.diamantes, 0) AS diamantes,
                   u.criado_em, u.ultimo_visto,
                   COALESCE(p.nivel, 1)              AS nivel,
                   COALESCE(p.total_prestigios, 0)   AS total_prestigios,
                   COALESCE(p.total_cliques, 0)      AS total_cliques,
                   COALESCE(p.neuronios_vitais, 0)   AS neuronios_vitais,
                   COALESCE(d.total_dano, 0)         AS total_dano,
                   COALESCE(d.abates, 0)             AS abates,
                   COALESCE(cj.nivel, 0)             AS nivel_chefe
            FROM usuarios u
            LEFT JOIN placar               p  ON u.id = p.user_id
            LEFT JOIN dano_chefe_vitalicio d  ON u.id = d.user_id
            LEFT JOIN chefes_jogador       cj ON u.id = cj.user_id
            WHERE u.id = ?
        ");
        $s->execute([$pid]);
        $r = $s->fetch(PDO::FETCH_ASSOC);
        if (!$r) out(['ok' => false, 'msg' => 'Jogador não encontrado.']);

        $rel = 'none';
        if ($uid && $uid != $pid) {
            $fs = $pdo->prepare("SELECT status, user_id FROM amizades WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?) LIMIT 1");
            $fs->execute([$uid, $pid, $pid, $uid]);
            $fr = $fs->fetch();
            if ($fr) {
                $rel = $fr['status'] === 'accepted' ? 'friend'
                     : ((int)$fr['user_id'] === (int)$uid ? 'sent' : 'received');
            }
        }

        out(['ok' => true, 'profile' => [
            'id'               => (int)$r['id'],
            'username'         => $r['nome_usuario'],
            'foto'             => $r['foto'],
            'vip'              => (bool)$r['vip'],
            'diamantes'        => (int)$r['diamantes'],
            'criado_em'        => $r['criado_em'],
            'online'           => isOnline($r['ultimo_visto']),
            'nivel'            => (int)$r['nivel'],
            'total_prestigios' => (int)$r['total_prestigios'],
            'total_cliques'    => (int)$r['total_cliques'],
            'neuronios_vitais' => (float)$r['neuronios_vitais'],
            'total_dano'       => (float)$r['total_dano'],
            'abates'           => (int)$r['abates'],
            'nivel_chefe'      => (int)$r['nivel_chefe'],
            'rel'              => $rel,
        ]]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro ao buscar perfil.']);
    }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
