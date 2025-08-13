<?php
/**
 * helpers.php — общие вспомогательные функции приложения
 *
 * Здесь собраны утилиты без побочных эффектов:
 * - base_path(): вычисление базового пути приложения (если развёрнуто в подпапке)
 * - asset(): построение URL для ассетов с учётом base_path
 * - json_response(): единый JSON-ответ API
 * - validate_slug(): обёртка над db_validate_slug() из db-api.php
 */

declare(strict_types=1);

// Важно: никаких session_start() и других сайд-эффектов здесь нет

/**
 * Базовый путь приложения относительно домена.
 * Пример: если скрипт лежит в /subdir/index.php — вернёт "/subdir"
 * Если на корне домена — вернёт пустую строку "".
 */
function base_path(): string {
    static $cached = null;
    if ($cached !== null) return $cached;
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($base === '/' || $base === '.') { $base = ''; }
    return $cached = ($base ?: '');
}

/** Построение URL для ассетов с учётом базового пути */
function asset(string $path): string {
    $b = base_path();
    return ($b === '' ? '' : $b) . $path;
}

/** Стандартизованный JSON-ответ для API */
function json_response($data): void {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}

/** Обёртка валидации slug через DAO-уровень */
function validate_slug(string $slug): bool {
    // Функция db_validate_slug() объявлена в db-api.php
    return db_validate_slug($slug);
}

// rrmdir() удалён как неиспользуемый дубликат (см. db-api.php::db_rrmdir)
