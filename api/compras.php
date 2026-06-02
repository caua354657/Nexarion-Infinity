<?php
/**
 * Nexarion Infinity — Persistência de compras na conta do usuário.
 * Garante que VIP, Double Neuron, skins e diamantes sobrevivam a
 * qualquer limpeza de cache ou troca de dispositivo.
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

// ── Salvar compras na conta ───────────────────────────────────────────────────
case 'salvar': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);

    $vip          = empty($raw['vip'])          ? 0 : 1;
    $doubleNeuron = empty($raw['doubleNeuron']) ? 0 : 1;
    $diamantes    = max(0, (int)($raw['diamantes'] ?? 0));
    $skins        = json_encode(array_values(array_unique((array)($raw['skins'] ?? []))));
    $skinAtiva    = isset($raw['skinAtiva']) && $raw['skinAtiva'] ? substr((string)$raw['skinAtiva'], 0, 50) : null;

    try {
        db()->prepare("
            UPDATE usuarios
            SET vip=?, double_neuron=?, diamantes=?, skins=?, skin_ativa=?
            WHERE id=?
        ")->execute([$vip, $doubleNeuron, $diamantes, $skins, $skinAtiva, $uid]);
        out(['ok' => true]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao salvar compras.'], 500);
    }
    break;
}

// ── Carregar compras da conta ─────────────────────────────────────────────────
case 'carregar': {
    if (!$uid) out(['ok' => true, 'compras' => null]);
    try {
        $s = db()->prepare("SELECT vip, double_neuron, diamantes, skins, skin_ativa FROM usuarios WHERE id=? LIMIT 1");
        $s->execute([$uid]);
        $row = $s->fetch();
        if (!$row) out(['ok' => true, 'compras' => null]);

        $skinsArr = [];
        if ($row['skins']) {
            $decoded = json_decode($row['skins'], true);
            if (is_array($decoded)) $skinsArr = $decoded;
        }

        out(['ok' => true, 'compras' => [
            'vip'          => (bool)$row['vip'],
            'doubleNeuron' => (bool)$row['double_neuron'],
            'diamantes'    => (int)$row['diamantes'],
            'skins'        => $skinsArr,
            'skinAtiva'    => $row['skin_ativa'],
        ]]);
    } catch (PDOException $ex) {
        out(['ok' => false, 'msg' => 'Erro ao carregar compras.'], 500);
    }
    break;
}

default: out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
