<?php
/**
 * db-api.php — слой доступа к данным (DAO) для DOMLearn
 *
 * Содержит ТОЛЬКО работу с БД (через PDO из config.php), без HTTP-логики.
 * Здесь объявлены функции для чтения публичных данных и административных CRUD-операций.
 * Любые проверки авторизации и формирование HTTP-ответов должны быть вне этого файла.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

// ===== ПУБЛИЧНОЕ ЧТЕНИЕ =====

// Фасадные функции совместимости для публичного рендера (используются в index.php)
// Оставлены для обратной совместимости после удаления crud.php.
/** Получить все уровни в порядке number ASC */
function db_get_levels(): array { return db_levels_all(); }

// ===== ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ ДЛЯ ПУТЕЙ ЗАГРУЗОК =====
/**
 * Получить слаги уровня/раздела/урока по lesson_id.
 * Возвращает массив: ['level_slug'=>..., 'section_slug'=>..., 'lesson_slug'=>...]
 */
function db_slugs_by_lesson_id(int $lesson_id): ?array {
    $sql = 'SELECT lv.slug AS level_slug, sc.slug AS section_slug, ls.slug AS lesson_slug
            FROM lessons ls
            JOIN sections sc ON sc.id = ls.section_id
            JOIN levels lv ON lv.id = sc.level_id
            WHERE ls.id = ? LIMIT 1';
    $st = db()->prepare($sql);
    $st->execute([$lesson_id]);
    $row = $st->fetch();
    return $row ?: null;
}
/** Получить уровень по number+slug */
function db_get_level_by_number_slug(int $number, string $slug): ?array { return db_level_by_number_slug($number, $slug); }
/** Секции по level_id (section_order ASC) */
function db_get_sections_by_level_id(int $level_id): array { return db_sections_by_level($level_id); }
/** Найти раздел по level_id + section_order + slug */
function db_get_section_by_level_order_slug(int $level_id, int $order, string $slug): ?array { return db_section_by_level_order_slug($level_id, $order, $slug); }
/** Уроки по section_id (lesson_order ASC) */
function db_get_lessons_by_section_id(int $section_id): array { return db_lessons_by_section($section_id); }
/** Найти урок по section_id + lesson_order + slug */
function db_get_lesson_by_section_order_slug(int $section_id, int $order, string $slug): ?array { return db_lesson_by_section_order_slug($section_id, $order, $slug); }
/** Предыдущий и следующий урок в разделе по lesson_order */
function db_get_prev_next_lesson(int $section_id, int $order): array { return db_prev_next_lesson($section_id, $order); }

/** Получить все уровни в порядке number ASC */
function db_levels_all(): array {
    $stmt = db()->query('SELECT id, number, title_ru, slug FROM levels ORDER BY number ASC');
    return $stmt->fetchAll();
}

/** Получить уровень по number+slug */
function db_level_by_number_slug(int $number, string $slug): ?array {
    $st = db()->prepare('SELECT * FROM levels WHERE number=? AND slug=? LIMIT 1');
    $st->execute([$number, $slug]);
    $row = $st->fetch();
    return $row ?: null;
}

/** Секции по level_id (section_order ASC) */
function db_sections_by_level(int $level_id): array {
    $st = db()->prepare('SELECT * FROM sections WHERE level_id=? ORDER BY section_order ASC');
    $st->execute([$level_id]);
    return $st->fetchAll();
}

/** Найти раздел по level_id + section_order + slug */
function db_section_by_level_order_slug(int $level_id, int $order, string $slug): ?array {
    $st = db()->prepare('SELECT * FROM sections WHERE level_id=? AND section_order=? AND slug=? LIMIT 1');
    $st->execute([$level_id, $order, $slug]);
    $row = $st->fetch();
    return $row ?: null;
}

/** Уроки по section_id (lesson_order ASC) */
function db_lessons_by_section(int $section_id): array {
    $st = db()->prepare('SELECT * FROM lessons WHERE section_id=? ORDER BY lesson_order ASC');
    $st->execute([$section_id]);
    return $st->fetchAll();
}

/** Найти урок по section_id + lesson_order + slug */
function db_lesson_by_section_order_slug(int $section_id, int $order, string $slug): ?array {
    $st = db()->prepare('SELECT * FROM lessons WHERE section_id=? AND lesson_order=? AND slug=? LIMIT 1');
    $st->execute([$section_id, $order, $slug]);
    $row = $st->fetch();
    return $row ?: null;
}

