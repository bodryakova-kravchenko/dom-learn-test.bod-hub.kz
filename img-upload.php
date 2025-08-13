<?php
/**
 * img-upload.php — модуль загрузки изображений
 *
 * Содержит обработчик API для загрузки файла урока.
 * Валидация: метод POST, авторизация админа (сессия),
 * размер файла, тип/расширение, безопасное имя, сохранение в каталог урока.
 */

declare(strict_types=1);

// Здесь не подключаем config.php напрямую — ожидаем, что файл подключается из api.php,
// где уже подключены config.php и модуль админки (для is_admin_authenticated()) и доступна media_config().

/** Загрузка изображения в uploads/level_slug/section_slug/lesson_slug/, форматы: png,jpg,webp,gif; до 5 МБ (или из media_config) */
function api_upload_image(): void {
    // Проверка метода
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    // Простая проверка авторизации админки (сессия)
    if (!function_exists('is_admin_authenticated') || !is_admin_authenticated()) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $lesson_id = (int)($_POST['lesson_id'] ?? 0);
    if ($lesson_id <= 0) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'lesson_id is required']);
        return;
    }

    if (!isset($_FILES['file'])) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'file is required']);
        return;
    }

    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'upload error', 'code' => $file['error'] ?? -1]);
        return;
    }

    // Ограничение размера и разрешённые типы берём из media_config()
    if (!function_exists('media_config')) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'media config missing']);
        return;
    }
    $mc = media_config();
    if (($file['size'] ?? 0) > ($mc['max_bytes'] ?? (5 * 1024 * 1024))) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'file too large']);
        return;
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $allowedMime = $mc['allowed_mime'] ?? ['image/png','image/jpeg','image/webp'];
    $allowedExt  = $mc['allowed_ext']  ?? ['png','jpg','jpeg','webp'];
    if (!in_array($mime, $allowedMime, true)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'unsupported type']);
        return;
    }

    // Определяем расширение
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($ext === 'jpeg') { $ext = 'jpg'; }
    if (!in_array($ext, $allowedExt, true)) {
        // Фоллбек по MIME
        $map = ['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'];
        $ext = $map[$mime] ?? 'png';
    }

    // Разрешение пути загрузки по слагам
    if (!function_exists('db_slugs_by_lesson_id')) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'db helper missing']);
        return;
    }
    $sl = db_slugs_by_lesson_id($lesson_id);
    if (!$sl) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'lesson not found']);
        return;
    }
    $uploadsRoot = $mc['uploads_dir'] ?? (__DIR__ . '/uploads');
    $dir = rtrim($uploadsRoot, '/\\') . '/' . $sl['level_slug'] . '/' . $sl['section_slug'] . '/' . $sl['lesson_slug'];
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }

    // Генерируем безопасное имя файла
    $base = pathinfo($file['name'], PATHINFO_FILENAME);
    $base = preg_replace('~[^a-zA-Z0-9_-]+~', '-', (string)$base) ?: 'image';
    $name = $base . '-' . date('Ymd-His') . '-' . substr(bin2hex(random_bytes(3)), 0, 6) . '.' . $ext;
    $dest = $dir . '/' . $name;

    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'failed to move file']);
        return;
    }

    $urlBase = '/uploads/' . $sl['level_slug'] . '/' . $sl['section_slug'] . '/' . $sl['lesson_slug'] . '/';
    $url = $urlBase . $name;
    header('Content-Type: application/json');
    echo json_encode(['url' => $url, 'filename' => $name]);
}
