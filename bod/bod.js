// Бандл админки (вынесено из crud.php: admin_js_bundle)
// Русские комментарии сохранены. Этот файл загружается статически как часть админки
// Ожидает, что index.php проставит data-admin-base на #adminApp (фолбэк: window.ADMIN_BASE)
(function(){
  'use strict';

  // Базовый путь, прокинутый с сервера через index.php
  var BASE = (function(){
    try{
      var el = (typeof document!=='undefined') ? document.getElementById('adminApp') : null;
      if (el && el.dataset && typeof el.dataset.adminBase === 'string') return el.dataset.adminBase;
    }catch(e){}
    if (typeof window !== 'undefined' && typeof window.ADMIN_BASE === 'string') return window.ADMIN_BASE;
    return '';
  })();
  function u(p){ return (BASE ? BASE : '') + p; }

  var LS_REMEMBER = 'domlearn-remember';

  function h(tag, attrs){
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'text') {
          el.textContent = attrs[k];
        } else {
          el.setAttribute(k, attrs[k]);
        }
      }
    }
    return el;
  }

  function mountLogin(){
    var root = document.getElementById('adminApp');
    root.innerHTML = '';

    var wrap = h('div', {class: 'admin-login'});
    var title = h('h2', {text: 'Вход в админ-панель'});
    var f = h('form');
    var login = h('input'); 
    login.type='text'; 
    login.placeholder='Логин';
    var pass = h('input');
    pass.type = 'password';
    pass.placeholder = 'Пароль';
    var rememberLbl = h('label');
    var remember = h('input');
    remember.type = 'checkbox';
    rememberLbl.appendChild(remember);
    rememberLbl.appendChild(document.createTextNode(' Запомнить меня'));
    var btn = h('button', {text: 'Войти'});
    btn.type = 'submit';
    var msg = h('div', {class: 'admin-msg'});

    // Если есть сессионная авторизация — сразу в панель
    fetch(u('/api.php?action=session_ok'), { credentials: 'same-origin' })
      .then(function(r){ return r.json(); })
      .then(function(json){ if (json && json.ok) { mountPanel(); } })
      .catch(function(){ /* игнор: покажем форму логина */ });

    f.addEventListener('submit', function(ev){
      ev.preventDefault();
      var l = login.value.trim();
      var p = pass.value;
      fetch(u('/api.php?action=ping_login'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({l:l,p:p}), credentials: 'same-origin'})
        .then(function(r){ if(!r.ok) throw new Error('Неверный логин или пароль'); return r.json(); })
        .then(function(){
          try {
            if (remember.checked) {
              localStorage.setItem(LS_REMEMBER,'1');
            }
          } catch(e) {}
          mountPanel();
        })
        .catch(function(e){ msg.textContent = (e && e.message) ? e.message : 'Ошибка авторизации'; });
    });

    wrap.appendChild(title);
    f.appendChild(login); f.appendChild(pass); f.appendChild(rememberLbl); f.appendChild(btn);
    wrap.appendChild(f);
    wrap.appendChild(msg);
    root.appendChild(wrap);
  }

  function api(url, opt){
    // Поддержка базового префикса: если путь абсолютный и начинается с '/', префиксуем BASE
    if (typeof url === 'string' && url.charAt(0) === '/') url = u(url);
    opt = opt || {};
    if (!('credentials' in opt)) opt.credentials = 'same-origin';
    return fetch(url, opt).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  }

  function el(tag, cls, txt){
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (txt) x.textContent = txt;
    return x;
  }

  function mountPanel(openSectionId){
    var root = document.getElementById('adminApp');
    root.innerHTML = '';
    var bar = h('div', {class:'admin-bar'});
    // Кнопки управления (справа): Перейти на сайт и Выйти
    var visit = h('a', {text:'Перейти на сайт'});
    visit.href = u('/');
    visit.className = 'btn';
    var logout = h('button', {text:'Выйти'});
    logout.className = 'btn';
    var actions = el('div','actions');
    actions.appendChild(visit);
    actions.appendChild(logout);
    logout.addEventListener('click', function(){
      try{ localStorage.removeItem(LS_REMEMBER); }catch(e){}
      fetch(u('/api.php?action=logout'), {method:'POST'}).finally(mountLogin);
    });
    // Размещаем контейнер с кнопками справа через spacer + actions (grid: 1fr auto)
    var spacer = el('div','spacer');
    bar.appendChild(spacer);
    bar.appendChild(actions);

    var shell = el('div','admin-shell');
    var left = el('div','admin-left');
    var right = el('div','admin-right');
    shell.appendChild(left);
    shell.appendChild(right);

    root.appendChild(bar);
    root.appendChild(shell);

    // Загрузка дерева
    api(u('/api.php?action=tree'))
      .then(function(data){
        renderTree(left, right, data, openSectionId);
      })
      .catch(function(err){
        left.textContent = 'Ошибка загрузки: '+err.message; 
      });
  }

  function renderTree(left, right, data, openSectionId){
    left.innerHTML = '';
    right.innerHTML = '';
    var levels = data.levels || [];

    var levelTabs = el('div','level-tabs');
    levels.forEach(function(lv, idx){
      var b = el('button','tab', lv.title_ru);
      b.addEventListener('click', function(){ selectLevel(idx); });
      levelTabs.appendChild(b);
    });
    left.appendChild(levelTabs);

    var sectionsWrap = el('div','sections-wrap');
    left.appendChild(sectionsWrap);

    var lessonsWrap = el('div','lessons-wrap');
    right.appendChild(lessonsWrap);

    var currentLevelIndex = 0;
    var currentSectionId = null;

    function selectLevel(i) {
      currentLevelIndex = i; 
      renderSections(); 
      lessonsWrap.innerHTML=''; 
    }
    
    function renderSections(){
      sectionsWrap.innerHTML = '';
      var lv = levels[currentLevelIndex];
      var head = el('div','head');
      head.textContent = 'Разделы — '+lv.title_ru;
      sectionsWrap.appendChild(head);
      var addBtn = el('button','btn', '➕ Добавить раздел');
      addBtn.addEventListener('click', function(){
        var title = prompt('Название раздела (рус)'); if(!title) return;
        var slug = prompt('Slug (только a-z и -)'); if(!slug) return;
        api(u('/api.php?action=section_save'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ level_id: lv.id, title_ru: title, slug: slug })})
          .then(function(){ return api(u('/api.php?action=tree')); })
          .then(function(d){
            data = d;
            levels = d.levels || [];
            renderSections();
            lessonsWrap.innerHTML = '';
          })
          .catch(function(e){ alert('Ошибка: '+e.message); });
      });
      sectionsWrap.appendChild(addBtn);

      var ul = el('ul','list');
      ul.setAttribute('data-level', lv.id);
      (lv.sections||[]).forEach(function(sec){
        var li = el('li','item');
        li.dataset.id = sec.id;
        var a = el('a',null, sec.section_order+'. '+sec.title_ru);
        a.href = '#';
        a.addEventListener('click', function(ev){
          ev.preventDefault();
          currentSectionId = sec.id;
          renderLessons(sec);
        });
        var edit = el('button','sm','✎');
        edit.title = 'Редактировать';
        edit.addEventListener('click', function(){
          var title = prompt('Название раздела', sec.title_ru); if(!title) return;
          var slug = prompt('Slug', sec.slug); if(!slug) return;
          api(u('/api.php?action=section_save'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: sec.id, level_id: lv.id, title_ru: title, slug: slug, section_order: sec.section_order })})
            .then(function(){ return api(u('/api.php?action=tree')); })
            .then(function(d){
              data = d;
              levels = d.levels || [];
              renderSections();
              if (currentSectionId === sec.id) {
                var s = findSection(sec.id);
                if (s) renderLessons(s);
              }
            })
            .catch(function(e){ alert('Ошибка: '+e.message); });
        });
        var del = el('button','sm','🗑');
        del.title = 'Удалить';
        del.addEventListener('click', function(){
          if(!confirm('Удалить раздел и все его уроки?')) return;
          api(u('/api.php?action=section_delete'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: sec.id })})
            .then(function(){ return api(u('/api.php?action=tree')); })
            .then(function(d){
              data = d;
              levels = d.levels || [];
              currentSectionId = null;
              renderSections();
              lessonsWrap.innerHTML = '';
            })
            .catch(function(e){ alert('Ошибка: '+e.message); });
        });
        li.appendChild(a);
        li.appendChild(edit);
        li.appendChild(del);
        ul.appendChild(li);
      });

      sectionsWrap.appendChild(ul);
    }

    // Поиск раздела по id в текущем выбранном уровне
    function findSection(id){
      var lv = levels[currentLevelIndex] || {}; var ss = (lv.sections||[]);
      for (var i=0;i<ss.length;i++){ if (ss[i].id === id) return ss[i]; }
      return null;
    }

    // Рендер списка уроков выбранного раздела
    function renderLessons(sec){
      lessonsWrap.innerHTML = '';
      var head = el('div','head');
      head.textContent = 'Уроки — '+sec.title_ru;
      lessonsWrap.appendChild(head);

      var addBtn = el('button','btn','➕ Добавить урок');
      addBtn.addEventListener('click', function(){
        // Открываем редактор нового урока (с пустым контентом)
        if (window.AdminEditor && typeof window.AdminEditor.openLessonEditor==='function') {
          window.AdminEditor.openLessonEditor(
            { id:null, section_id: sec.id, title_ru:'', slug:'', is_published:0, content:{ tests:[], tasks:[], theory_html:'' } },
            true,
            function(sectionId){ mountPanel(sectionId || sec.id); }
          );
        } else {
          alert('Модуль редактора не загружен');
        }
      });
      lessonsWrap.appendChild(addBtn);

      var ul = el('ul','list');
      ul.setAttribute('data-section', sec.id);
      (sec.lessons||[]).forEach(function(ls){
        var li = el('li','item');
        li.dataset.id = ls.id;
        var title = el('a', null, (ls.lesson_order||0)+'. '+ls.title_ru);
        if (ls.is_published){
          var ok = el('span', null, '✓');
          ok.style.color = '#16a34a';
          ok.style.marginLeft = '4px';
          title.appendChild(ok);
        }
        title.href = '#';
        title.addEventListener('click', function(ev){
          ev.preventDefault();
          if (window.AdminEditor && typeof window.AdminEditor.openLessonEditor==='function') {
            window.AdminEditor.openLessonEditor(ls, false, function(sectionId){ mountPanel(sectionId || ls.section_id); });
          } else { alert('Модуль редактора не загружен'); }
        });
        var edit = el('button','sm','✎'); edit.title='Редактировать';
        edit.addEventListener('click', function(){
          if (window.AdminEditor && typeof window.AdminEditor.openLessonEditor==='function') {
            window.AdminEditor.openLessonEditor(ls, false, function(sectionId){ mountPanel(sectionId || ls.section_id); });
          } else { alert('Модуль редактора не загружен'); }
        });
        var del = el('button','sm','🗑'); del.title='Удалить';
        del.addEventListener('click', function(){
          if(!confirm('Удалить урок?')) return;
          api(u('/api.php?action=lesson_delete'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: ls.id })})
            .then(function(){ return api(u('/api.php?action=tree')); })
            .then(function(d){
              // Обновим локальные данные и перерисуем список для текущего раздела
              data = d; levels = d.levels||[];
              // Найдём раздел с тем же id (он может быть в текущем уровне)
              var s = findSection(sec.id);
              if(!s){ // если уровень мог измениться — попробуем найти по всем уровням
                outer: for (var i=0;i<levels.length;i++){
                  var ss = levels[i].sections||[];
                  for (var j=0;j<ss.length;j++){ if (ss[j].id===sec.id){ currentLevelIndex=i; s=ss[j]; break outer; } }
                }
              }
              if (s) renderLessons(s); else lessonsWrap.innerHTML='';
            })
            .catch(function(e){ alert('Ошибка: '+e.message); });
        });
        li.appendChild(title); li.appendChild(edit); li.appendChild(del); ul.appendChild(li);
      });
      lessonsWrap.appendChild(ul);
    }

    // Если передан sectionId для восстановления контекста — найдём нужный уровень и откроем раздел
    if (openSectionId){
      for (var i=0;i<levels.length;i++){
        var secs = (levels[i].sections||[]);
        for (var j=0;j<secs.length;j++){
          if (secs[j].id === openSectionId){ currentLevelIndex = i; currentSectionId = openSectionId; break; }
        }
        if (currentSectionId) break;
      }
      renderSections();
      // Если есть утилита поиска раздела — используем её, иначе найдём напрямую
      var s = (typeof findSection==='function') ? findSection(openSectionId) : (function(){
        var lv = levels[currentLevelIndex] || {}; var ss = (lv.sections||[]);
        for (var k=0;k<ss.length;k++){ if (ss[k].id === openSectionId) return ss[k]; }
        return null;
      })();
      if (s && typeof renderLessons==='function'){ renderLessons(s); }
      return;
    }
    selectLevel(0);
  }

  function openLessonEditor(ls, isNew){
    var dlg = document.createElement('div'); dlg.className='modal';
    var box = document.createElement('div'); box.className='modal-box'; dlg.appendChild(box);
    var title = document.createElement('h3'); title.textContent = (isNew?'Новый урок':'Редактировать урок'); box.appendChild(title);
    // Кнопка закрытия (крестик)
    var btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.setAttribute('aria-label','Закрыть');
    btnClose.title = 'Закрыть';
    btnClose.textContent = '✕';
    btnClose.className = 'modal-close';
    btnClose.addEventListener('click', function(ev){ ev.stopPropagation(); dlg.remove(); });
    box.appendChild(btnClose);

    var f = document.createElement('form'); f.className='form';
    var inTitle = document.createElement('input'); inTitle.placeholder='Название (рус)'; inTitle.value = ls.title_ru||''; f.appendChild(inTitle);
    var inSlug = document.createElement('input'); inSlug.placeholder='slug (a-z и -)'; inSlug.value = ls.slug||''; f.appendChild(inSlug);
    var inPub = document.createElement('label'); var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!ls.is_published; inPub.appendChild(cb); inPub.appendChild(document.createTextNode(' Опубликован')); f.appendChild(inPub);
    var taTheory = document.createElement('textarea'); taTheory.placeholder='Теория (HTML)'; taTheory.value = (ls.content&&ls.content.theory_html)||''; f.appendChild(taTheory);
    var taTests = document.createElement('textarea'); taTests.placeholder='Тесты (JSON массив объектов)'; taTests.value = JSON.stringify((ls.content&&ls.content.tests)||[], null, 2); f.appendChild(taTests);
    var taTasks = document.createElement('textarea'); taTasks.placeholder='Задачи (JSON массив объектов)'; taTasks.value = JSON.stringify((ls.content&&ls.content.tasks)||[], null, 2); f.appendChild(taTasks);

    // Статусы рядом с кнопками, автоисчезновение 5 сек
    var row = document.createElement('div'); row.className='row';
    var btnSave = document.createElement('button'); btnSave.type='button'; btnSave.textContent='💾 Сохранить черновик';
    var status1 = document.createElement('span'); status1.className='status';
    var btnPub = document.createElement('button'); btnPub.type='button'; btnPub.textContent='📢 Опубликовать';
    var status2 = document.createElement('span'); status2.className='status';
    row.appendChild(btnSave); row.appendChild(status1); row.appendChild(btnPub); row.appendChild(status2);
    // Кнопка "Закрыть" справа от "Опубликовать"
    var btnCloseForm = document.createElement('button'); btnCloseForm.type='button'; btnCloseForm.textContent='Закрыть';
    btnCloseForm.addEventListener('click', function(){ dlg.remove(); });
    row.appendChild(btnCloseForm);
    f.appendChild(row);

    box.appendChild(f);
    document.body.appendChild(dlg);

    function flash(stEl, text){ stEl.textContent = '✓ '+text; setTimeout(function(){ stEl.textContent=''; }, 5000); }

    // CKEditor 5 (загрузка из CDN, защита от параллельной загрузки)
    var ckeEditor = null;
    function loadScript(src, cb){ var s=document.createElement('script'); s.src=src; s.onload=cb; s.onerror=function(){ cb(new Error('Fail '+src)); }; document.head.appendChild(s); }
    function getClassicCtor(){ return (window.ClassicEditor) || (window.CKEDITOR && window.CKEDITOR.ClassicEditor) || null; }
    // Состояние загрузки CKE: 0 — не загружен, 1 — загружается, 2 — готов
    var __ckeState = 0; var __ckeWaiters = [];
    function ensureCKE(cb){
      if (getClassicCtor()) return cb();
      if (__ckeState === 2) return cb();
      if (__ckeState === 1){ __ckeWaiters.push(cb); return; }
      __ckeState = 1; __ckeWaiters.push(cb);
      // Загружаем единственный корректный билд CKEditor 5 (super-build) с CDN
      var cdnUrl = 'https://cdn.ckeditor.com/ckeditor5/41.4.2/super-build/ckeditor.js';
      loadScript(cdnUrl, function(){
        if (!getClassicCtor()) console.warn('CKEditor: ClassicEditor не найден после загрузки CDN build: '+cdnUrl);
        __ckeState = 2;
        var list = __ckeWaiters.slice(); __ckeWaiters.length = 0;
        list.forEach(function(fn){ try{ fn(); }catch(e){} });
      });
    }
    function UploadAdapter(loader){ this.loader = loader; }
    UploadAdapter.prototype.upload = function(){
      var that = this;
      return this.loader.file.then(function(file){
        return new Promise(function(resolve, reject){
          var form = new FormData();
          form.append('file', file);
          form.append('lesson_id', ls.id ? String(ls.id) : '0');
          fetch(u('/api.php?action=upload_image'), { method:'POST', body: form, credentials: 'same-origin' })
            .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(function(json){ if(json && json.url){ resolve({ default: json.url }); } else { reject('Некорректный ответ сервера'); } })
            .catch(function(e){ reject(e); });
        });
      });
    };
    UploadAdapter.prototype.abort = function(){};

    ensureCKE(function(){
      var Ctor = getClassicCtor();
      if (!Ctor) return;
      Ctor.create(taTheory, {
        toolbar: {
          items: [
            'heading',
            '|',
            'bold', 'italic', 'link', 'fontColor',
            '|',
            // В super-build используется один пункт 'alignment' (выпадающий список)
            'alignment',
            '|',
            'imageUpload', 'blockQuote',
            '|',
            'undo', 'redo'
          ]
        },
        removePlugins: [
          'MediaEmbed','List','Indent','IndentBlock',
          'RealTimeCollaborativeComments','RealTimeCollaborativeTrackChanges','RealTimeCollaborativeRevisionHistory',
          'PresenceList','Comments','TrackChanges','TrackChangesData','RevisionHistory',
          'CloudServices','CKBox','CKBoxUtils','CKBoxImageEdit','CKBoxImageEditUI','CKBoxImageEditEditing','CKFinder','EasyImage',
          'ExportPdf','ExportWord','WProofreader','MathType',
          'SlashCommand','Template','DocumentOutline','FormatPainter','TableOfContents','Style','Pagination',
          'AIAssistant',
          'MultiLevelList','MultiLevelListUI','MultiLevelListEditing',
          'PasteFromOfficeEnhanced','PasteFromOfficeEnhancedUI','PasteFromOfficeEnhancedEditing','PasteFromOfficeEnhancedPropagator',
          'CaseChange','CaseChangeUI','CaseChangeEditing'
        ],
        licenseKey: 'GPL'
      })
        .then(function(ed){
          ckeEditor = ed;
          // Кастомный адаптер загрузки
          ed.plugins.get('FileRepository').createUploadAdapter = function(loader){ return new UploadAdapter(loader); };
        })
        .catch(function(e){ console.warn('CKE init error', e); });
    });

    // --- Конструктор тестов и задач (гибрид) ---
    var testsBuilderWrap = document.createElement('div'); testsBuilderWrap.className = 'builder tests-builder';
    var tasksBuilderWrap = document.createElement('div'); tasksBuilderWrap.className = 'builder tasks-builder';

    // Стили перенесены в style.css

    // Хранилища инстансов редакторов для динамических элементов
    var testsEditors = []; // [{qid, editor}]
    var tasksEditors = []; // [{tid, editor}]

    function destroyEditors(arr){
      (arr||[]).forEach(function(rec){ if(rec && rec.editor){ try{ rec.editor.destroy(); }catch(e){} } });
      arr.length = 0;
    }

    function uid(){ return Math.random().toString(36).slice(2,9); }

    // --- Конструктор тестов ---
    function buildTestsUI(){
      testsBuilderWrap.innerHTML = '';
      var h = document.createElement('h4'); h.textContent = 'Тестовые вопросы'; testsBuilderWrap.appendChild(h);
      var list = document.createElement('div'); testsBuilderWrap.appendChild(list);
      var addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Добавить вопрос'; testsBuilderWrap.appendChild(addBtn);

      function addQuestion(q){
        var qid = uid();
        var item = document.createElement('div'); item.className='item'; item.dataset.qid = qid;
        // Заголовок вопроса (rich)
        var qLabel = document.createElement('div'); qLabel.textContent = 'Текст вопроса:'; item.appendChild(qLabel);
        var qArea = document.createElement('div'); qArea.setAttribute('contenteditable','true'); qArea.style.minHeight='80px'; qArea.style.border='1px solid #ccc'; qArea.style.padding='6px'; item.appendChild(qArea);
        // Ответы
        var answersWrap = document.createElement('div'); answersWrap.className='answers-list'; item.appendChild(answersWrap);
        var ansLabel = document.createElement('div'); ansLabel.textContent='Ответы (выберите правильный):'; item.insertBefore(ansLabel, answersWrap);

        // Добавление строки ответа (всегда формируем 4 строки, без удаления)
        function addAnswerRow(val, idx, correctIdx){
          var row = document.createElement('div'); row.className='answer-row';
          var rb = document.createElement('input'); rb.type='radio'; rb.name='correct-'+qid; rb.value=String(idx);
          if (typeof correctIdx==='number' && correctIdx===idx) rb.checked = true;
          var inp = document.createElement('input'); inp.type='text'; inp.placeholder='Ответ'; inp.value = val||'';
          row.appendChild(rb); row.appendChild(inp); answersWrap.appendChild(row);
        }

        // Кнопки добавления/удаления ответов убраны — всегда 4 варианта

        // Кнопки управления вопросом
        var tools = document.createElement('div'); tools.className='row';
        var delQ = document.createElement('button'); delQ.type='button'; delQ.className='btn-small'; delQ.textContent='Удалить вопрос';
        delQ.addEventListener('click', function(){
          // удалить редактор
          var recIdx = testsEditors.findIndex(function(r){ return r.qid===qid; });
          if(recIdx>=0){ try{ testsEditors[recIdx].editor.destroy(); }catch(e){} testsEditors.splice(recIdx,1); }
          item.remove();
        });
        tools.appendChild(delQ); item.appendChild(tools);

        list.appendChild(item);

        // Инициализируем редактор для вопроса (с учётом асинх. загрузки CKE)
        var Ctor = getClassicCtor();
        function initQ(){
          var C = getClassicCtor();
          if(!C){ console.warn('CKE not ready for tests'); return; }
          C.create(qArea, {
            toolbar: {
              items: [
                'heading',
                '|',
                'bold', 'italic', 'link', 'fontColor',
                '|',
                // Используем единый пункт 'alignment'
                'alignment',
                '|',
                'imageUpload', 'blockQuote',
                '|',
                'undo', 'redo'
              ]
            },
            removePlugins: [
              'MediaEmbed','List','Indent','IndentBlock',
              'RealTimeCollaborativeComments','RealTimeCollaborativeTrackChanges','RealTimeCollaborativeRevisionHistory',
              'PresenceList','Comments','TrackChanges','TrackChangesData','RevisionHistory',
              'CloudServices','CKBox','CKBoxUtils','CKBoxImageEdit','CKBoxImageEditUI','CKBoxImageEditEditing','CKFinder','EasyImage',
              'ExportPdf','ExportWord','WProofreader','MathType',
              'SlashCommand','Template','DocumentOutline','FormatPainter','TableOfContents','Style','Pagination',
              'AIAssistant',
              'MultiLevelList','MultiLevelListUI','MultiLevelListEditing',
              'PasteFromOfficeEnhanced','PasteFromOfficeEnhancedUI','PasteFromOfficeEnhancedEditing','PasteFromOfficeEnhancedPropagator',
              'CaseChange','CaseChangeUI','CaseChangeEditing'
            ],
            licenseKey: 'GPL'
          })
            .then(function(ed){
              testsEditors.push({qid: qid, editor: ed});
              ed.plugins.get('FileRepository').createUploadAdapter = function(loader){ return new UploadAdapter(loader); };
              if (q && q.question_html){ ed.setData(q.question_html); }
              else if (q && q.question){ ed.setData(q.question); }
            })
            .catch(function(e){ console.warn('CKE tests init error', e); });
        }
        if (Ctor) initQ(); else ensureCKE(initQ);

        // Предзаполним ответы: всегда 4 варианта. Если меньше — дополним пустыми, если больше — обрежем до 4
        var answers = (q && Array.isArray(q.answers)) ? q.answers.slice(0,4) : [];
        while (answers.length < 4) answers.push('');
        var corr = (q && typeof q.correctIndex==='number') ? q.correctIndex : -1;
        answers.forEach(function(a,i){ addAnswerRow(a, i, corr); });
      }

      addBtn.addEventListener('click', function(){ addQuestion({answers:['',''], correctIndex:-1}); });

      // Заполняем из текущего JSON
      var currentTests = [];
      try { currentTests = JSON.parse(taTests.value||'[]'); } catch(e){ currentTests = []; }
      (currentTests||[]).forEach(addQuestion);

      return { list: list };
    }

    function testsToJSON(){
      var arr = [];
      testsBuilderWrap.querySelectorAll('.item').forEach(function(item){
        var qid = item.dataset.qid;
        var rec = testsEditors.find(function(r){ return r.qid===qid; });
        var html = rec && rec.editor ? rec.editor.getData() : '';
        var answers = [];
        var correctIndex = -1;
        var rows = item.querySelectorAll('.answers-list .answer-row');
        rows.forEach(function(row, idx){
          var inp = row.querySelector('input[type="text"]');
          var rb = row.querySelector('input[type="radio"]');
          answers.push((inp&&inp.value)||'');
          if (rb && rb.checked) correctIndex = idx;
        });
        arr.push({ question_html: html, answers: answers, correctIndex: correctIndex });
      });
      return arr;
    }

    // Валидация конструкторов перед сохранением
    // Требования: для каждого тестового вопроса всегда 4 варианта ответа и ровно один правильный
    function validateBuilders(){
      // Проверяем тесты только если конструктор отображается
      if (testsBuilderWrap.parentNode){
        var questions = testsBuilderWrap.querySelectorAll('.item');
        for (var i=0;i<questions.length;i++){
          var item = questions[i];
          var rows = item.querySelectorAll('.answers-list .answer-row');
          if (rows.length !== 4){
            return 'В каждом вопросе должно быть ровно 4 варианта ответа.';
          }
          var checked = 0;
          rows.forEach(function(row){ var rb=row.querySelector('input[type="radio"]'); if(rb && rb.checked) checked++; });
          if (checked !== 1){
            return 'В каждом вопросе должен быть выбран ровно один правильный ответ.';
          }
        }
      }
      return '';
    }

    // --- Конструктор задач ---
    function buildTasksUI(){
      tasksBuilderWrap.innerHTML = '';
      var h = document.createElement('h4'); h.textContent = 'Задачи'; tasksBuilderWrap.appendChild(h);
      var list = document.createElement('div'); tasksBuilderWrap.appendChild(list);
      var addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Добавить задачу'; tasksBuilderWrap.appendChild(addBtn);

      function addTask(t){
        var tid = uid();
        var item = document.createElement('div'); item.className='item'; item.dataset.tid = tid;
        var titleIn = document.createElement('input'); titleIn.type='text'; titleIn.placeholder='Заголовок'; titleIn.value = (t&&t.title)||'';
        var titleLabel = document.createElement('label'); titleLabel.textContent='Заголовок задачи: ';
        titleLabel.appendChild(titleIn); item.appendChild(titleLabel);
        var bodyLabel = document.createElement('div'); bodyLabel.textContent='Текст задачи:'; item.appendChild(bodyLabel);
        var body = document.createElement('div'); body.setAttribute('contenteditable','true'); body.style.minHeight='100px'; body.style.border='1px solid #ccc'; body.style.padding='6px'; item.appendChild(body);

        var tools = document.createElement('div'); tools.className='row';
        var delT = document.createElement('button'); delT.type='button'; delT.className='btn-small'; delT.textContent='Удалить задачу';
        delT.addEventListener('click', function(){
          var recIdx = tasksEditors.findIndex(function(r){ return r.tid===tid; });
          if(recIdx>=0){ try{ tasksEditors[recIdx].editor.destroy(); }catch(e){} tasksEditors.splice(recIdx,1); }
          item.remove();
        });
        tools.appendChild(delT); item.appendChild(tools);

        list.appendChild(item);

        var Ctor = getClassicCtor();
        function initT(){
          var C = getClassicCtor();
          if(!C){ console.warn('CKE not ready for tasks'); return; }
          C.create(body, {
            toolbar: {
              items: [
                'heading',
                '|',
                'bold', 'italic', 'link', 'fontColor',
                '|',
                // Используем единый пункт 'alignment'
                'alignment',
                '|',
                'imageUpload', 'blockQuote',
                '|',
                'undo', 'redo'
              ]
            },
            removePlugins: [
              'MediaEmbed','List','Indent','IndentBlock',
              'RealTimeCollaborativeComments','RealTimeCollaborativeTrackChanges','RealTimeCollaborativeRevisionHistory',
              'PresenceList','Comments','TrackChanges','TrackChangesData','RevisionHistory',
              'CloudServices','CKBox','CKBoxUtils','CKBoxImageEdit','CKBoxImageEditUI','CKBoxImageEditEditing','CKFinder','EasyImage',
              'ExportPdf','ExportWord','WProofreader','MathType',
              'SlashCommand','Template','DocumentOutline','FormatPainter','TableOfContents','Style','Pagination',
              'AIAssistant',
              'MultiLevelList','MultiLevelListUI','MultiLevelListEditing',
              'PasteFromOfficeEnhanced','PasteFromOfficeEnhancedUI','PasteFromOfficeEnhancedEditing','PasteFromOfficeEnhancedPropagator',
              'CaseChange','CaseChangeUI','CaseChangeEditing'
            ],
            licenseKey: 'GPL'
          })
            .then(function(ed){
              tasksEditors.push({tid: tid, editor: ed, titleIn: titleIn});
              ed.plugins.get('FileRepository').createUploadAdapter = function(loader){ return new UploadAdapter(loader); };
              if (t && t.text_html){ ed.setData(t.text_html); }
            })
            .catch(function(e){ console.warn('CKE tasks init error', e); });
        }
        if (Ctor) initT(); else ensureCKE(initT);
      }

      addBtn.addEventListener('click', function(){ addTask({title:'', text_html:''}); });

      var currentTasks = [];
      try { currentTasks = JSON.parse(taTasks.value||'[]'); } catch(e){ currentTasks = []; }
      (currentTasks||[]).forEach(addTask);

      return { list: list };
    }

    function tasksToJSON(){
      return Array.from(tasksBuilderWrap.querySelectorAll('.item')).map(function(item){
        var tid = item.dataset.tid;
        var rec = tasksEditors.find(function(r){ return r.tid===tid; });
        return { title: rec && rec.titleIn ? rec.titleIn.value : '', text_html: rec && rec.editor ? rec.editor.getData() : '' };
      });
    }

    // Включаем конструкторы по умолчанию
    taTests.style.display='none';
    if (!testsBuilderWrap.parentNode) f.insertBefore(testsBuilderWrap, row);
    destroyEditors(testsEditors);
    buildTestsUI();

    taTasks.style.display='none';
    if (!tasksBuilderWrap.parentNode) f.insertBefore(tasksBuilderWrap, row);
    destroyEditors(tasksEditors);
    buildTasksUI();

    function syncBuildersToTextareas(){
      if (testsBuilderWrap.parentNode){ taTests.value = JSON.stringify(testsToJSON(), null, 2); }
      if (tasksBuilderWrap.parentNode){ taTasks.value = JSON.stringify(tasksToJSON(), null, 2); }
    }

    function send(isPublished){
      // Перед отправкой валидируем и синхронизируем данные из конструкторов
      var err = validateBuilders();
      if (err){ alert(err); return Promise.reject(new Error(err)); }
      // Клиентская проверка slug, чтобы показать подсказку вместо HTTP 400
      var slugVal = inSlug.value.trim();
      if (!/^[a-z-]+$/.test(slugVal)){
        try{ inSlug.setCustomValidity('Неверный slug'); inSlug.reportValidity(); }finally{ setTimeout(function(){ try{ inSlug.setCustomValidity(''); }catch(e){} }, 2000); }
        return Promise.reject(new Error('Неверный slug'));
      }
      syncBuildersToTextareas();
      var payload = {
        id: ls.id||null,
        section_id: ls.section_id,
        title_ru: inTitle.value.trim(),
        slug: slugVal,
        is_published: !!isPublished,
        content: {
          tests: JSON.parse(taTests.value||'[]'),
          tasks: JSON.parse(taTasks.value||'[]'),
          theory_html: (ckeEditor? ckeEditor.getData() : (taTheory.value||''))
        }
      };
      return api('/api.php?action=lesson_save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    }

    btnSave.addEventListener('click', function(){
      send(false)
        .then(function(){ flash(status1,'Сохранено'); })
        .then(function(){ dlg.remove(); })
        .then(function(){ mountPanel(ls.section_id); })
        .catch(function(e){ if(e && e.message==='Неверный slug') return; alert('Ошибка: '+e.message); });
    });
    btnPub.addEventListener('click', function(){
      send(true)
        .then(function(){ flash(status2,'Опубликовано'); })
        .then(function(){ dlg.remove(); })
        .then(function(){ mountPanel(ls.section_id); })
        .catch(function(e){ if(e && e.message==='Неверный slug') return; alert('Ошибка: '+e.message); });
    });

    // Отключаем закрытие по клику вне окна: модалка закрывается только кнопкой/крестиком
    dlg.addEventListener('click', function(e){ /* отключено закрытие по клику по подложке */ });
  }

  // Инициализация
  mountLogin();
})();