/** Предыдущий и следующий урок (только опубликованные) */
function db_prev_next_lesson(int $section_id, int $order): array {
    $prevSt = db()->prepare('SELECT id, slug, lesson_order FROM lessons WHERE section_id=? AND lesson_order<? AND is_published=1 ORDER BY lesson_order DESC LIMIT 1');
    $prevSt->execute([$section_id, $order]);
    $prev = $prevSt->fetch();

    $nextSt = db()->prepare('SELECT id, slug, lesson_order FROM lessons WHERE section_id=? AND lesson_order>? AND is_published=1 ORDER BY lesson_order ASC LIMIT 1');
    $nextSt->execute([$section_id, $order]);
    $next = $nextSt->fetch();

    return ['prev' => $prev ?: null, 'next' => $next ?: null];
}

// ===== АДМИНИСТРАТИВНЫЕ ОПЕРАЦИИ (CRUD) =====

/** Проверка slug "a-z-" */
function db_validate_slug(string $slug): bool { return (bool)preg_match('~^[a-z-]+$~', $slug); }

/**
 * Сохранить раздел (insert/update).
 * Вход: id (0/отсутствует для insert), level_id, title_ru, slug, section_order (опц.).
 * Возврат: ['id' => int]
 * Исключения: RuntimeException при ошибках валидации/уникальности
 */
function db_section_save(array $data): array {
    $id = (int)($data['id'] ?? 0);
    $level_id = (int)($data['level_id'] ?? 0);
    $title_ru = trim((string)($data['title_ru'] ?? ''));
    $slug = trim((string)($data['slug'] ?? ''));
    $order = isset($data['section_order']) ? (int)$data['section_order'] : 0;

    if ($level_id <= 0 || $title_ru === '') throw new RuntimeException('level_id и title_ru обязательны');
    if (!db_validate_slug($slug)) throw new RuntimeException('Неверный slug');

    if ($id) {
        // уникальность slug в пределах уровня, исключая текущий id
        $q = db()->prepare('SELECT id FROM sections WHERE level_id=? AND slug=? AND id<>?');
        $q->execute([$level_id, $slug, $id]);
        if ($q->fetch()) throw new RuntimeException('Такой slug уже есть в уровне');
        $st = db()->prepare('UPDATE sections SET level_id=?, title_ru=?, slug=?, section_order=? WHERE id=?');
        if ($order <= 0) {
            // если порядок не задан — оставляем прежний
            $old = db()->prepare('SELECT section_order FROM sections WHERE id=?');
            $old->execute([$id]);
            $order = (int)($old->fetch()['section_order'] ?? 0);
        }
        $st->execute([$level_id, $title_ru, $slug, $order, $id]);
        return ['id' => $id];
    } else {
        // определить следующий порядковый номер
        if ($order <= 0) {
            $mx = db()->prepare('SELECT COALESCE(MAX(section_order),0) m FROM sections WHERE level_id=?');
            $mx->execute([$level_id]);
            $order = ((int)$mx->fetch()['m']) + 1;
        } else {
            // проверка, что номер свободен
            $qo = db()->prepare('SELECT id FROM sections WHERE level_id=? AND section_order=?');
            $qo->execute([$level_id, $order]);
            if ($qo->fetch()) throw new RuntimeException('Такой порядковый номер уже занят');
        }
        // уникальность slug
        $q = db()->prepare('SELECT id FROM sections WHERE level_id=? AND slug=?');
        $q->execute([$level_id, $slug]);
        if ($q->fetch()) throw new RuntimeException('Такой slug уже есть в уровне');
        $st = db()->prepare('INSERT INTO sections(level_id,title_ru,slug,section_order) VALUES (?,?,?,?)');
        $st->execute([$level_id, $title_ru, $slug, $order]);
        return ['id' => (int)db()->lastInsertId()];
    }
}

/** Удалить раздел (каскад оставляем на БД) и очистить папки уроков раздела */
function db_section_delete(int $id): void {
    if ($id <= 0) throw new RuntimeException('id required');
    // удалить папки изображений всех уроков раздела на уровне файловой системы — это не DB, но уместно здесь как часть доменной операции
    $ls = db()->prepare('SELECT id FROM lessons WHERE section_id=?');
    $ls->execute([$id]);
    foreach ($ls->fetchAll() as $row) {
        // Удаляем легаси папку
        $legacy = __DIR__ . '/images/lesson_' . (int)$row['id'];
        if (is_dir($legacy)) { db_rrmdir($legacy); }
        // Удаляем новый путь uploads/level/section/lesson
        $sl = db_slugs_by_lesson_id((int)$row['id']);
        if ($sl) {
            $mc = media_config();
            $uploads = rtrim($mc['uploads_dir'] ?? (__DIR__ . '/uploads'), '/\\');
            $up = $uploads . '/' . $sl['level_slug'] . '/' . $sl['section_slug'] . '/' . $sl['lesson_slug'];
            if (is_dir($up)) { db_rrmdir($up); }
        }
    }
    $st = db()->prepare('DELETE FROM sections WHERE id=?');
    $st->execute([$id]);
}

