<?php
/**
 * Nexarion Infinity — Global Chat API
 * Actions: history | send | perfil
 */
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache');

require_once __DIR__ . '/db.php';

// ── Table bootstrap (idempotent) ──────────────────────────────────────────────
try {
    db()->exec("
        CREATE TABLE IF NOT EXISTS `chat_messages` (
            `id`        INT UNSIGNED      NOT NULL AUTO_INCREMENT,
            `user_id`   INT UNSIGNED      NOT NULL,
            `username`  VARCHAR(50)       NOT NULL,
            `nivel`     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            `vip`       TINYINT(1)        NOT NULL DEFAULT 0,
            `foto`      VARCHAR(200)      NULL DEFAULT NULL,
            `mensagem`  TEXT              NOT NULL,
            `criado_em` TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_chat_user` (`user_id`),
            KEY `idx_chat_time` (`criado_em`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
} catch (PDOException $e) { /* already exists */ }

// ── Add reply_to column if not present (idempotent) ───────────────────────
try {
    db()->exec("ALTER TABLE chat_messages ADD COLUMN reply_to INT UNSIGNED NULL DEFAULT NULL");
} catch (PDOException $e) { /* already exists */ }

// ── Lazy cleanup: 10 % chance — removes messages older than 7 days ─────────
if (mt_rand(1, 10) === 1) {
    try { db()->exec("DELETE FROM chat_messages WHERE criado_em < NOW() - INTERVAL 7 DAY"); }
    catch (PDOException $e) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid(): ?int
{
    return isset($_SESSION['uid']) ? (int)$_SESSION['uid'] : null;
}

function respond(array $data): void
{
    echo json_encode($data);
    exit;
}

// ── Router ────────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'history': actionHistory(); break;
    case 'send':    actionSend();    break;
    case 'perfil':  actionPerfil();  break;
    case 'delete':  actionDelete();  break;
    default:        respond(['ok' => false, 'msg' => 'Ação inválida']);
}

// ── history ───────────────────────────────────────────────────────────────────
function actionHistory(): void
{
    $since = max(0, (int)($_GET['since'] ?? 0));

    if ($since > 0) {
        $stmt = db()->prepare("
            SELECT m.id, m.user_id, m.username, m.nivel, m.vip, m.foto, m.mensagem,
                   UNIX_TIMESTAMP(m.criado_em) AS ts,
                   m.reply_to,
                   r.username AS reply_username,
                   LEFT(r.mensagem, 80) AS reply_mensagem
            FROM chat_messages m
            LEFT JOIN chat_messages r ON r.id = m.reply_to
            WHERE m.id > ?
            ORDER BY m.id ASC
            LIMIT 60
        ");
        $stmt->execute([$since]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = array_reverse(
            db()->query("
                SELECT m.id, m.user_id, m.username, m.nivel, m.vip, m.foto, m.mensagem,
                       UNIX_TIMESTAMP(m.criado_em) AS ts,
                       m.reply_to,
                       r.username AS reply_username,
                       LEFT(r.mensagem, 80) AS reply_mensagem
                FROM chat_messages m
                LEFT JOIN chat_messages r ON r.id = m.reply_to
                ORDER BY m.id DESC
                LIMIT 50
            ")->fetchAll()
        );
    }

    // Online ≈ distinct senders in last 30 minutes
    $online = (int)(db()->query("
        SELECT COUNT(DISTINCT user_id) AS cnt
        FROM chat_messages
        WHERE criado_em > NOW() - INTERVAL 30 MINUTE
    ")->fetch()['cnt'] ?? 0);

    respond(['ok' => true, 'messages' => $rows, 'online' => $online]);
}

// ── send ──────────────────────────────────────────────────────────────────────
function actionSend(): void
{
    $uid = uid();
    if ($uid === null) {
        respond(['ok' => false, 'msg' => 'Faça login para enviar mensagens.']);
    }

    $rawMsg  = trim($_POST['msg'] ?? '');
    $nivel   = max(1, min(9999, (int)($_POST['nivel'] ?? 1)));
    $replyTo = isset($_POST['reply_to']) ? (int)$_POST['reply_to'] : null;
    if ($replyTo !== null && $replyTo > 0) {
        $chk = db()->prepare("SELECT id FROM chat_messages WHERE id = ?");
        $chk->execute([$replyTo]);
        if (!$chk->fetch()) $replyTo = null;
    } else {
        $replyTo = null;
    }

    if ($rawMsg === '')           respond(['ok' => false, 'msg' => 'Mensagem vazia.']);
    if (mb_strlen($rawMsg) > 200) respond(['ok' => false, 'msg' => 'Máximo 200 caracteres.']);

    // ── Anti-spam ─────────────────────────────────────────────────
    $recent = db()->prepare("
        SELECT mensagem, UNIX_TIMESTAMP(criado_em) AS ts
        FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 5
    ");
    $recent->execute([$uid]);
    $rows = $recent->fetchAll();

    if (!empty($rows)) {
        // 1. Cooldown: min 3 s between messages
        $gap = time() - (int)$rows[0]['ts'];
        if ($gap < 3) {
            respond(['ok' => false, 'msg' => 'Aguarde ' . (3 - $gap) . 's.', 'cooldown' => 3 - $gap]);
        }
        // 2. Flood: max 5 messages in 15 s
        $flood = db()->prepare("
            SELECT COUNT(*) AS cnt FROM chat_messages
            WHERE user_id = ? AND criado_em > NOW() - INTERVAL 15 SECOND
        ");
        $flood->execute([$uid]);
        if ((int)($flood->fetch()['cnt'] ?? 0) >= 5) {
            respond(['ok' => false, 'msg' => 'Muitas mensagens em pouco tempo!']);
        }
        // 3. Duplicate: same text within 60 s
        foreach ($rows as $r) {
            if ($r['mensagem'] === $rawMsg && (time() - (int)$r['ts']) < 60) {
                respond(['ok' => false, 'msg' => 'Mensagem duplicada. Aguarde 1 minuto.']);
            }
        }
    }

    // ── Fetch current user data ────────────────────────────────────
    $userStmt = db()->prepare("SELECT nome_usuario, vip, foto FROM usuarios WHERE id = ?");
    $userStmt->execute([$uid]);
    $user = $userStmt->fetch();
    if (!$user) respond(['ok' => false, 'msg' => 'Usuário não encontrado.']);

    // ── Filter & insert ────────────────────────────────────────────
    $msg = filterProfanity($rawMsg);

    $ins = db()->prepare("
        INSERT INTO chat_messages (user_id, username, nivel, vip, foto, mensagem, reply_to)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $ins->execute([$uid, $user['nome_usuario'], $nivel, (int)$user['vip'], $user['foto'], $msg, $replyTo]);
    $newId = (int)db()->lastInsertId();

    $fetch = db()->prepare("
        SELECT m.id, m.user_id, m.username, m.nivel, m.vip, m.foto, m.mensagem,
               UNIX_TIMESTAMP(m.criado_em) AS ts,
               m.reply_to,
               r.username AS reply_username,
               LEFT(r.mensagem, 80) AS reply_mensagem
        FROM chat_messages m
        LEFT JOIN chat_messages r ON r.id = m.reply_to
        WHERE m.id = ?
    ");
    $fetch->execute([$newId]);

    respond(['ok' => true, 'message' => $fetch->fetch()]);
}

// ── delete ────────────────────────────────────────────────────────────────────
function actionDelete(): void
{
    $uid = uid();
    if ($uid === null) respond(['ok' => false, 'msg' => 'Não autenticado.']);

    $id = (int)($_POST['id'] ?? 0);
    if (!$id) respond(['ok' => false, 'msg' => 'ID inválido.']);

    $stmt = db()->prepare("DELETE FROM chat_messages WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $uid]);

    if ($stmt->rowCount() === 0) {
        respond(['ok' => false, 'msg' => 'Mensagem não encontrada.']);
    }
    respond(['ok' => true]);
}

// ── perfil ────────────────────────────────────────────────────────────────────
function actionPerfil(): void
{
    $userId = (int)($_GET['user_id'] ?? 0);
    if (!$userId) respond(['ok' => false, 'msg' => 'ID inválido']);

    $stmt = db()->prepare("SELECT nome_usuario, vip, foto, criado_em FROM usuarios WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) respond(['ok' => false, 'msg' => 'Usuário não encontrado']);

    $lvl = db()->prepare("SELECT nivel FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1");
    $lvl->execute([$userId]);
    $lvlRow = $lvl->fetch();

    respond([
        'ok'       => true,
        'username' => $user['nome_usuario'],
        'vip'      => (bool)$user['vip'],
        'foto'     => $user['foto'],
        'nivel'    => $lvlRow ? (int)$lvlRow['nivel'] : 1,
        'since'    => $user['criado_em'],
    ]);
}

// ── Profanity filter ──────────────────────────────────────────────────────────
function filterProfanity(string $text): string
{
    static $blocked = [
        'puta','merda','caralho','caralha','foda','fdp','viado','vsf','corno','buceta',
        'bitch','fuck','shit','cunt','asshole','nigger','faggot',
    ];
    // Split preserving whitespace tokens
    $tokens = preg_split('/(\s+)/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$text];
    foreach ($tokens as &$t) {
        $clean = preg_replace('/[^a-z]/u', '', mb_strtolower($t)) ?? '';
        foreach ($blocked as $b) {
            if (strpos($clean, $b) !== false) {
                $t = str_repeat('*', mb_strlen($t));
                break;
            }
        }
    }
    return implode('', $tokens);
}
