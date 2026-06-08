<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function out(array $d, int $c = 200): void {
    http_response_code($c);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

// Parse JSON body or form data
$ct    = $_SERVER['CONTENT_TYPE'] ?? '';
$input = strpos($ct, 'application/json') !== false
       ? (json_decode(file_get_contents('php://input'), true) ?? [])
       : $_POST;
$action = $input['action'] ?? '';

switch ($action) {

case 'register': {
    $u = trim($input['username'] ?? '');
    $e = strtolower(trim($input['email'] ?? ''));
    $p = $input['password'] ?? '';

    if (strlen($u) < 3)                            out(['ok'=>false,'msg'=>'Nome deve ter ao menos 3 caracteres.']);
    if (!filter_var($e, FILTER_VALIDATE_EMAIL))    out(['ok'=>false,'msg'=>'Email inválido.']);
    if (strlen($p) < 6)                            out(['ok'=>false,'msg'=>'Senha deve ter ao menos 6 caracteres.']);

    try {
        $pdo = db();
        $s = $pdo->prepare('SELECT id FROM usuarios WHERE email=? OR nome_usuario=? LIMIT 1');
        $s->execute([$e, $u]);
        if ($s->fetch()) out(['ok'=>false,'msg'=>'Email ou usuário já em uso.']);

        $foto = null;
        if (!empty($_FILES['foto']) && $_FILES['foto']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['foto'];
            if ($file['size'] <= 2*1024*1024) {
                $finfo = new finfo(FILEINFO_MIME_TYPE);
                $map   = ['image/jpeg'=>'jpg','image/png'=>'png','image/gif'=>'gif','image/webp'=>'webp'];
                $mime  = $finfo->file($file['tmp_name']);
                if (isset($map[$mime])) {
                    $fn = 'u_'.bin2hex(random_bytes(8)).'.'.$map[$mime];
                    if (move_uploaded_file($file['tmp_name'], __DIR__.'/../foto/'.$fn)) $foto = $fn;
                }
            }
        }

        $pdo->prepare('INSERT INTO usuarios (nome_usuario,email,senha,foto) VALUES (?,?,?,?)')
            ->execute([$u, $e, password_hash($p, PASSWORD_BCRYPT), $foto]);
        $id = (int)$pdo->lastInsertId();

        $cr = $pdo->prepare('SELECT criado_em FROM usuarios WHERE id=? LIMIT 1');
        $cr->execute([$id]);
        $criadoEm = $cr->fetchColumn() ?: date('Y-m-d H:i:s');

        $_SESSION['uid'] = $id;
        out(['ok'=>true,'user'=>['id'=>$id,'username'=>$u,'email'=>$e,'foto'=>$foto,
            'vip'=>false,'doubleNeuron'=>false,'diamantes'=>0,'skins'=>[],'skinAtiva'=>null,
            'createdAt'=>$criadoEm]]);
    } catch (PDOException $ex) {
        out(['ok'=>false,'msg'=>'Erro no banco de dados.'], 500);
    }
    break;
}

case 'login': {
    $id = strtolower(trim($input['identifier'] ?? ''));
    $p  = $input['password'] ?? '';
    if (!$id || !$p) out(['ok'=>false,'msg'=>'Preencha todos os campos.']);

    try {
        $s = db()->prepare('SELECT id,nome_usuario,email,senha,foto,vip,double_neuron,boss_dmg_x2,diamantes,skins,skin_ativa,criado_em FROM usuarios WHERE email=? OR nome_usuario=? LIMIT 1');
        $s->execute([$id, $id]);
        $r = $s->fetch();
        if (!$r || !password_verify($p, $r['senha'])) out(['ok'=>false,'msg'=>'Usuário ou senha incorretos.']);

        $_SESSION['uid'] = (int)$r['id'];
        $skinsArr = $r['skins'] ? (json_decode($r['skins'], true) ?: []) : [];
        out(['ok'=>true,'user'=>[
            'id'           => (int)$r['id'],
            'username'     => $r['nome_usuario'],
            'email'        => $r['email'],
            'foto'         => $r['foto'],
            'vip'          => (bool)$r['vip'],
            'doubleNeuron' => (bool)$r['double_neuron'],
            'bossDmgX2'    => (bool)$r['boss_dmg_x2'],
            'diamantes'    => (int)$r['diamantes'],
            'skins'        => $skinsArr,
            'skinAtiva'    => $r['skin_ativa'],
            'createdAt'    => $r['criado_em'],
        ]]);
    } catch (PDOException $ex) {
        out(['ok'=>false,'msg'=>'Erro no banco de dados.'], 500);
    }
    break;
}

case 'check': {
    if (empty($_SESSION['uid'])) { out(['ok'=>false]); }
    try {
        $s = db()->prepare('SELECT id,nome_usuario,email,foto,vip,double_neuron,boss_dmg_x2,diamantes,skins,skin_ativa,criado_em FROM usuarios WHERE id=? LIMIT 1');
        $s->execute([$_SESSION['uid']]);
        $r = $s->fetch();
        if ($r) {
            $skinsArr = $r['skins'] ? (json_decode($r['skins'], true) ?: []) : [];
            out(['ok'=>true,'user'=>[
                'id'           => (int)$r['id'],
                'username'     => $r['nome_usuario'],
                'email'        => $r['email'],
                'foto'         => $r['foto'],
                'vip'          => (bool)$r['vip'],
                'doubleNeuron' => (bool)$r['double_neuron'],
                'bossDmgX2'    => (bool)$r['boss_dmg_x2'],
                'diamantes'    => (int)$r['diamantes'],
                'skins'        => $skinsArr,
                'skinAtiva'    => $r['skin_ativa'],
                'createdAt'    => $r['criado_em'],
            ]]);
        }
    } catch (PDOException $ex) {}
    out(['ok'=>false]);
    break;
}

case 'logout': {
    session_destroy();
    out(['ok'=>true]);
    break;
}

case 'delete': {
    if (empty($_SESSION['uid'])) out(['ok'=>false,'msg'=>'Não autenticado.'], 401);
    try {
        $pdo = db();
        $s   = $pdo->prepare('SELECT foto FROM usuarios WHERE id=? LIMIT 1');
        $s->execute([$_SESSION['uid']]);
        $r = $s->fetch();
        if ($r && $r['foto']) { $f = __DIR__.'/../foto/'.basename($r['foto']); if (file_exists($f)) @unlink($f); }
        $pdo->prepare('DELETE FROM usuarios WHERE id=?')->execute([$_SESSION['uid']]);
        session_destroy();
        out(['ok'=>true]);
    } catch (PDOException $ex) {
        out(['ok'=>false,'msg'=>'Erro ao excluir.'], 500);
    }
    break;
}

default: out(['ok'=>false,'msg'=>'Ação inválida.'], 400);
}
