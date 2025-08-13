<?php
/**
 * config.php — централизованная конфигурация приложения DOMLearn
 *
 * Здесь собраны:
 * - Загрузка переменных окружения из .env (без внешних библиотек)
 * - Настройка подключения к БД через PDO (MySQL)
 * - Конфигурация медиа (каталог изображений, допустимые типы, лимиты)
 * - Креды администратора (из .env)
 *
 * ВАЖНО:
 * - Все вызовы БД используйте через функцию db() из этого файла.
 * - Не храните секреты в репозитории, используйте .env.
 */

// Включаем строгие типы и разумные настройки ошибок
declare(strict_types=1);

// Централизованная настройка ошибок: на проде не показываем, логируем в файл
// Отображение ошибок выключено
@ini_set('display_errors', '0');
@ini_set('display_startup_errors', '0');
// Репортим всё важное, но без шумных устаревших/строгих в проде
@error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
// Включаем логирование
@ini_set('log_errors', '1');
// Путь к логу: storage/logs/app-php-error.log (создадим каталог при необходимости)
(function(){
    $logDir = __DIR__ . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $logFile = $logDir . DIRECTORY_SEPARATOR . 'app-php-error.log';
    // Если каталог существует или успешно создан — направляем error_log туда
    if (is_dir($logDir) && is_writable($logDir)) {
        @ini_set('error_log', $logFile);
        // Мини-ротация по размеру: при превышении лимита переименовываем текущий лог и создаём новый
        $maxMb = (int) (env_get('LOG_MAX_MB', '10') ?? '10');
        if ($maxMb < 1) { $maxMb = 10; }
        $maxBytes = $maxMb * 1024 * 1024;
        $size = @filesize($logFile);
        if (is_int($size) && $size > $maxBytes) {
            $suffix = date('Ymd-His');
            $rotated = $logDir . DIRECTORY_SEPARATOR . 'app-php-error-' . $suffix . '.log';
            @rename($logFile, $rotated);
            @touch($logFile);
            @chmod($logFile, 0644);
        }
    } else {
        // Фолбэк: системный temp
        $tmp = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'app-php-error.log';
        @ini_set('error_log', $tmp);
    }
})();

// Настраиваем cookie параметы для PHP-сессии ДО session_start()
if (session_status() === PHP_SESSION_NONE) {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    // Формируем опции cookie (PHP >= 7.3 поддерживает массив)
    $cookieOpts = [
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ];
    // Применяем параметры и запускаем сессию
    if (function_exists('session_set_cookie_params')) {
        session_set_cookie_params($cookieOpts);
    }
    session_start();
}

// -------- Загрузка .env --------
/**
 * Простой парсер .env.
 * Формат: KEY=VALUE, строки с # игнорируются.
 */
function env_load(string $path): array {
    $res = [];
    if (!is_file($path)) return $res;
    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        $pos = strpos($line, '=');
        if ($pos === false) continue;
        $key = trim(substr($line, 0, $pos));
        $val = trim(substr($line, $pos + 1));
        $res[$key] = $val;
    }
    return $res;
}

// Кэшируем .env в памяти процесса
function env_all(): array {
    static $cache = null;
    if ($cache === null) {
        $cache = env_load(__DIR__ . '/.env');
    }
    return $cache;
}

/** Получить переменную окружения (из .env) с дефолтом */
function env_get(string $key, ?string $default = null): ?string {
    $env = env_all();
    return array_key_exists($key, $env) ? (string)$env[$key] : $default;
}

// -------- Подключение к БД (PDO) --------
/**
 * Глобальный доступ к PDO (Singleton на время запроса).
 * Настраивается через переменные окружения:
 * DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_CHARSET (по умолчанию utf8mb4).
 */
function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $host = env_get('DB_HOST', 'localhost');
    $name = env_get('DB_NAME', '');
    $user = env_get('DB_USER', '');
    $pass = env_get('DB_PASSWORD', '');
    $charset = env_get('DB_CHARSET', 'utf8mb4');

    $dsn = "mysql:host={$host};dbname={$name};charset={$charset}";
    $opt = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $pdo = new PDO($dsn, $user, $pass, $opt);
    // Единый collation соединения
    $pdo->exec('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
    return $pdo;
}

// -------- Креды администратора --------
/**
 * Админский логин и пароль берём из .env.
 * Пример .env:
 *   ADMIN_LOGIN=admin
 *   ADMIN_PASSWORD=secret
 */
function admin_credentials(): array {
    return [
        'login' => env_get('ADMIN_LOGIN', 'admin'),
        'password' => env_get('ADMIN_PASSWORD', 'admin'),
    ];
}

// -------- Медиа-конфигурация --------
/**
 * Параметры загрузки изображений.
 * - Новый каталог для загрузок: /uploads (структура: /uploads/level_slug/section_slug/lesson_slug)
 * - Легаси каталог картинок: /images (старый формат: images/lesson_{lesson_id}/)
 * - Максимальный размер: 5 МБ (можно изменить через ENV: UPLOAD_MAX_MB)
 * - Разрешённые расширения и MIME-типы
 */
function media_config(): array {
    $root = __DIR__;
    $imagesDir = $root . '/images';
    $uploadsDir = $root . '/uploads';
    $maxMb = (int)(env_get('UPLOAD_MAX_MB', '5'));
    $maxBytes = max(1, $maxMb) * 1024 * 1024;
    return [
        'root' => $root,
        'images_dir' => $imagesDir,   // старый каталог (legacy)
        'uploads_dir' => $uploadsDir, // новый каталог (uploads)
        'max_bytes' => $maxBytes,
        'allowed_ext' => ['png','jpg','jpeg','webp'],
        'allowed_mime' => ['image/png','image/jpeg','image/webp'],
    ];
}

// -------- Утилиты путей (на будущее) --------
/** Безопасное склеивание путей */
function path_join(string ...$parts): string {
    $p = implode('/', array_map(fn($s) => trim($s, '/'), $parts));
    return preg_replace('~/{2,}~', '/', $p) ?: '';
}
