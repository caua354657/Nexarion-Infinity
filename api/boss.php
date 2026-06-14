<?php
/**
 * Nexarion Infinity — Sistema de chefes individuais por jogador.
 * Cada jogador tem seu próprio chefe; derrotá-lo avança seu nível.
 */

session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function out(array $d, int $c = 200): void {
    http_response_code($c);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

$uid = $_SESSION['uid'] ?? null;
$ct  = $_SERVER['CONTENT_TYPE'] ?? '';
$input = strpos($ct, 'application/json') !== false
       ? (json_decode(file_get_contents('php://input'), true) ?? [])
       : $_POST;
$action = $input['action'] ?? $_GET['action'] ?? '';

// ── Helpers ──────────────────────────────────────────────────────────────────

function bossPool(): array {
    return [
        ['tipo' => 'nano_drone',        'raridade' => 'common'],
        ['tipo' => 'static_surge',      'raridade' => 'common'],
        ['tipo' => 'viral_code',        'raridade' => 'uncommon'],
        ['tipo' => 'memory_leech',      'raridade' => 'uncommon'],
        ['tipo' => 'cyber_boss',        'raridade' => 'rare'],
        ['tipo' => 'glitch_entity',     'raridade' => 'rare'],
        ['tipo' => 'chrome_hunter',     'raridade' => 'rare'],
        ['tipo' => 'plasma_drifter',    'raridade' => 'rare'],
        ['tipo' => 'neural_titan',      'raridade' => 'epic'],
        ['tipo' => 'circuit_phantom',   'raridade' => 'epic'],
        ['tipo' => 'void_sentinel',     'raridade' => 'epic'],
        ['tipo' => 'storm_herald',      'raridade' => 'epic'],
        ['tipo' => 'data_colossus',     'raridade' => 'legendary'],
        ['tipo' => 'nexus_destroyer',   'raridade' => 'legendary'],
        ['tipo' => 'omega_protocol',    'raridade' => 'mythic'],
        ['tipo' => 'singularity_prime', 'raridade' => 'mythic'],
    ];
}

function selectBossForLevel(int $nivel): array {
    $all = bossPool();
    $byRarity = [];
    foreach ($all as $b) {
        $byRarity[$b['raridade']][] = $b;
    }

    if ($nivel <= 8) {
        $w = ['common'=>50,'uncommon'=>35,'rare'=>13,'epic'=>2,'legendary'=>0,'mythic'=>0];
    } elseif ($nivel <= 20) {
        $w = ['common'=>18,'uncommon'=>28,'rare'=>32,'epic'=>17,'legendary'=>5,'mythic'=>0];
    } elseif ($nivel <= 40) {
        $w = ['common'=>5,'uncommon'=>12,'rare'=>28,'epic'=>33,'legendary'=>17,'mythic'=>5];
    } elseif ($nivel <= 70) {
        $w = ['common'=>0,'uncommon'=>5,'rare'=>18,'epic'=>35,'legendary'=>30,'mythic'=>12];
    } else {
        $w = ['common'=>0,'uncommon'=>0,'rare'=>10,'epic'=>22,'legendary'=>35,'mythic'=>33];
    }

    $total = array_sum($w);
    $rand  = mt_rand(1, max(1, $total));
    $cum   = 0;
    $chosen = 'rare';
    foreach ($w as $rarity => $weight) {
        $cum += $weight;
        if ($rand <= $cum && $weight > 0 && !empty($byRarity[$rarity])) {
            $chosen = $rarity;
            break;
        }
    }

    $pool = $byRarity[$chosen] ?? $byRarity['rare'] ?? [$all[0]];
    return $pool[mt_rand(0, count($pool) - 1)];
}

function bossHpMax(int $nivel): float {
    $n   = max(1, $nivel);
    // Exponent ramps from 1.3 → 1.5 over the first 30 levels for a smoother early curve.
    // Level 30+ is identical to the original formula.
    $exp = 1.3 + 0.2 * min(1.0, $n / 30.0);
    return round(10_000 * pow($n, $exp));
}

const BOSS_TIMER_SECS    = 300; // 5 min para derrotar o boss
const BOSS_COOLDOWN_SECS = 300; // 5 min de recarga após expirar

// ── Busca com todos os campos calculados pelo MySQL (sem strtotime PHP) ──────────
function fetchChefe(PDO $pdo, int $uid): ?array {
    $s = $pdo->prepare("
        SELECT *,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), expira_em))  AS remaining_sec,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), proximo_em)) AS cooldown_sec
        FROM chefes_jogador
        WHERE user_id = ?
    ");
    $s->execute([$uid]);
    return $s->fetch() ?: null;
}

