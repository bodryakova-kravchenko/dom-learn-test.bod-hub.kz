<?php
// crud.php
// Единый файл BackEnd: подключение к БД, функции CRUD, загрузка изображений, выдача JS админки.
// Вся публичная часть рендера выполняется в index.php. Здесь — только данные и API.

// Включаем ошибки (по ТЗ — показываем и на проде на время тестирования)
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) session_start();

// Подключаем централизованную конфигурацию (ENV, PDO, медиа и т.д.)
require_once __DIR__ . '/config.php';
// Слой доступа к данным (все обращения к БД теперь тут)
require_once __DIR__ . '/db-api.php';
// Модуль аутентификации админки
require_once __DIR__ . '/bod/auth.php';

// Базовый путь приложения (если развернуто в подпапке домена)
$__BASE = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($__BASE === '/') { $__BASE = ''; }
function base_path_crud(): string { global $__BASE; return $__BASE ?: ''; }
function asset_crud(string $path): string { $b = base_path_crud(); return ($b === '' ? '' : $b) . $path; }

// ================== Конфиг / подключение к БД ==================
// Вынесено в config.php: env_load(), env_get(), db(), admin_credentials(), media_config().

// ================== Публичные функции чтения (используются index.php) ==================

/** Получить все уровни в порядке number ASC */
function db_get_levels(): array {
    return db_levels_all();
}

/** Получить уровень по number+slug */
function db_get_level_by_number_slug(int $number, string $slug): ?array {
    // Делегируем в db-api
    return db_level_by_number_slug($number, $slug);
}

/** Секции по level_id (section_order ASC) */
function db_get_sections_by_level_id(int $level_id): array {
    return db_sections_by_level($level_id);
}

/** Найти раздел по level_id + section_order + slug */
function db_get_section_by_level_order_slug(int $level_id, int $order, string $slug): ?array {
    return db_section_by_level_order_slug($level_id, $order, $slug);
}

/** Уроки по section_id (lesson_order ASC) */
function db_get_lessons_by_section_id(int $section_id): array {
    return db_lessons_by_section($section_id);
}

/** Найти урок по section_id + lesson_order + slug */
function db_get_lesson_by_section_order_slug(int $section_id, int $order, string $slug): ?array {
    return db_lesson_by_section_order_slug($section_id, $order, $slug);
}

/** Предыдущий и следующий урок в разделе по lesson_order */
function db_get_prev_next_lesson(int $section_id, int $order): array {
    return db_prev_next_lesson($section_id, $order);
}

// ================== API (минимум для начала) ==================

$action = $_GET['action'] ?? '';
if ($action !== '') {
    // Проксируем все API-запросы на api.php, сохраняя метод и тело (HTTP 307)
    $url = base_path_crud() . '/api.php?action=' . rawurlencode($action);
    http_response_code(307);
    header('Location: ' . $url);
    exit;
}

// ================== Вспомогательные общие функции API/CRUD ==================

function json_response($data): void {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}

function validate_slug(string $slug): bool {
    return db_validate_slug($slug);
}

function rrmdir(string $dir): void {
    if (!is_dir($dir)) return;
    $items = scandir($dir);
    foreach ($items as $it) {
        if ($it === '.' || $it === '..') continue;
        $path = $dir . DIRECTORY_SEPARATOR . $it;
        if (is_dir($path)) rrmdir($path); else @unlink($path);
    }
    @rmdir($dir);
}

// ================== TREE для админки ==================
function api_admin_tree(): void {
    if (!is_admin_authenticated()) { http_response_code(401); json_response(['error'=>'Unauthorized']); return; }
    // Дерево формируем через слой db-api
    $tree = db_admin_tree();
    json_response($tree);
}

// ================== SECTIONS: save/delete/reorder ==================
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

// ================== LESSONS: save/delete/reorder ==================
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
// Конец файла crud.php