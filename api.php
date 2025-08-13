<?php
/**
 * api.php — централизованный роутер API
 *
 * Задача: принять параметр action и вызвать соответствующую функцию-обработчик.
 * Вся работа с БД — в db-api.php, авторизация — в bod/auth.php, загрузка изображений — в img-upload.php.
 */

declare(strict_types=1);

// Централизованные настройки окружения и сессии
require_once __DIR__ . '/config.php';
// Слой доступа к данным
require_once __DIR__ . '/db-api.php';
// Вспомогательные функции (json_response, base_path, asset, validate_slug, rrmdir)
require_once __DIR__ . '/helpers.php';
// Аутентификация администратора
require_once __DIR__ . '/bod/auth.php';
// Загрузка изображений
require_once __DIR__ . '/img-upload.php';

// Базовый путь (если развёрнуто в подпапке)
$__BASE = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($__BASE === '/') { $__BASE = ''; }

// Читаем action
$action = $_GET['action'] ?? '';

if ($action === '') {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'action required'], JSON_UNESCAPED_UNICODE);
    exit;
}

switch ($action) {
    case 'admin_js':
        // Совместимость: ранее JS админки генерировался из PHP. Теперь отдаём статический файл bod/bod.js.
        $path = __DIR__ . '/bod/bod.js';
        if (is_file($path)) {
            header('Content-Type: application/javascript; charset=utf-8');
            header('Cache-Control: public, max-age=3600');
            readfile($path);
        } else {
            http_response_code(404);
            json_response(['error' => 'admin_js not found']);
        }
        exit;

    case 'upload_image':
        api_upload_image();
        exit;

    case 'tree':
        api_admin_tree();
        exit;

    case 'section_save':
        api_section_save();
        exit;

    case 'section_delete':
        api_section_delete();
        exit;

    case 'lesson_save':
        api_lesson_save();
        exit;

    case 'lesson_delete':
        api_lesson_delete();
        exit;

    case 'ping_login':
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['ok'=>false,'error'=>'method']); exit; }
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?: [];
        if (admin_login((string)($data['l'] ?? ''), (string)($data['p'] ?? ''))) {
            json_response(['ok'=>true]);
        } else { http_response_code(401); json_response(['ok'=>false]); }
        exit;

    case 'logout':
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['ok'=>false,'error'=>'method']); exit; }
        admin_logout();
        json_response(['ok'=>true]);
        exit;

    case 'session_ok':
        if (is_admin_authenticated()) { json_response(['ok'=>true]); } else { http_response_code(401); json_response(['ok'=>false]); }
        exit;

    default:
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
        exit;
}

// ================== Обработчики API (перенесены из crud.php) ==================

function api_admin_tree(): void {
    if (!is_admin_authenticated()) { http_response_code(401); json_response(['error'=>'Unauthorized']); return; }
    $tree = db_admin_tree();
    json_response($tree);
}

function api_section_save(): void {
    if (!is_admin_authenticated()) { http_response_code(401); json_response(['error'=>'Unauthorized']); return; }
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['error'=>'method']); return; }
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    try {
        $res = db_section_save($data);
        json_response(['ok'=>true, 'id'=>$res['id']]);
    } catch (RuntimeException $e) {
        http_response_code(400);
        json_response(['error'=>$e->getMessage()]);
    }
}

function api_section_delete(): void {
    if (!is_admin_authenticated()) { http_response_code(401); json_response(['error'=>'Unauthorized']); return; }
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['error'=>'method']); return; }
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    try {
        db_section_delete($data['id']);
        json_response(['ok'=>true]);
    } catch (RuntimeException $e) {
        http_response_code(400);
        json_response(['error'=>$e->getMessage()]);
    }
}

function api_lesson_save(): void {
    if (!is_admin_authenticated()) { http_response_code(401); json_response(['error'=>'Unauthorized']); return; }
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['error'=>'method']); return; }
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    try {
        $res = db_lesson_save($data);
        json_response(['ok'=>true, 'id'=>$res['id']]);
    } catch (RuntimeException $e) {
        http_response_code(400);
        json_response(['error'=>$e->getMessage()]);
    }
}

function api_lesson_delete(): void {
    if (!is_admin_authenticated()) { http_response_code(401); json_response(['error'=>'Unauthorized']); return; }
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['error'=>'method']); return; }
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $id = (int)($data['id'] ?? 0);
    try {
        db_lesson_delete($id);
        json_response(['ok'=>true]);
    } catch (RuntimeException $e) {
        http_response_code(400);
        json_response(['error'=>$e->getMessage()]);
    }
}
