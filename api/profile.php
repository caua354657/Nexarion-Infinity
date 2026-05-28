<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

session_start();
require_once __DIR__ . '/db.php';

function json_out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if (empty($_SESSION['user_id'])) json_out(['ok' => false, 'msg' => 'Não autenticado.'], 401);

$action = $_POST['action'] ?? '';

if ($action === 'upload') {
    if (empty($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK)
        json_out(['ok' => false, 'msg' => 'Nenhum arquivo enviado.']);

    $file = $_FILES['foto'];
    if ($file['size'] > 2 * 1024 * 1024)
        json_out(['ok' => false, 'msg' => 'Imagem deve ter no máximo 2 MB.']);

    $finfo  = new finfo(FILEINFO_MIME_TYPE);
    $mime   = $finfo->file($file['tmp_name']);
    $extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    if (!isset($extMap[$mime]))
        json_out(['ok' => false, 'msg' => 'Tipo não permitido. Use JPG, PNG, GIF ou WebP.']);

    $ext      = $extMap[$mime];
    $filename = 'user_' . $_SESSION['user_id'] . '_' . time() . '.' . $ext;
    $destDir  = __DIR__ . '/../foto/';

    // Delete old photo
    try {
        $stmt = db()->prepare('SELECT foto FROM usuarios WHERE id = ? LIMIT 1');
        $stmt->execute([$_SESSION['user_id']]);
        $old  = $stmt->fetch();
        if ($old && $old['foto']) {
            $oldPath = $destDir . basename($old['foto']);
            if (file_exists($oldPath)) @unlink($oldPath);
        }
    } catch (PDOException $e) { /* non-fatal */ }

    if (!move_uploaded_file($file['tmp_name'], $destDir . $filename))
        json_out(['ok' => false, 'msg' => 'Falha ao salvar imagem.']);

    try {
        db()->prepare('UPDATE usuarios SET foto = ? WHERE id = ?')->execute([$filename, $_SESSION['user_id']]);
        json_out(['ok' => true, 'foto' => $filename]);
    } catch (PDOException $e) {
        @unlink($destDir . $filename);
        json_out(['ok' => false, 'msg' => 'Erro ao atualizar perfil.'], 500);
    }

} else {
    json_out(['ok' => false, 'msg' => 'Ação desconhecida.'], 400);
}
