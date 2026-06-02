<?php
/**
 * Nexarion Infinity — Placar global (ranking).
 * Tabs: neurônios, cliques, nível, prestígios, dano_chefe, abates_chefe
 */

session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function out(array $d, int $c = 200): void {
    http_response_code($c);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

$ct    = $_SERVER['CONTENT_TYPE'] ?? '';
$input = strpos($ct, 'application/json') !== false
       ? (json_decode(file_get_contents('php://input'), true) ?? [])
       : $_POST;
$action = $input['action'] ?? $_GET['action'] ?? '';
$uid    = $_SESSION['uid'] ?? null;

switch ($action) {

// ── Enviar dados do jogador ───────────────────────────────────────────────────
case 'submit': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);

    $neurons   = max(0.0, (float)($input['lifetime_neurons'] ?? 0));
    $level     = max(1, min(99999, (int)($input['level']            ?? 1)));
    $prestiges = max(0,            (int)($input['total_prestiges']  ?? 0));
    $clicks    = max(0,            (int)($input['total_clicks']     ?? 0));
    $vip       = empty($input['vip']) ? 0 : 1;

    try {
        db()->prepare("
            INSERT INTO placar (user_id, neuronios_vitais, nivel, total_prestigios, total_cliques, vip)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                neuronios_vitais = GREATEST(neuronios_vitais, VALUES(neuronios_vitais)),
                nivel            = VALUES(nivel),
                total_prestigios = VALUES(total_prestigios),
                total_cliques    = GREATEST(total_cliques, VALUES(total_cliques)),
                vip              = VALUES(vip),
                atualizado_em    = CURRENT_TIMESTAMP
        ")->execute([$uid, $neurons, $level, $prestiges, $clicks, $vip]);
        out(['ok' => true]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao salvar no placar.'], 500);
    }
    break;
}

// ── Top 50 por categoria ──────────────────────────────────────────────────────
case 'top': {
    $limit = min(50, max(1, (int)($_GET['limit'] ?? 50)));
    $tipo  = $_GET['tipo'] ?? 'neuronios';

    try {
        $pdo = db();
        $rows = [];

        if ($tipo === 'dano_chefe') {
            $s = $pdo->prepare("
                SELECT d.user_id AS id, u.nome_usuario AS username, u.foto,
                       COALESCE(p.vip, 0) AS vip,
                       d.total_dano AS score,
                       COALESCE(p.nivel, 1) AS nivel,
                       COALESCE(p.total_prestigios, 0) AS total_prestigios,
                       COALESCE(p.total_cliques, 0) AS total_cliques,
                       d.abates,
                       (COALESCE(TIMESTAMPDIFF(SECOND, u.ultimo_visto, NOW()), 9999) <= 300) AS is_online
                FROM dano_chefe_vitalicio d
                INNER JOIN usuarios u ON d.user_id = u.id
                LEFT JOIN placar p ON d.user_id = p.user_id
                ORDER BY d.total_dano DESC
                LIMIT ?
            ");
            $s->execute([$limit]);
        } elseif ($tipo === 'abates_chefe') {
            $s = $pdo->prepare("
                SELECT d.user_id AS id, u.nome_usuario AS username, u.foto,
                       COALESCE(p.vip, 0) AS vip,
                       d.abates AS score,
                       COALESCE(p.nivel, 1) AS nivel,
                       COALESCE(p.total_prestigios, 0) AS total_prestigios,
                       COALESCE(p.total_cliques, 0) AS total_cliques,
                       d.total_dano,
                       (COALESCE(TIMESTAMPDIFF(SECOND, u.ultimo_visto, NOW()), 9999) <= 300) AS is_online
                FROM dano_chefe_vitalicio d
                INNER JOIN usuarios u ON d.user_id = u.id
                LEFT JOIN placar p ON d.user_id = p.user_id
                WHERE d.abates > 0
                ORDER BY d.abates DESC
                LIMIT ?
            ");
            $s->execute([$limit]);
        } else {
            $col = match($tipo) {
                'cliques'    => 'total_cliques',
                'nivel'      => 'nivel',
                'prestigios' => 'total_prestigios',
                default      => 'neuronios_vitais',
            };
            $s = $pdo->prepare("
                SELECT p.user_id AS id, u.nome_usuario AS username, u.foto, p.vip,
                       p.neuronios_vitais, p.nivel, p.total_prestigios, p.total_cliques,
                       p.{$col} AS score,
                       (COALESCE(TIMESTAMPDIFF(SECOND, u.ultimo_visto, NOW()), 9999) <= 300) AS is_online
                FROM placar p
                INNER JOIN usuarios u ON p.user_id = u.id
                ORDER BY p.{$col} DESC
                LIMIT ?
            ");
            $s->execute([$limit]);
        }

        $rows = $s->fetchAll(PDO::FETCH_ASSOC);
        $entries = array_map(fn($r) => [
            'id'             => (int)$r['id'],
            'username'       => $r['username'],
            'foto'           => $r['foto'],
            'vip'            => (bool)$r['vip'],
            'online'         => (bool)($r['is_online'] ?? false),
            'score'          => isset($r['score']) ? (float)$r['score'] : 0,
            'nivel'          => (int)($r['nivel'] ?? 1),
            'totalPrestiges' => (int)($r['total_prestigios'] ?? 0),
            'totalCliques'   => (int)($r['total_cliques'] ?? 0),
            'totalDano'      => (float)($r['total_dano'] ?? 0),
            'abates'         => (int)($r['abates'] ?? 0),
        ], $rows);

        out(['ok' => true, 'entries' => $entries, 'tipo' => $tipo]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao buscar placar.'], 500);
    }
    break;
}

// ── Posição do jogador ────────────────────────────────────────────────────────
case 'rank': {
    if (!$uid) out(['ok' => false, 'rank' => null]);
    $tipo = $_GET['tipo'] ?? 'neuronios';

    try {
        $pdo = db();

        if (in_array($tipo, ['dano_chefe', 'abates_chefe'])) {
            $col = $tipo === 'dano_chefe' ? 'total_dano' : 'abates';
            $s = $pdo->prepare("SELECT $col AS valor FROM dano_chefe_vitalicio WHERE user_id = ?");
            $s->execute([$uid]);
            $row = $s->fetch();
            if (!$row) out(['ok' => false, 'rank' => null]);
            $val = (float)$row['valor'];
            $s2  = $pdo->prepare("SELECT COUNT(*)+1 AS r FROM dano_chefe_vitalicio WHERE $col > ?");
            $s2->execute([$val]);
        } else {
            $col = match($tipo) {
                'cliques'    => 'total_cliques',
                'nivel'      => 'nivel',
                'prestigios' => 'total_prestigios',
                default      => 'neuronios_vitais',
            };
            $s = $pdo->prepare("SELECT $col AS valor FROM placar WHERE user_id = ?");
            $s->execute([$uid]);
            $row = $s->fetch();
            if (!$row) out(['ok' => false, 'rank' => null]);
            $val = (float)$row['valor'];
            $s2  = $pdo->prepare("SELECT COUNT(*)+1 AS r FROM placar WHERE $col > ?");
            $s2->execute([$val]);
        }

        $r = $s2->fetch();
        out(['ok' => true, 'rank' => $r ? (int)$r['r'] : null]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'rank' => null]);
    }
    break;
}

// ── Remover jogador do placar ─────────────────────────────────────────────────
case 'delete': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    try {
        db()->prepare("DELETE FROM placar WHERE user_id = ?")->execute([$uid]);
        out(['ok' => true]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao remover do placar.'], 500);
    }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
