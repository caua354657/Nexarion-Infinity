<?php
/**
 * Nexarion Infinity — Sistema de Pagamentos via Mercado Pago (SDK dx-php v3)
 *
 * Rotas:
 *   POST {action: 'criar_pix', item_id}  → PIX direto: gera QR code + copia-e-cola
 *   POST {action: 'criar', item_id}      → Checkout Pro (cartão/outros)
 *   GET  ?action=status&id={tx_id}       → Verifica status da transação (polling)
 *   POST ?action=webhook                 → Notificação do Mercado Pago
 *   GET  ?action=retorno&...             → Retorno após checkout Pro (back_url)
 */

session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/config.php';

use MercadoPago\MercadoPagoConfig;
use MercadoPago\Client\Preference\PreferenceClient;
use MercadoPago\Client\Payment\PaymentClient;
use MercadoPago\Exceptions\MPApiException;

MercadoPagoConfig::setAccessToken(MP_TOKEN);

function out(array $d, int $c = 200): void {
    http_response_code($c);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Catálogo de itens vendáveis ───────────────────────────────────────────────
function catalogo(): array {
    return [
        'vip'              => ['nome' => 'VIP Permanente',           'tipo' => 'vip',           'preco' => 9.90,  'diamonds' => 0],
        'double_neuron'    => ['nome' => '2× Neurônio',              'tipo' => 'double_neuron', 'preco' => 12.90, 'diamonds' => 0],
        'boss_damage_x2'   => ['nome' => '2× Dano no Boss',          'tipo' => 'boss_dmg_x2',   'preco' => 9.90,  'diamonds' => 0],
        'diamonds_starter' => ['nome' => 'Pacote Iniciante (50💎)',  'tipo' => 'diamonds',      'preco' => 1.90,  'diamonds' => 50],
        'diamonds_small'   => ['nome' => 'Pacote Inicial (150💎)',   'tipo' => 'diamonds',      'preco' => 4.90,  'diamonds' => 150],
        'diamonds_medium'  => ['nome' => 'Pacote Médio (400💎)',     'tipo' => 'diamonds',      'preco' => 9.90,  'diamonds' => 400],
        'diamonds_large'   => ['nome' => 'Pacote Grande (1000💎)',   'tipo' => 'diamonds',      'preco' => 19.90, 'diamonds' => 1000],
        'diamonds_mega'    => ['nome' => 'Pacote MEGA (3000💎)',     'tipo' => 'diamonds',      'preco' => 49.90, 'diamonds' => 3000],
        // ── Pets míticos e lendários (exclusivos) ─────────────────────────────
        'pet_omega_serpent'    => ['nome' => 'Pet: Omega Serpent (Mítico)',      'tipo' => 'skin', 'preco' => 9.90,  'diamonds' => 0],
        'pet_singularity_owl'  => ['nome' => 'Pet: Singularity Owl (Mítico)',    'tipo' => 'skin', 'preco' => 9.90,  'diamonds' => 0],
        'pet_nexus_dragon'     => ['nome' => 'Pet: Nexus Dragon (Lendário)',     'tipo' => 'skin', 'preco' => 19.90, 'diamonds' => 0],
        'pet_infinity_fox'     => ['nome' => 'Pet: Infinity Fox (Lendário)',     'tipo' => 'skin', 'preco' => 19.90, 'diamonds' => 0],
        'pet_cosmos_whale'     => ['nome' => 'Pet: Cosmos Whale (Lendário)',     'tipo' => 'skin', 'preco' => 19.90, 'diamonds' => 0],
        // ── Skins de cor ──────────────────────────────────────────────────────
        'skin_midnight'    => ['nome' => 'Skin: Protocolo Meia-Noite',  'tipo' => 'skin', 'preco' => 1.99,  'diamonds' => 0],
        'skin_pulse'       => ['nome' => 'Skin: Grade de Pulso',         'tipo' => 'skin', 'preco' => 1.99,  'diamonds' => 0],
        'skin_emerald'     => ['nome' => 'Skin: Grade Esmeralda',        'tipo' => 'skin', 'preco' => 3.99,  'diamonds' => 0],
        'skin_frost'       => ['nome' => 'Skin: Protocolo Glacial',      'tipo' => 'skin', 'preco' => 5.99,  'diamonds' => 0],
        'skin_crimson'     => ['nome' => 'Skin: Pulso Carmesim',         'tipo' => 'skin', 'preco' => 5.99,  'diamonds' => 0],
        'skin_sapphire'    => ['nome' => 'Skin: Núcleo Safira',          'tipo' => 'skin', 'preco' => 5.99,  'diamonds' => 0],
        'skin_void'        => ['nome' => 'Skin: Surto do Vazio',         'tipo' => 'skin', 'preco' => 8.99,  'diamonds' => 0],
        'skin_platinum'    => ['nome' => 'Skin: Borda Platina',          'tipo' => 'skin', 'preco' => 8.99,  'diamonds' => 0],
        'skin_aurora'      => ['nome' => 'Skin: Nexo Aurora',            'tipo' => 'skin', 'preco' => 11.99, 'diamonds' => 0],
        'skin_amber'       => ['nome' => 'Skin: Surto Âmbar',           'tipo' => 'skin', 'preco' => 14.99, 'diamonds' => 0],
        'skin_pixelneon'   => ['nome' => 'Skin: Dimensão Arcade',        'tipo' => 'skin', 'preco' => 14.99, 'diamonds' => 0],
        'skin_obsidian'    => ['nome' => 'Skin: Fissura de Obsidiana',   'tipo' => 'skin', 'preco' => 19.99, 'diamonds' => 0],
        // ── Skins de evento ───────────────────────────────────────────────────
        'skin_newyear'     => ['nome' => 'Skin: Singularidade Dourada',  'tipo' => 'skin', 'preco' => 4.99,  'diamonds' => 0],
        'skin_christmas'   => ['nome' => 'Skin: Protocolo Nevasca',      'tipo' => 'skin', 'preco' => 6.99,  'diamonds' => 0],
        'skin_halloween'   => ['nome' => 'Skin: Núcleo do Terror',       'tipo' => 'skin', 'preco' => 6.99,  'diamonds' => 0],
        'skin_cyberpunk'   => ['nome' => 'Skin: Matriz Neon',            'tipo' => 'skin', 'preco' => 9.99,  'diamonds' => 0],
        // ── Skins temporárias ─────────────────────────────────────────────────
        'skin_solar'       => ['nome' => 'Skin: Explosão Solar',         'tipo' => 'skin', 'preco' => 6.99,  'diamonds' => 0],
        'skin_blood_moon'  => ['nome' => 'Skin: Lua de Sangue',          'tipo' => 'skin', 'preco' => 6.99,  'diamonds' => 0],
        'skin_glacial'     => ['nome' => 'Skin: Tempestade Glacial',     'tipo' => 'skin', 'preco' => 6.99,  'diamonds' => 0],
    ];
}

// ── Conceder item ao usuário no banco ─────────────────────────────────────────
function entregarItem(PDO $pdo, int $uid, string $itemId, array $item): bool {
    try {
        switch ($item['tipo']) {
            case 'vip':
                $pdo->prepare("UPDATE usuarios SET vip=1 WHERE id=?")->execute([$uid]);
                return true;
            case 'double_neuron':
                $pdo->prepare("UPDATE usuarios SET double_neuron=1 WHERE id=?")->execute([$uid]);
                return true;
            case 'boss_dmg_x2':
                $pdo->prepare("UPDATE usuarios SET boss_dmg_x2=1 WHERE id=?")->execute([$uid]);
                return true;
            case 'diamonds':
                $pdo->prepare("UPDATE usuarios SET diamantes = diamantes + ? WHERE id=?")->execute([$item['diamonds'], $uid]);
                return true;
            case 'skin':
                $s = $pdo->prepare("SELECT skins FROM usuarios WHERE id=? LIMIT 1");
                $s->execute([$uid]);
                $row = $s->fetch();
                $arr = ($row && $row['skins']) ? (json_decode($row['skins'], true) ?: []) : [];
                if (!in_array($itemId, $arr, true)) {
                    $arr[] = $itemId;
                    $pdo->prepare("UPDATE usuarios SET skins=? WHERE id=?")->execute([json_encode($arr), $uid]);
                }
                return true;
        }
    } catch (PDOException $e) {
        error_log("entregarItem error (uid={$uid}, item={$itemId}): " . $e->getMessage());
    }
    return false;
}

// ── Verificar se usuário já possui item ───────────────────────────────────────
function usuarioJaPossui(PDO $pdo, int $uid, string $itemId, array $item): bool {
    switch ($item['tipo']) {
        case 'vip':
            $s = $pdo->prepare("SELECT vip FROM usuarios WHERE id=?");
            $s->execute([$uid]); return (bool)$s->fetchColumn();
        case 'double_neuron':
            $s = $pdo->prepare("SELECT double_neuron FROM usuarios WHERE id=?");
            $s->execute([$uid]); return (bool)$s->fetchColumn();
        case 'boss_dmg_x2':
            $s = $pdo->prepare("SELECT boss_dmg_x2 FROM usuarios WHERE id=?");
            $s->execute([$uid]); return (bool)$s->fetchColumn();
        case 'diamonds':
            return false;
        case 'skin':
            $s = $pdo->prepare("SELECT skins FROM usuarios WHERE id=?");
            $s->execute([$uid]);
            $row = $s->fetch();
            $arr = ($row && $row['skins']) ? (json_decode($row['skins'], true) ?: []) : [];
            return in_array($itemId, $arr, true);
    }
    return false;
}

// ── Buscar status do pagamento via SDK ────────────────────────────────────────
function buscarPagamento(string $paymentId): ?object {
    try {
        $client  = new PaymentClient();
        $payment = $client->get((int)$paymentId);
        return $payment;
    } catch (MPApiException $e) {
        error_log("MP buscarPagamento error [{$paymentId}]: " . $e->getMessage());
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────

$uid    = $_SESSION['uid'] ?? null;
$ct     = $_SERVER['CONTENT_TYPE'] ?? '';
$input  = strpos($ct, 'application/json') !== false
        ? (json_decode(file_get_contents('php://input'), true) ?? [])
        : array_merge($_GET, $_POST);
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {

// ── PIX direto: gera QR Code + copia-e-cola ──────────────────────────────────
case 'criar_pix': {
    if (!$uid) out(['ok' => false, 'msg' => 'Faça login para comprar.'], 401);


    $itemId = trim($input['item_id'] ?? '');
    $cat    = catalogo();
    if (!isset($cat[$itemId])) out(['ok' => false, 'msg' => 'Item inválido.']);
    $item = $cat[$itemId];

    try {
        $pdo = db();

        if (usuarioJaPossui($pdo, $uid, $itemId, $item)) {
            out(['ok' => false, 'msg' => 'Você já possui este item.']);
        }

        // Buscar e-mail do usuário para identificar o pagador
        $su = $pdo->prepare("SELECT email FROM usuarios WHERE id=? LIMIT 1");
        $su->execute([$uid]);
        $payerEmail = $su->fetchColumn() ?: 'comprador@nexarion.com';

        // Inserir transação pendente
        $pdo->prepare("
            INSERT INTO transacoes (user_id, item_id, item_tipo, valor, status)
            VALUES (?, ?, ?, ?, 'pending')
        ")->execute([$uid, $itemId, $item['tipo'], $item['preco']]);
        $txId   = (int)$pdo->lastInsertId();
        $extRef = "uid:{$uid}:item:{$itemId}:tx:{$txId}";

        // Criar pagamento PIX via API direta
        $payClient = new PaymentClient();
        $payment   = $payClient->create([
            'transaction_amount' => (float)$item['preco'],
            'description'        => 'Nexarion Infinity — ' . $item['nome'],
            'payment_method_id'  => 'pix',
            'external_reference' => $extRef,
            'payer'              => ['email' => $payerEmail],
        ]);

        // Salvar payment_id imediatamente (já temos)
        $pdo->prepare("UPDATE transacoes SET mp_payment_id=? WHERE id=?")
            ->execute([$payment->id, $txId]);

        $txData = $payment->point_of_interaction->transaction_data ?? null;

        out([
            'ok'            => true,
            'tx_id'         => $txId,
            'payment_id'    => $payment->id,
            'qr_code'       => $txData->qr_code        ?? '',
            'qr_code_base64'=> $txData->qr_code_base64 ?? '',
            'expiration'    => 3600, // PIX expira em 1 hora
        ]);

    } catch (MPApiException $e) {
        $c = $e->getApiResponse()->getContent();
        $msg = is_array($c) ? ($c['message'] ?? $c['error'] ?? 'Erro MP') : $e->getMessage();
        error_log("MP criar_pix: " . $e->getMessage() . " | " . json_encode($c));
        out(['ok' => false, 'msg' => 'Erro PIX: ' . $msg]);
    } catch (PDOException $e) {
        error_log("criar_pix DB: " . $e->getMessage());
        out(['ok' => false, 'msg' => 'Erro banco: ' . $e->getMessage()], 500);
    }
    break;
}

// ── Criar preferência de pagamento (Checkout Pro — cartão/outros) ─────────────
case 'criar': {
    if (!$uid) out(['ok' => false, 'msg' => 'Faça login para comprar.'], 401);

    $itemId = trim($input['item_id'] ?? '');
    $cat    = catalogo();
    if (!isset($cat[$itemId])) out(['ok' => false, 'msg' => 'Item inválido.']);
    $item = $cat[$itemId];

    try {
        $pdo = db();

        if (usuarioJaPossui($pdo, $uid, $itemId, $item)) {
            out(['ok' => false, 'msg' => 'Você já possui este item.']);
        }

        // Inserir transação pendente
        $pdo->prepare("
            INSERT INTO transacoes (user_id, item_id, item_tipo, valor, status)
            VALUES (?, ?, ?, ?, 'pending')
        ")->execute([$uid, $itemId, $item['tipo'], $item['preco']]);
        $txId   = (int)$pdo->lastInsertId();
        $extRef = "uid:{$uid}:item:{$itemId}:tx:{$txId}";

        // Detecta host não-público: localhost, 127.x, 192.168.x, 10.x, 172.16-31.x
        $host      = $_SERVER['HTTP_HOST'] ?? '';
        $hostIp    = preg_replace('/:\d+$/', '', $host); // remove porta
        $isPublic  = filter_var($hostIp, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)
                  && !in_array($hostIp, ['localhost','127.0.0.1','::1'], true)
                  && !str_starts_with($host, 'localhost');

        $prefData = [
            'items' => [[
                'id'          => $itemId,
                'title'       => 'Nexarion Infinity — ' . $item['nome'],
                'quantity'    => 1,
                'unit_price'  => (float)$item['preco'],
                'currency_id' => 'BRL',
            ]],
            'external_reference'   => $extRef,
            'expires'              => false,
            'statement_descriptor' => 'NEXARION INFINITY',
        ];

        // back_urls e webhook só funcionam com URL pública (HTTPS em domínio real)
        if ($isPublic) {
            $prefData['back_urls'] = [
                'success' => SITE_URL . '/api/pagamento.php?action=retorno&status=success&tx=' . $txId,
                'failure' => SITE_URL . '/api/pagamento.php?action=retorno&status=failure&tx=' . $txId,
                'pending' => SITE_URL . '/api/pagamento.php?action=retorno&status=pending&tx=' . $txId,
            ];
            $prefData['auto_return']      = 'approved';
            $prefData['notification_url'] = SITE_URL . '/api/pagamento.php?action=webhook';
        }

        // Criar preferência via SDK
        $prefClient = new PreferenceClient();
        $preference = $prefClient->create($prefData);

        $pdo->prepare("UPDATE transacoes SET mp_preference_id=? WHERE id=?")
            ->execute([$preference->id, $txId]);

        $checkoutUrl = MP_SANDBOX
            ? ($preference->sandbox_init_point ?? $preference->init_point)
            : $preference->init_point;

        out(['ok' => true, 'tx_id' => $txId, 'checkout_url' => $checkoutUrl]);

    } catch (MPApiException $e) {
        $apiContent = $e->getApiResponse()->getContent();
        $mpMsg = is_array($apiContent) ? ($apiContent['message'] ?? $apiContent['error'] ?? 'Erro MP') : $e->getMessage();
        error_log("MP criar preference: " . $e->getMessage() . " | " . json_encode($apiContent));
        out(['ok' => false, 'msg' => 'Erro MP: ' . $mpMsg]);
    } catch (PDOException $e) {
        error_log("pagamento criar DB: " . $e->getMessage());
        out(['ok' => false, 'msg' => 'Erro banco: ' . $e->getMessage()], 500);
    } catch (Exception $e) {
        error_log("pagamento criar geral: " . $e->getMessage());
        out(['ok' => false, 'msg' => 'Erro: ' . $e->getMessage()], 500);
    }
    break;
}

// ── Verificar status (polling do frontend) ────────────────────────────────────
case 'status': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);

    $txId = (int)($_GET['id'] ?? $input['id'] ?? 0);
    if (!$txId) out(['ok' => false, 'msg' => 'ID inválido.']);

    try {
        $pdo = db();
        $s   = $pdo->prepare("SELECT * FROM transacoes WHERE id=? AND user_id=? LIMIT 1");
        $s->execute([$txId, $uid]);
        $tx  = $s->fetch();
        if (!$tx) out(['ok' => false, 'msg' => 'Transação não encontrada.'], 404);

        if ($tx['status'] === 'approved') {
            out(['ok' => true, 'status' => 'approved', 'item_id' => $tx['item_id']]);
        }

        if (in_array($tx['status'], ['rejected', 'cancelled', 'refunded'], true)) {
            out(['ok' => true, 'status' => $tx['status']]);
        }

        // Consulta direta no MP se já houver payment_id
        if (!empty($tx['mp_payment_id'])) {
            $payment = buscarPagamento($tx['mp_payment_id']);
            if ($payment) {
                if ($payment->status === 'approved') {
                    $cat  = catalogo();
                    $item = $cat[$tx['item_id']] ?? null;
                    if ($item) entregarItem($pdo, $uid, $tx['item_id'], $item);
                    $pdo->prepare("UPDATE transacoes SET status='approved' WHERE id=?")->execute([$txId]);
                    out(['ok' => true, 'status' => 'approved', 'item_id' => $tx['item_id']]);
                }
                if (in_array($payment->status, ['rejected', 'cancelled', 'refunded'], true)) {
                    $pdo->prepare("UPDATE transacoes SET status=? WHERE id=?")->execute([$payment->status, $txId]);
                    out(['ok' => true, 'status' => $payment->status]);
                }
            }
        }

        out(['ok' => true, 'status' => $tx['status']]);

    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro ao verificar status.'], 500);
    }
    break;
}

// ── Webhook do Mercado Pago ───────────────────────────────────────────────────
case 'webhook': {
    http_response_code(200); // Responde 200 imediatamente (exigência do MP)

    $body   = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
    $type   = $body['type']       ?? $_GET['type']    ?? '';
    $dataId = $body['data']['id'] ?? $_GET['data_id'] ?? '';

    if ($type !== 'payment' || !$dataId) { echo 'ok'; exit; }

    $payment = buscarPagamento((string)$dataId);
    if (!$payment) { echo 'ok'; exit; }

    $extRef    = $payment->external_reference ?? '';
    $payStatus = $payment->status ?? 'unknown';

    if (!preg_match('/uid:(\d+):item:([^:]+):tx:(\d+)/', $extRef, $m)) {
        echo 'ok'; exit;
    }

    $payUid  = (int)$m[1];
    $payItem = $m[2];
    $payTxId = (int)$m[3];

    try {
        $pdo = db();
        $s   = $pdo->prepare("SELECT * FROM transacoes WHERE id=? AND user_id=? LIMIT 1");
        $s->execute([$payTxId, $payUid]);
        $tx  = $s->fetch();

        if (!$tx || $tx['status'] === 'approved') { echo 'ok'; exit; }

        $pdo->prepare("UPDATE transacoes SET mp_payment_id=? WHERE id=?")->execute([$dataId, $payTxId]);

        if ($payStatus === 'approved') {
            $cat  = catalogo();
            $item = $cat[$payItem] ?? null;
            if ($item) entregarItem($pdo, $payUid, $payItem, $item);
            $pdo->prepare("UPDATE transacoes SET status='approved', mp_payment_id=? WHERE id=?")
                ->execute([$dataId, $payTxId]);
        } elseif (in_array($payStatus, ['rejected', 'cancelled', 'refunded'], true)) {
            $pdo->prepare("UPDATE transacoes SET status=? WHERE id=?")->execute([$payStatus, $payTxId]);
        }
    } catch (PDOException $e) {
        error_log("webhook DB error: " . $e->getMessage());
    }

    echo 'ok'; exit;
}

// ── Retorno do usuário após checkout (back_url) ───────────────────────────────
case 'retorno': {
    $status = $_GET['status']     ?? 'unknown';
    $txId   = (int)($_GET['tx']   ?? 0);
    $payId  = $_GET['payment_id'] ?? '';

    if ($payId && $txId) {
        try {
            $pdo = db();
            $pdo->prepare("UPDATE transacoes SET mp_payment_id=? WHERE id=?")->execute([$payId, $txId]);

            if ($status === 'success') {
                $payment = buscarPagamento($payId);
                if ($payment && $payment->status === 'approved') {
                    $s = $pdo->prepare("SELECT * FROM transacoes WHERE id=? LIMIT 1");
                    $s->execute([$txId]);
                    $tx = $s->fetch();
                    if ($tx && $tx['status'] !== 'approved') {
                        $cat  = catalogo();
                        $item = $cat[$tx['item_id']] ?? null;
                        if ($item) entregarItem($pdo, (int)$tx['user_id'], $tx['item_id'], $item);
                        $pdo->prepare("UPDATE transacoes SET status='approved' WHERE id=?")->execute([$txId]);
                    }
                }
            }
        } catch (PDOException $e) {
            error_log("retorno DB error: " . $e->getMessage());
        }
    }

    header('Content-Type: text/html; charset=utf-8');
    header("Location: " . SITE_URL . "/?pag={$status}&tx={$txId}");
    exit;
}

// ── Criar transação PIX estático (sem gateway) ───────────────────────────────
case 'criar_pix_estatico': {
    if (!$uid) out(['ok' => false, 'msg' => 'Faça login para comprar.'], 401);

    $itemId = trim($input['item_id'] ?? '');
    $cat    = catalogo();
    if (!isset($cat[$itemId])) out(['ok' => false, 'msg' => 'Item inválido.']);
    $item = $cat[$itemId];

    try {
        $pdo = db();

        if (usuarioJaPossui($pdo, $uid, $itemId, $item)) {
            out(['ok' => false, 'msg' => 'Você já possui este item.']);
        }

        // status='pending', mp_preference_id='pix_estatico' identifica este tipo de transação
        $pdo->prepare("
            INSERT INTO transacoes (user_id, item_id, item_tipo, valor, status, mp_preference_id)
            VALUES (?, ?, ?, ?, 'pending', 'pix_estatico')
        ")->execute([$uid, $itemId, $item['tipo'], $item['preco']]);

        out(['ok' => true, 'tx_id' => (int)$pdo->lastInsertId()]);

    } catch (PDOException $e) {
        error_log("criar_pix_estatico DB: " . $e->getMessage());
        out(['ok' => false, 'msg' => 'Erro banco. Contate o suporte.'], 500);
    }
    break;
}

// ── Verificar status PIX estático (polling do frontend) ──────────────────────
case 'verificar_pix_estatico': {
    if (!$uid) out(['ok' => false, 'msg' => 'Não autenticado.'], 401);

    $txId = (int)($_GET['tx_id'] ?? $input['tx_id'] ?? 0);
    if (!$txId) out(['ok' => false, 'msg' => 'ID inválido.']);

    try {
        $pdo = db();
        $s   = $pdo->prepare("SELECT * FROM transacoes WHERE id=? AND user_id=? AND mp_preference_id='pix_estatico' LIMIT 1");
        $s->execute([$txId, $uid]);
        $tx  = $s->fetch();
        if (!$tx) out(['ok' => false, 'msg' => 'Transação não encontrada.'], 404);

        if ($tx['status'] === 'approved') {
            out(['ok' => true, 'status' => 'approved', 'item_id' => $tx['item_id']]);
        }

        out(['ok' => true, 'status' => $tx['status']]);

    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro ao verificar.'], 500);
    }
    break;
}

// ── Admin: listar/aprovar pagamentos PIX manuais ──────────────────────────────
case 'admin_pix': {
    $key = $_GET['key'] ?? $input['key'] ?? '';
    if ($key !== ADMIN_KEY) out(['ok' => false, 'msg' => 'Acesso negado.'], 403);

    $txId   = (int)($_GET['tx']    ?? $input['tx']    ?? 0);
    $aprovar = ($_GET['aprovar'] ?? $input['aprovar'] ?? '') === '1';

    try {
        $pdo = db();

        if ($txId && $aprovar) {
            $s = $pdo->prepare("SELECT * FROM transacoes WHERE id=? AND mp_preference_id='pix_estatico' AND status='pending' LIMIT 1");
            $s->execute([$txId]);
            $tx = $s->fetch();
            if (!$tx) out(['ok' => false, 'msg' => 'Transação não encontrada ou já processada.']);

            $cat  = catalogo();
            $item = $cat[$tx['item_id']] ?? null;
            if (!$item) out(['ok' => false, 'msg' => 'Item inválido.']);

            entregarItem($pdo, (int)$tx['user_id'], $tx['item_id'], $item);
            $pdo->prepare("UPDATE transacoes SET status='approved' WHERE id=?")->execute([$txId]);

            out(['ok' => true, 'msg' => "Pagamento #$txId aprovado. Item '{$tx['item_id']}' entregue ao usuário {$tx['user_id']}."]);
        }

        // Listar pendentes
        $s = $pdo->prepare("
            SELECT t.id, t.item_id, t.valor, t.criado_em, u.nome_usuario
            FROM transacoes t
            JOIN usuarios u ON u.id = t.user_id
            WHERE t.mp_preference_id = 'pix_estatico' AND t.status = 'pending'
            ORDER BY t.criado_em DESC
        ");
        $s->execute();
        out(['ok' => true, 'pendentes' => $s->fetchAll(PDO::FETCH_ASSOC)]);

    } catch (PDOException $e) {
        out(['ok' => false, 'msg' => 'Erro DB: ' . $e->getMessage()], 500);
    }
    break;
}

default:
    out(['ok' => false, 'msg' => 'Ação inválida.'], 400);
}