/** Сохранить урок (insert/update) */
function db_lesson_save(array $data): array {
    $id = (int)($data['id'] ?? 0);
    $section_id = (int)($data['section_id'] ?? 0);
    $title_ru = trim((string)($data['title_ru'] ?? ''));
    $slug = trim((string)($data['slug'] ?? ''));
    $is_published = !empty($data['is_published']) ? 1 : 0;
    $content = $data['content'] ?? ['tests'=>[],'tasks'=>[],'theory_html'=>''];

    if ($section_id <= 0 || $title_ru === '') throw new RuntimeException('section_id и title_ru обязательны');
    if (!db_validate_slug($slug)) throw new RuntimeException('Неверный slug');

    // нормализация контента
    $norm = [
        'tests' => (array)($content['tests'] ?? []),
        'tasks' => (array)($content['tasks'] ?? []),
        'theory_html' => (string)($content['theory_html'] ?? ''),
    ];
    $json = json_encode($norm, JSON_UNESCAPED_UNICODE);

    if ($id) {
        $q = db()->prepare('SELECT id FROM lessons WHERE section_id=? AND slug=? AND id<>?');
        $q->execute([$section_id, $slug, $id]);
        if ($q->fetch()) throw new RuntimeException('Такой slug уже есть в разделе');
        $st = db()->prepare('UPDATE lessons SET section_id=?, title_ru=?, slug=?, content=?, is_published=? WHERE id=?');
        $st->execute([$section_id, $title_ru, $slug, $json, $is_published, $id]);
        return ['id' => $id];
    } else {
        $mx = db()->prepare('SELECT COALESCE(MAX(lesson_order),0) m FROM lessons WHERE section_id=?');
        $mx->execute([$section_id]);
        $order = ((int)$mx->fetch()['m']) + 1;
        $q = db()->prepare('SELECT id FROM lessons WHERE section_id=? AND slug=?');
        $q->execute([$section_id, $slug]);
        if ($q->fetch()) throw new RuntimeException('Такой slug уже есть в разделе');
        $st = db()->prepare('INSERT INTO lessons(section_id,title_ru,slug,lesson_order,content,is_published) VALUES (?,?,?,?,?,?)');
        $st->execute([$section_id, $title_ru, $slug, $order, $json, $is_published]);
        return ['id' => (int)db()->lastInsertId()];
    }
}

/** Удалить урок и его папку изображений */
function db_lesson_delete(int $id): void {
    if ($id <= 0) throw new RuntimeException('id required');
    // Старый путь к изображениям (legacy)
    $legacy = __DIR__ . '/images/lesson_' . $id;
    if (is_dir($legacy)) db_rrmdir($legacy);
    // Новый путь для загрузок (uploads)
    $sl = db_slugs_by_lesson_id($id);
    if ($sl) {
        $mc = media_config();
        $uploads = rtrim($mc['uploads_dir'] ?? (__DIR__ . '/uploads'), '/\\');
        $up = $uploads . '/' . $sl['level_slug'] . '/' . $sl['section_slug'] . '/' . $sl['lesson_slug'];
        if (is_dir($up)) db_rrmdir($up);
    }
    $st = db()->prepare('DELETE FROM lessons WHERE id=?');
    $st->execute([$id]);
}

/** Дерево уровней/разделов/уроков для админки */
function db_admin_tree(): array {
    $levels = db_levels_all();
    foreach ($levels as &$lv) {
        $secs = db_sections_by_level((int)$lv['id']);
        foreach ($secs as &$sec) {
            $lsStmt = db()->prepare('SELECT id, section_id, title_ru, slug, lesson_order, is_published, content FROM lessons WHERE section_id=? ORDER BY lesson_order ASC');
            $lsStmt->execute([(int)$sec['id']]);
            $sec['lessons'] = $lsStmt->fetchAll();
            foreach ($sec['lessons'] as &$ls) { $ls['content'] = json_decode($ls['content'], true); }
        }
        $lv['sections'] = $secs;
    }
    return ['levels' => $levels];
}

// ===== ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ (локальные) =====
/** Рекурсивное удаление директории */
function db_rrmdir(string $dir): void {
    if (!is_dir($dir)) return;
    $items = scandir($dir);
    foreach ($items as $it) {
        if ($it === '.' || $it === '..') continue;
        $path = $dir . DIRECTORY_SEPARATOR . $it;
        if (is_dir($path)) db_rrmdir($path); else @unlink($path);
    }
    @rmdir($dir);
}
