<?php
// info.php — диагностическая страница окружения
// Показывает ключевые переменные окружения и базовую информацию о сервере.
// ВНИМАНИЕ: не держите этот файл доступным в продакшене дольше, чем необходимо.

header('Content-Type: text/html; charset=utf-8');

echo '<!doctype html><html><head><meta charset="utf-8"><title>PHP Info (diag)</title>';
echo '<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.45;padding:20px}pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}h2{margin-top:28px}</style>';
echo '</head><body>';

function row($k, $v){
  echo '<tr><th>' . htmlspecialchars($k, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</th><td><pre>'
     . htmlspecialchars($v === null ? 'null' : (is_string($v) ? $v : var_export($v, true)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
     . '</pre></td></tr>';
}

$docRoot   = $_SERVER['DOCUMENT_ROOT']   ?? null;
$scriptFn  = $_SERVER['SCRIPT_FILENAME'] ?? null;
$script    = $_SERVER['SCRIPT_NAME']     ?? null;
$request   = $_SERVER['REQUEST_URI']     ?? null;
$software  = $_SERVER['SERVER_SOFTWARE'] ?? null;
$protocol  = $_SERVER['SERVER_PROTOCOL'] ?? null;

// Попытка определить поддержку mod_rewrite
$hasApacheFn   = function_exists('apache_get_modules');
$mods          = $hasApacheFn ? @apache_get_modules() : null;
$hasModRewrite = ($mods && is_array($mods)) ? in_array('mod_rewrite', $mods, true) : null;

// Проверка доступности .htaccess
$htaccessPath = __DIR__ . '/.htaccess';
$htaccessExists = is_file($htaccessPath);
$htaccessReadable = $htaccessExists ? is_readable($htaccessPath) : false;

// Расчёт базового пути как в index.php
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base === '/' || $base === '') { $base = ''; }

// Выводим таблицу
echo '<h1>Диагностика окружения</h1>';
echo '<table>';
row('SERVER_SOFTWARE', $software);
row('SERVER_PROTOCOL', $protocol);
row('DOCUMENT_ROOT',  $docRoot);
row('SCRIPT_FILENAME',$scriptFn);
row('SCRIPT_NAME',    $script);
row('REQUEST_URI',    $request);
row('BASE (расчёт)',  $base);
row('PHP_VERSION',    PHP_VERSION);
row('apache_get_modules() доступна', $hasApacheFn ? 'yes' : 'no');
row('mod_rewrite в списке модулей',  ($hasModRewrite === null ? 'n/a' : ($hasModRewrite ? 'yes' : 'no')));
row('.htaccess существует',          $htaccessExists ? 'yes' : 'no');
row('.htaccess читаем',              $htaccessReadable ? 'yes' : 'no');
echo '</table>';

// Краткая сводка по REQUEST headers (может помочь в CORS/SSL диагностике)
echo '<h2>REQUEST HEADERS</h2><pre>';
foreach (getallheaders() ?: [] as $k => $v) {
  echo $k . ': ' . $v . "\n";
}
echo '</pre>';

// Блок общей информации PHP (без чувствительных разделов рекомендуется INFO_GENERAL)
echo '<h2>phpinfo(INFO_GENERAL)</h2>';
ob_start();
phpinfo(INFO_GENERAL);
$pi = ob_get_clean();
// Немного упростим вывод
$pi = preg_replace('~<!DOCTYPE[^>]*>~i', '', $pi);
$pi = preg_replace('~<html[^>]*>|</html>~i', '', $pi);
$pi = preg_replace('~<head[^>]*>.*?</head>~is', '', $pi);
echo '<div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:10px">' . $pi . '</div>';

echo '</body></html>';
