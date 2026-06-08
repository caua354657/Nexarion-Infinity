<?php
/**
 * Nexarion Infinity — Click Battle API
 * Actions: invite, respond, poll, click, finish, cancel
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

const BATTLE_SECS = 60;

try {
    db()->exec("
        CREATE TABLE IF NOT EXISTS `batalhas_clique` (
            `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `challenger_id`     INT UNSIGNED NOT NULL,
            `challenged_id`     INT UNSIGNED NOT NULL,
            `status`            ENUM('pending','active','finished','declined','cancelled') NOT NULL DEFAULT 'pending',
            `started_at`        TIMESTAMP NULL DEFAULT NULL,
            `clicks_challenger` INT UNSIGNED NOT NULL DEFAULT 0,
            `clicks_challenged` INT UNSIGNED NOT NULL DEFAULT 0,
            `winner_id`         INT UNSIGNED NULL DEFAULT NULL,
            `criado_em`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_bt_chgr` (`challenger_id`),
            KEY `idx_bt_chgd` (`challenged_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
} catch (PDOException $e) {}

switch ($action) {

// ── Send battle invite ────────────────────────────────────────────────────────
case 'invite': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $fid = (int)($raw['friend_id'] ?? 0);
    if (!$fid || $fid === (int)$uid) out(['ok' => false, 'msg' => 'ID inválido.']);
    try {
        $pdo = db();
        $chk = $pdo->prepare("
            SELECT id FROM amizades
            WHERE ((user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?))
              AND status='accepted'
        ");
        $chk->execute([$uid, $fid, $fid, $uid]);
        if (!$chk->fetch()) out(['ok' => false, 'msg' => 'Vocês não são amigos.']);

        // Cancel any stale pending/active battle for either player
        $pdo->prepare("
            UPDATE batalhas_clique SET status='cancelled'
            WHERE status IN ('pending','active')
              AND (challenger_id IN (?,?) OR challenged_id IN (?,?))
        ")->execute([$uid, $fid, $uid, $fid]);

        $pdo->prepare("INSERT INTO batalhas_clique (challenger_id, challenged_id) VALUES (?, ?)")
            ->execute([$uid, $fid]);
        out(['ok' => true, 'battle_id' => (int)$pdo->lastInsertId()]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro ao criar batalha.']);
    }
    break;
}

// ── Respond to invite (accept / decline) ─────────────────────────────────────
case 'respond': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $bid    = (int)($raw['battle_id'] ?? 0);
    $accept = !empty($raw['accept']);
    try {
        $pdo = db();
        $s = $pdo->prepare("SELECT * FROM batalhas_clique WHERE id=? AND challenged_id=? AND status='pending'");
        $s->execute([$bid, $uid]);
        if (!$s->fetch()) out(['ok' => false, 'msg' => 'Batalha não encontrada.']);
        if (!$accept) {
            $pdo->prepare("UPDATE batalhas_clique SET status='declined' WHERE id=?")->execute([$bid]);
            out(['ok' => true, 'accepted' => false]);
        }
        $pdo->prepare("UPDATE batalhas_clique SET status='active', started_at=NOW() WHERE id=?")->execute([$bid]);
        out(['ok' => true, 'accepted' => true]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro ao responder.']);
    }
    break;
}

// ── Poll current battle state ─────────────────────────────────────────────────
case 'poll': {
    if (!$uid) out(['ok' => true, 'battle' => null]);
    try {
        $pdo = db();
        $s = $pdo->prepare("
            SELECT b.*,
                   u1.nome_usuario AS challenger_name, u1.foto AS challenger_foto,
                   u2.nome_usuario AS challenged_name, u2.foto AS challenged_foto,
                   COALESCE(TIMESTAMPDIFF(SECOND, b.started_at, NOW()), 0) AS elapsed_secs
            FROM batalhas_clique b
            JOIN usuarios u1 ON u1.id = b.challenger_id
            JOIN usuarios u2 ON u2.id = b.challenged_id
            WHERE (b.challenger_id=? OR b.challenged_id=?)
              AND b.status IN ('pending','active','finished','declined')
              AND b.criado_em > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
            ORDER BY b.id DESC LIMIT 1
        ");
        $s->execute([$uid, $uid]);
        $b = $s->fetch(PDO::FETCH_ASSOC);
        if (!$b) out(['ok' => true, 'battle' => null]);

        // Auto-finish if server clock says time's up (elapsed calculated entirely in MySQL)
        if ($b['status'] === 'active' && $b['started_at']) {
            $elapsed = (int)$b['elapsed_secs'];
            if ($elapsed > BATTLE_SECS + 5) {
                $cc = (int)$b['clicks_challenger'];
                $cd = (int)$b['clicks_challenged'];
                $winner = $cc > $cd ? (int)$b['challenger_id'] : ($cd > $cc ? (int)$b['challenged_id'] : null);
                $pdo->prepare("UPDATE batalhas_clique SET status='finished', winner_id=? WHERE id=? AND status='active'")
                    ->execute([$winner, (int)$b['id']]);
                $b['status']    = 'finished';
                $b['winner_id'] = $winner;
            }
        }

        $isChg = (int)$b['challenger_id'] === (int)$uid;
        $my    = (int)($isChg ? $b['clicks_challenger'] : $b['clicks_challenged']);
        $opp   = (int)($isChg ? $b['clicks_challenged'] : $b['clicks_challenger']);
        $elapsed = $b['started_at'] ? max(0, (int)$b['elapsed_secs']) : 0;

        out(['ok' => true, 'battle' => [
            'id'            => (int)$b['id'],
            'status'        => $b['status'],
            'is_challenger' => $isChg,
            'elapsed'       => $elapsed,
            'my_clicks'     => $my,
            'opp_clicks'    => $opp,
            'opp_name'      => $isChg ? $b['challenged_name'] : $b['challenger_name'],
            'opp_foto'      => $isChg ? $b['challenged_foto'] : $b['challenger_foto'],
            'winner_id'     => $b['winner_id'] ? (int)$b['winner_id'] : null,
            'i_won'         => $b['winner_id'] !== null ? ((int)$b['winner_id'] === (int)$uid) : null,
            'is_draw'       => $b['status'] === 'finished' && $b['winner_id'] === null,
        ]]);
    } catch (PDOException $e) {
        out(['ok' => true, 'battle' => null]);
    }
    break;
}

// ── Sync clicks during battle ─────────────────────────────────────────────────
case 'click': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $bid    = (int)($raw['battle_id'] ?? 0);
    $clicks = max(0, min(3000, (int)($raw['clicks'] ?? 0)));
    try {
        $pdo = db();
        $s = $pdo->prepare("SELECT *, COALESCE(TIMESTAMPDIFF(SECOND, started_at, NOW()), 0) AS elapsed_secs FROM batalhas_clique WHERE id=? AND status='active'");
        $s->execute([$bid]);
        $b = $s->fetch(PDO::FETCH_ASSOC);
        if (!$b) out(['ok' => false, 'msg' => 'Batalha não ativa.']);
        if ((int)$b['elapsed_secs'] > BATTLE_SECS + 5) out(['ok' => false, 'msg' => 'Tempo encerrado.']);
        $isChg = (int)$b['challenger_id'] === (int)$uid;
        $col   = $isChg ? 'clicks_challenger' : 'clicks_challenged';
        $pdo->prepare("UPDATE batalhas_clique SET {$col}=? WHERE id=?")->execute([$clicks, $bid]);
        $oppClicks = (int)($isChg ? $b['clicks_challenged'] : $b['clicks_challenger']);
        out(['ok' => true, 'opp_clicks' => $oppClicks]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro.']);
    }
    break;
}

// ── Final click submit + trigger finish ──────────────────────────────────────
case 'finish': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $bid    = (int)($raw['battle_id'] ?? 0);
    $clicks = max(0, min(3000, (int)($raw['clicks'] ?? 0)));
    try {
        $pdo = db();
        $s = $pdo->prepare("SELECT *, COALESCE(TIMESTAMPDIFF(SECOND, started_at, NOW()), 0) AS elapsed_secs FROM batalhas_clique WHERE id=? AND status='active'");
        $s->execute([$bid]);
        $b = $s->fetch(PDO::FETCH_ASSOC);
        if (!$b) out(['ok' => true]); // already finished

        $col = ((int)$b['challenger_id'] === (int)$uid) ? 'clicks_challenger' : 'clicks_challenged';
        $pdo->prepare("UPDATE batalhas_clique SET {$col}=? WHERE id=?")->execute([$clicks, $bid]);

        // Finalize if enough time has elapsed (allow 3s early for clock drift)
        if ((int)$b['elapsed_secs'] >= BATTLE_SECS - 3) {
            $cc = (int)($col === 'clicks_challenger' ? $clicks : $b['clicks_challenger']);
            $cd = (int)($col === 'clicks_challenged' ? $clicks : $b['clicks_challenged']);
            $winner = $cc > $cd ? (int)$b['challenger_id'] : ($cd > $cc ? (int)$b['challenged_id'] : null);
            $pdo->prepare("UPDATE batalhas_clique SET status='finished', winner_id=? WHERE id=? AND status='active'")
                ->execute([$winner, $bid]);
        }
        out(['ok' => true]);
    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro.']);
    }
    break;
}

// ── Cancel pending invite ─────────────────────────────────────────────────────
case 'cancel': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    $bid = (int)($raw['battle_id'] ?? 0);
    try {
        db()->prepare("UPDATE batalhas_clique SET status='cancelled' WHERE id=? AND challenger_id=? AND status='pending'")
            ->execute([$bid, $uid]);
        out(['ok' => true]);
    } catch (PDOException $e) { out(['ok' => false, 'msg' => 'Erro.']); }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
