<?php
/**
 * api.php — централизованный роутер API
 *
 * Задача: принять параметр action и вызвать соответствующую функцию-обработчик.
 * На данном этапе обработчики продолжают жить в crud.php, а работа с БД — в db-api.php.
 * В следующих шагах вынесем загрузку изображений и авторизацию в отдельные файлы.
 */

declare(strict_types=1);

// Включаем ошибки на время рефакторинга
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) session_start();

// Подключаем необходимые слои
require_once __DIR__ . '/crud.php'; // внутри уже подключены config.php и db-api.php
require_once __DIR__ . '/img-upload.php'; // загрузка изображений вынесена сюда

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
        // отдаём JS админки (временно остаётся здесь для совместимости)
        header('Content-Type: application/javascript; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Cache-Control: post-check=0, pre-check=0', false);
        header('Pragma: no-cache');
        header('Expires: 0');
        echo admin_js_bundle();
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
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['ok'=>false,'error'=>'method']); }
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?: [];
        if (admin_login((string)($data['l'] ?? ''), (string)($data['p'] ?? ''))) {
            json_response(['ok'=>true]);
        } else { http_response_code(401); json_response(['ok'=>false]); }
        exit;

    case 'logout':
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); json_response(['ok'=>false,'error'=>'method']); }
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
