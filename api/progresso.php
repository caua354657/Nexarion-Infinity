<?php
/**
 * Nexarion Infinity — Server-side game progress save/load.
 * Keeps player data safe across localStorage clears.
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
$raw = strpos($ct, 'application/json') !== false
     ? (json_decode(file_get_contents('php://input'), true) ?? [])
     : $_POST;

$action = $raw['action'] ?? $_GET['action'] ?? '';

switch ($action) {

// ── Salvar progresso ─────────────────────────────────────────────────────────
case 'salvar': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);

    try { db()->prepare("UPDATE usuarios SET ultimo_visto = NOW() WHERE id = ?")->execute([$uid]); }
    catch (PDOException $e) { /* coluna pode não existir ainda */ }

    $dados = $raw['dados'] ?? null;
    if (!$dados || !is_array($dados)) out(['ok' => false, 'msg' => 'Dados inválidos.'], 400);

    // Validate minimum required fields
    if (empty($dados['economy']) || empty($dados['upgrades'])) {
        out(['ok' => false, 'msg' => 'Save incompleto.'], 400);
    }

    $json = json_encode($dados, JSON_UNESCAPED_UNICODE);
    if (strlen($json) > 768 * 1024) out(['ok' => false, 'msg' => 'Save excede limite de tamanho.'], 400);

    try {
        db()->prepare("
            INSERT INTO progresso (user_id, dados)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE dados = VALUES(dados), atualizado_em = CURRENT_TIMESTAMP
        ")->execute([$uid, $json]);
        out(['ok' => true]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao salvar progresso.'], 500);
    }
    break;
}

// ── Carregar progresso ───────────────────────────────────────────────────────
case 'carregar': {
    if (!$uid) out(['ok' => true, 'dados' => null]);

    try {
        $s = db()->prepare("SELECT dados FROM progresso WHERE user_id = ? LIMIT 1");
        $s->execute([$uid]);
        $row = $s->fetch();
        if (!$row) out(['ok' => true, 'dados' => null]);

        $dados = json_decode($row['dados'], true);
        out(['ok' => true, 'dados' => $dados]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao carregar progresso.'], 500);
    }
    break;
}

// ── Apagar progresso (reset) ─────────────────────────────────────────────────
case 'apagar': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);
    try {
        db()->prepare("DELETE FROM progresso WHERE user_id = ?")->execute([$uid]);
        out(['ok' => true]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao apagar progresso.'], 500);
    }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