function criarChefe(PDO $pdo, int $uid, int $nivel): array {
    $entrada = selectBossForLevel($nivel);
    $hp      = bossHpMax($nivel);

    $pdo->prepare("
        INSERT INTO chefes_jogador (user_id, nivel, tipo, raridade, hp_max, hp_atual, expira_em, proximo_em, iniciado_em)
        VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL " . BOSS_TIMER_SECS . " SECOND), NULL, NOW())
        ON DUPLICATE KEY UPDATE
            nivel       = VALUES(nivel),       tipo        = VALUES(tipo),
            raridade    = VALUES(raridade),    hp_max      = VALUES(hp_max),
            hp_atual    = VALUES(hp_atual),    expira_em   = VALUES(expira_em),
            proximo_em  = NULL,                iniciado_em = NOW()
    ")->execute([$uid, $nivel, $entrada['tipo'], $entrada['raridade'], $hp, $hp]);

    return fetchChefe($pdo, $uid);
}

// ── Resolve o estado atual do chefe usando MySQL para comparações de tempo ────────
function resolveChefe(PDO $pdo, int $uid): array {
    $rec = fetchChefe($pdo, $uid);

    // Sem registro → primeiro boss
    if (!$rec) {
        return ['fase' => 'ativo', 'rec' => criarChefe($pdo, $uid, 1), 'cooldown' => 0];
    }

    // Em cooldown (proximo_em definido e no futuro — verificado pelo MySQL)
    if (!empty($rec['proximo_em']) && $rec['cooldown_sec'] > 0) {
        return ['fase' => 'cooldown', 'rec' => $rec, 'cooldown' => (int)$rec['cooldown_sec']];
    }

    // Cooldown acabou (proximo_em definido mas já passou)
    if (!empty($rec['proximo_em']) && $rec['cooldown_sec'] <= 0) {
        return ['fase' => 'ativo', 'rec' => criarChefe($pdo, $uid, (int)$rec['nivel']), 'cooldown' => 0];
    }

    // Boss ativo expirou (remaining_sec = 0, sem proximo_em) → iniciar cooldown
    if (!empty($rec['expira_em']) && $rec['remaining_sec'] <= 0) {
        $pdo->prepare("
            UPDATE chefes_jogador
            SET proximo_em = DATE_ADD(NOW(), INTERVAL " . BOSS_COOLDOWN_SECS . " SECOND)
            WHERE user_id = ?
        ")->execute([$uid]);
        return ['fase' => 'cooldown', 'rec' => $rec, 'cooldown' => BOSS_COOLDOWN_SECS];
    }

    // Boss ativo normal
    return ['fase' => 'ativo', 'rec' => $rec, 'cooldown' => 0];
}

function formatChefe(array $b): array {
    $pct       = $b['hp_max'] > 0 ? round($b['hp_atual'] / $b['hp_max'], 6) : 0;
    // remaining_sec vem do MySQL (TIMESTAMPDIFF) — sem dependência de timezone do PHP
    $remaining = isset($b['remaining_sec']) ? (int)$b['remaining_sec'] : BOSS_TIMER_SECS;
    return [
        'nivel'     => (int)$b['nivel'],
        'type'      => $b['tipo'],
        'rarity'    => $b['raridade'],
        'maxHp'     => (float)$b['hp_max'],
        'currentHp' => (float)$b['hp_atual'],
        'pct'       => $pct,
        'status'    => 'active',
        'remaining' => $remaining,
    ];
}

function getDanoVitalicio(PDO $pdo, int $uid): array {
    $s = $pdo->prepare("SELECT total_dano, abates FROM dano_chefe_vitalicio WHERE user_id = ?");
    $s->execute([$uid]);
    $row = $s->fetch();
    return ['totalDano' => (float)($row['total_dano'] ?? 0), 'abates' => (int)($row['abates'] ?? 0)];
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
switch ($action) {

// ── Estado atual do chefe do jogador ─────────────────────────────────────────
case 'state': {
    try {
        $pdo = db();

        if (!$uid) {
            // Boss simulado para visitantes — remaining fixo (não persiste)
            out([
                'ok'              => true,
                'boss'            => ['nivel'=>1,'type'=>'cyber_boss','rarity'=>'rare','maxHp'=>10000,'currentHp'=>10000,'pct'=>1,'status'=>'active','remaining'=>BOSS_TIMER_SECS],
                'cooldown'        => 0,
                'lifetimeDamage'  => 0,
                'bossKills'       => 0,
                'userBossLevel'   => 1,
                'globalBossLevel' => 1,
            ]);
        }

        $resolved = resolveChefe($pdo, $uid);
        $stats    = getDanoVitalicio($pdo, $uid);
        $nivel    = (int)$resolved['rec']['nivel'];

        if ($resolved['fase'] === 'cooldown') {
            out([
                'ok'              => true,
                'boss'            => null,
                'cooldown'        => $resolved['cooldown'],
                'userBossLevel'   => $nivel,
                'globalBossLevel' => $nivel,
                'lifetimeDamage'  => $stats['totalDano'],
                'bossKills'       => $stats['abates'],
            ]);
        }

        out([
            'ok'              => true,
            'boss'            => formatChefe($resolved['rec']),
            'cooldown'        => 0,
            'rewards'         => null,
            'lifetimeDamage'  => $stats['totalDano'],
            'bossKills'       => $stats['abates'],
            'userBossLevel'   => $nivel,
            'globalBossLevel' => $nivel,
        ]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => $ex->getMessage()], 500);
    }
    break;
}

// ── Atacar o chefe ────────────────────────────────────────────────────────────
case 'attack': {
    if (!$uid) out(['ok' => false, 'msg' => 'Login necessário.'], 401);

    $dmg = max(0.0, (float)($input['damage'] ?? 0));
    if ($dmg <= 0) out(['ok' => false, 'msg' => 'Dano inválido.']);
    $dmg = min($dmg, 1e18);

    try {
        $pdo      = db();
        $resolved = resolveChefe($pdo, $uid);

        if ($resolved['fase'] === 'cooldown') {
            out(['ok' => false, 'msg' => 'Boss em recarga.', 'cooldown' => $resolved['cooldown']]);
        }

        $boss   = $resolved['rec'];
        $novoHp = max(0.0, (float)$boss['hp_atual'] - $dmg);
        $derrotado = $novoHp <= 0;

        // Atualizar HP do chefe
        $pdo->prepare("UPDATE chefes_jogador SET hp_atual = ? WHERE user_id = ?")
            ->execute([$novoHp, $uid]);

        // Acumular dano vitalício
        $pdo->prepare("
            INSERT INTO dano_chefe_vitalicio (user_id, total_dano, abates) VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE total_dano = total_dano + VALUES(total_dano)
        ")->execute([$uid, $dmg]);

        $novoNivel = (int)$boss['nivel'];
        $novoBoss  = null;
        $recompensa = null;

        if ($derrotado) {
            // Avançar nível e spawnar novo chefe
            $novoNivel++;

            // Registrar abate
            $pdo->prepare("
                INSERT INTO dano_chefe_vitalicio (user_id, total_dano, abates) VALUES (?, 0, 1)
                ON DUPLICATE KEY UPDATE abates = abates + 1
            ")->execute([$uid]);

            // Atualizar placar (user_boss_level via chefes_jogador já atualiza)
            $novoBossData = criarChefe($pdo, $uid, $novoNivel);
            $novoBoss     = formatChefe($novoBossData);

            // Recompensas por derrota
            $rarityMult = match($boss['raridade']) { 'legendary' => 3, 'epic' => 2, default => 1 };
            $hpMax      = (float)$boss['hp_max'];
            $pct        = $hpMax > 0 ? min(1.0, $dmg / $hpMax) : 0;
            $recompensa = [
                'neurons'  => (int)($hpMax * $pct * 2) * $rarityMult,
                'diamonds' => (2 + ($boss['raridade'] === 'legendary' ? 8 : ($boss['raridade'] === 'epic' ? 4 : 0))),
            ];
        }

        $stats = getDanoVitalicio($pdo, $uid);

        out([
            'ok'            => true,
            'currentHp'     => $novoHp,
            'maxHp'         => (float)$boss['hp_max'],
            'pct'           => $boss['hp_max'] > 0 ? round($novoHp / $boss['hp_max'], 6) : 0,
            'defeated'      => $derrotado,
            'myDamage'      => $dmg,
            'userBossLevel' => $novoNivel,
            'newBoss'       => $novoBoss,
            'rewards'       => $recompensa,
            'lifetimeDamage'=> $stats['totalDano'],
            'bossKills'     => $stats['abates'],
        ]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao registrar ataque.'], 500);
    }
    break;
}

// ── Ranking: maior dano vitalício ─────────────────────────────────────────────
case 'damage_top': {
    try {
        $pdo = db();
        $s = $pdo->query("
            SELECT d.user_id, u.nome_usuario AS username, u.foto,
                   COALESCE(p.vip, 0) AS vip,
                   d.total_dano AS damage, d.abates AS kills,
                   (COALESCE(TIMESTAMPDIFF(SECOND, u.ultimo_visto, NOW()), 9999) <= 300) AS is_online
            FROM dano_chefe_vitalicio d
            INNER JOIN usuarios u ON d.user_id = u.id
            LEFT JOIN placar p ON d.user_id = p.user_id
            ORDER BY d.total_dano DESC
            LIMIT 50
        ");
        $top = []; $rank = 1;
        while ($row = $s->fetch(PDO::FETCH_ASSOC)) {
            $top[] = [
                'rank'     => $rank++,
                'userId'   => (int)$row['user_id'],
                'username' => $row['username'],
                'foto'     => $row['foto'],
                'vip'      => (bool)$row['vip'],
                'online'   => (bool)($row['is_online'] ?? false),
                'damage'   => (float)$row['damage'],
                'kills'    => (int)$row['kills'],
            ];
        }
        out(['ok' => true, 'top' => $top]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => $ex->getMessage()], 500);
    }
    break;
}

// ── Ranking: maior número de abates ──────────────────────────────────────────
case 'kills_top': {
    try {
        $pdo = db();
        $s = $pdo->query("
            SELECT d.user_id, u.nome_usuario AS username, u.foto,
                   COALESCE(p.vip, 0) AS vip,
                   d.abates AS kills, d.total_dano AS damage,
                   (COALESCE(TIMESTAMPDIFF(SECOND, u.ultimo_visto, NOW()), 9999) <= 300) AS is_online
            FROM dano_chefe_vitalicio d
            INNER JOIN usuarios u ON d.user_id = u.id
            LEFT JOIN placar p ON d.user_id = p.user_id
            WHERE d.abates > 0
            ORDER BY d.abates DESC
            LIMIT 50
        ");
        $top = []; $rank = 1;
        while ($row = $s->fetch(PDO::FETCH_ASSOC)) {
            $top[] = [
                'rank'     => $rank++,
                'userId'   => (int)$row['user_id'],
                'username' => $row['username'],
                'foto'     => $row['foto'],
                'vip'      => (bool)$row['vip'],
                'online'   => (bool)($row['is_online'] ?? false),
                'kills'    => (int)$row['kills'],
                'damage'   => (float)$row['damage'],
            ];
        }
        out(['ok' => true, 'top' => $top]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => $ex->getMessage()], 500);
    }
    break;
}

// ── Posição individual de dano / abates ───────────────────────────────────────
case 'damage_rank': {
    if (!$uid) out(['ok' => false, 'msg' => 'Login necessário.'], 401);
    try {
        $pdo = db();
        $s   = $pdo->prepare("SELECT total_dano, abates FROM dano_chefe_vitalicio WHERE user_id = ?");
        $s->execute([$uid]);
        $row = $s->fetch();
        $myDmg    = $row ? (float)$row['total_dano'] : 0.0;
        $myKills  = $row ? (int)$row['abates'] : 0;
        $dmgRank  = null;
        $killRank = null;

        if ($myDmg > 0) {
            $s2 = $pdo->prepare("SELECT COUNT(*)+1 AS r FROM dano_chefe_vitalicio WHERE total_dano > ?");
            $s2->execute([$myDmg]);
            $dmgRank = (int)$s2->fetch()['r'];
        }
        if ($myKills > 0) {
            $s3 = $pdo->prepare("SELECT COUNT(*)+1 AS r FROM dano_chefe_vitalicio WHERE abates > ?");
            $s3->execute([$myKills]);
            $killRank = (int)$s3->fetch()['r'];
        }

        out(['ok' => true, 'damage' => $myDmg, 'kills' => $myKills, 'rank' => $dmgRank, 'killRank' => $killRank]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => $ex->getMessage()], 500);
    }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
