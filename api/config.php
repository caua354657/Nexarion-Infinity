<?php
/**
 * Nexarion Infinity — Configuração do Mercado Pago
 */

// ── Modo de operação ──────────────────────────────────────────────────────────
define('MP_SANDBOX', false); // false = cobranças reais

// ── Credenciais de Produção ───────────────────────────────────────────────────
define('MP_ACCESS_TOKEN_PROD', 'APP_USR-4983908608220807-060402-7795090deb885fed4ed0fbdfb46cd41e-3450264624');
define('MP_PUBLIC_KEY_PROD',   'APP_USR-15fe4fd6-3fbf-436d-849d-f078b2524fa6');

// ── Credenciais de Sandbox (para testes futuros) ─────────────────────────────
define('MP_ACCESS_TOKEN_SANDBOX', '');
define('MP_PUBLIC_KEY_SANDBOX',   '');

// ── Token ativo ───────────────────────────────────────────────────────────────
define('MP_TOKEN', MP_SANDBOX ? MP_ACCESS_TOKEN_SANDBOX : MP_ACCESS_TOKEN_PROD);

// ── Chave do admin (para aprovar PIX manuais) ────────────────────────────────
define('ADMIN_KEY', 'nexarion_adm_2025');

// ── URL base do site ──────────────────────────────────────────────────────────
// Detectada automaticamente. Funciona em localhost e em produção.
define('SITE_URL',
    (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
    . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')
    . '/' . rawurlencode(basename(dirname(__DIR__)))
);
