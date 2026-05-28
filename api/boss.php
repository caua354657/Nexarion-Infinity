<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function out(array $d, int $c = 200): void {
    http_response_code($c);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Ensure tables exist ────────────────────────────────────────────────────
try {
    $pdo = db();
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `bosses` (
            `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `boss_type`   VARCHAR(50)  NOT NULL,
            `level`       INT UNSIGNED NOT NULL DEFAULT 1,
            `rarity`      ENUM('rare','epic','legendary') NOT NULL DEFAULT 'rare',
            `max_hp`      DOUBLE NOT NULL,
            `current_hp`  DOUBLE NOT NULL,
            `starts_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `ends_at`     TIMESTAMP NOT NULL,
            `defeated_at` TIMESTAMP NULL DEFAULT NULL,
            `status`      ENUM('active','defeated','expired') NOT NULL DEFAULT 'active',
            PRIMARY KEY (`id`),
            KEY `idx_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `boss_damage` (
            `boss_id`         INT UNSIGNED NOT NULL,
            `user_id`         INT UNSIGNED NOT NULL,
            `damage`          DOUBLE       NOT NULL DEFAULT 0,
            `hits`            INT UNSIGNED NOT NULL DEFAULT 0,
            `rewards_claimed` TINYINT(1)   NOT NULL DEFAULT 0,
            `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`boss_id`, `user_id`),
            CONSTRAINT `fk_bde_boss` FOREIGN KEY (`boss_id`) REFERENCES `bosses`(`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_bde_user` FOREIGN KEY (`user_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
} catch (PDOException $e) { /* already exist */ }

$uid = $_SESSION['uid'] ?? null;

$ct    = $_SERVER['CONTENT_TYPE'] ?? '';
$input = strpos($ct, 'application/json') !== false
       ? (json_decode(file_get_contents('php://input'), true) ?? [])
       : $_POST;
$action = $input['action'] ?? $_GET['action'] ?? '';

// ── Helpers ────────────────────────────────────────────────────────────────
function getActiveBoss(PDO $pdo): ?array {
    // Expire old bosses first
    $pdo->exec("UPDATE bosses SET status='expired' WHERE status='active' AND ends_at <= NOW()");
    $s = $pdo->prepare("SELECT * FROM bosses WHERE status='active' LIMIT 1");
    $s->execute();
    return $s->fetch() ?: null;
}

function spawnBoss(PDO $pdo): array {
    // All bosses last 5 min (300s) — feel like world events that come and go fast
    $pool = [
        ['type'=>'cyber_boss',      'rarity'=>'rare',      'dur'=>300],
        ['type'=>'glitch_entity',   'rarity'=>'rare',      'dur'=>300],
        ['type'=>'neural_titan',    'rarity'=>'epic',      'dur'=>420],
        ['type'=>'circuit_phantom', 'rarity'=>'epic',      'dur'=>420],
        ['type'=>'data_colossus',   'rarity'=>'legendary', 'dur'=>600],
    ];
    $t = $pool[array_rand($pool)];

    $row   = $pdo->query("SELECT COALESCE(MAX(level),0)+1 AS lvl FROM bosses")->fetch();
    $level = min((int)$row['lvl'], 999);

    // HP: 2M base, scales by level^1.35
    $hp = 2_000_000 * pow(max(1, $level), 1.35);

    $pdo->prepare(
        "INSERT INTO bosses (boss_type,level,rarity,max_hp,current_hp,ends_at,status)
         VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? SECOND),'active')"
    )->execute([$t['type'], $level, $t['rarity'], $hp, $hp, $t['dur']]);

    $id = (int)$pdo->lastInsertId();
    $s  = $pdo->prepare("SELECT * FROM bosses WHERE id=?");
    $s->execute([$id]);
    return $s->fetch();
}

function formatBoss(array $b): array {
    $remaining = max(0, strtotime($b['ends_at']) - time());
    return [
        'id'        => (int)$b['id'],
        'type'      => $b['boss_type'],
        'level'     => (int)$b['level'],
        'rarity'    => $b['rarity'],
        'maxHp'     => (float)$b['max_hp'],
        'currentHp' => (float)$b['current_hp'],
        'pct'       => $b['max_hp'] > 0 ? round($b['current_hp'] / $b['max_hp'], 6) : 0,
        'remaining' => $remaining,
        'status'    => $b['status'],
    ];
}

function getTopDamage(PDO $pdo, int $bossId): array {
    $s = $pdo->prepare("
        SELECT bd.user_id, u.nome_usuario AS username, u.foto,
               bd.damage, bd.hits, bd.rewards_claimed
        FROM boss_damage bd
        INNER JOIN usuarios u ON bd.user_id = u.id
        WHERE bd.boss_id = ?
        ORDER BY bd.damage DESC LIMIT 10
    ");
    $s->execute([$bossId]);
    return array_map(fn($r) => [
        'userId'   => (int)$r['user_id'],
        'username' => $r['username'],
        'foto'     => $r['foto'],
        'damage'   => (float)$r['damage'],
        'hits'     => (int)$r['hits'],
        'claimed'  => (bool)$r['rewards_claimed'],
    ], $s->fetchAll(PDO::FETCH_ASSOC));
}

function calcRewards(array $boss, float $myDmg, int $myRank): array {
    if ($myDmg <= 0) return ['neurons' => 0, 'diamonds' => 0];
    $pct      = $boss['max_hp'] > 0 ? ($myDmg / $boss['max_hp']) : 0;
    $neurons  = (int)($boss['max_hp'] * $pct * 2);          // 2× damage as neurons
    $diamonds = match(true) {
        $myRank === 1  => 30,
        $myRank <= 10  => 15,
        $myRank <= 100 => 5,
        default        => 2,
    };
    // Rarity bonus
    $rarityMult = match($boss['rarity']) { 'legendary' => 3, 'epic' => 2, default => 1 };
    return ['neurons' => $neurons * $rarityMult, 'diamonds' => $diamonds * $rarityMult];
}

// ── Routes ─────────────────────────────────────────────────────────────────
switch ($action) {

case 'state': {
    try {
        $pdo  = db();
        $boss = getActiveBoss($pdo);

        // Auto-spawn: 60s cooldown between bosses → new boss ~every 5 min
        if (!$boss) {
            $r    = $pdo->query("SELECT MAX(COALESCE(defeated_at,ends_at)) AS last FROM bosses")->fetch();
            $last = $r['last'] ? strtotime($r['last']) : 0;
            if (time() - $last >= 60) {
                $boss = spawnBoss($pdo);
            }
        }

        if (!$boss) {
            $r    = $pdo->query("SELECT MAX(COALESCE(defeated_at,ends_at)) AS last FROM bosses")->fetch();
            $last = $r && $r['last'] ? strtotime($r['last']) : time();
            $wait = max(0, 60 - (time() - $last));
            out(['ok' => true, 'boss' => null, 'cooldown' => $wait]);
        }

        $bossId = (int)$boss['id'];

        // Player info
        $myDmg = 0; $myRank = null; $rewards = null;
        if ($uid) {
            $s = $pdo->prepare("SELECT damage, rewards_claimed FROM boss_damage WHERE boss_id=? AND user_id=?");
            $s->execute([$bossId, $uid]);
            $row = $s->fetch();
            $myDmg    = $row ? (float)$row['damage'] : 0;
            $claimed  = $row ? (bool)$row['rewards_claimed'] : false;

            if ($myDmg > 0) {
                $s2 = $pdo->prepare("SELECT COUNT(*)+1 AS r FROM boss_damage WHERE boss_id=? AND damage>?");
                $s2->execute([$bossId, $myDmg]);
                $myRank = (int)$s2->fetch()['r'];
            }

            // Grant rewards if boss defeated and not yet claimed
            if ($boss['status'] === 'defeated' && $myDmg > 0 && !$claimed) {
                $rewards = calcRewards($boss, $myDmg, $myRank ?? 999);
                $pdo->prepare("UPDATE boss_damage SET rewards_claimed=1 WHERE boss_id=? AND user_id=?")
                    ->execute([$bossId, $uid]);
            }
        }

        out(['ok'       => true,
             'boss'     => formatBoss($boss),
             'myDamage' => $myDmg,
             'myRank'   => $myRank,
             'top'      => getTopDamage($pdo, $bossId),
             'rewards'  => $rewards]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => $ex->getMessage()], 500);
    }
    break;
}

case 'attack': {
    if (!$uid) out(['ok' => false, 'msg' => 'Login necessário.'], 401);

    $dmg = max(0.0, (float)($input['damage'] ?? 0));
    if ($dmg <= 0) out(['ok' => false, 'msg' => 'Dano inválido.']);
    $dmg = min($dmg, 1e18);                                 // hard cap

    try {
        $pdo  = db();
        $boss = getActiveBoss($pdo);
        if (!$boss || $boss['status'] !== 'active') out(['ok' => false, 'msg' => 'Sem boss ativo.']);

        $bossId = (int)$boss['id'];

        $pdo->prepare("UPDATE bosses SET current_hp=GREATEST(0,current_hp-?) WHERE id=? AND status='active'")
            ->execute([$dmg, $bossId]);

        $pdo->prepare("
            INSERT INTO boss_damage (boss_id,user_id,damage,hits) VALUES (?,?,?,1)
            ON DUPLICATE KEY UPDATE damage=damage+VALUES(damage), hits=hits+1
        ")->execute([$bossId, $uid, $dmg]);

        $s = $pdo->prepare("SELECT current_hp, max_hp, status FROM bosses WHERE id=?");
        $s->execute([$bossId]);
        $upd = $s->fetch();

        $defeated = false;
        if ((float)$upd['current_hp'] <= 0 && $upd['status'] === 'active') {
            $pdo->prepare("UPDATE bosses SET status='defeated', defeated_at=NOW(), current_hp=0 WHERE id=?")
                ->execute([$bossId]);
            $defeated = true;
        }

        $s2 = $pdo->prepare("SELECT damage FROM boss_damage WHERE boss_id=? AND user_id=?");
        $s2->execute([$bossId, $uid]);
        $myDmg = (float)($s2->fetch()['damage'] ?? 0);

        $hp  = max(0.0, (float)$upd['current_hp']);
        $max = (float)$upd['max_hp'];
        out(['ok'        => true,
             'currentHp' => $hp,
             'maxHp'     => $max,
             'pct'       => $max > 0 ? round($hp / $max, 6) : 0,
             'defeated'  => $defeated,
             'myDamage'  => $myDmg]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao registrar ataque.'], 500);
    }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
