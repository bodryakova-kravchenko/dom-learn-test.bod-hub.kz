// Модуль редактора уроков (вынесен из бандла админки)
// Ожидает, что index.php проставит data-admin-base на #adminApp (фолбэк: window.ADMIN_BASE)
// Экспортирует глобальный объект window.AdminEditor с методом openLessonEditor(ls, isNew, onDone)
// Русские комментарии сохранены.
(function(){
  'use strict';

  // Базовый путь от сервера: читаем из data-атрибута контейнера adminApp
  var BASE = (function(){
    try{
      var el = (typeof document!=='undefined') ? document.getElementById('adminApp') : null;
      if (el && el.dataset && typeof el.dataset.adminBase === 'string') return el.dataset.adminBase;
    }catch(e){}
    // Фолбэк на window.ADMIN_BASE (на случай старых страниц)
    if (typeof window !== 'undefined' && typeof window.ADMIN_BASE === 'string') return window.ADMIN_BASE;
    return '';
  })();
  function u(p){ return (BASE ? BASE : '') + p; }
  function api(url, opt){ if (typeof url==='string' && url.charAt(0)==='/') url = u(url); opt = opt||{}; return fetch(url, opt).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }); }

  function openLessonEditor(ls, isNew, onDone){
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
    var row = document.createElement('div');
    row.className = 'row';
    var btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.textContent = '💾 Сохранить черновик';
    var status1 = document.createElement('span');
    status1.className = 'status';
    var btnPub = document.createElement('button');
    btnPub.type = 'button';
    btnPub.textContent = '📢 Опубликовать';
    var status2 = document.createElement('span');
    status2.className = 'status';
    row.appendChild(btnSave);
    row.appendChild(status1);
    row.appendChild(btnPub);
    row.appendChild(status2);
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
      return this.loader.file.then(function(file){
        return new Promise(function(resolve, reject){
          var form = new FormData();
          form.append('file', file);
          form.append('lesson_id', ls.id ? String(ls.id) : '0');
          fetch(u('/api.php?action=upload_image'), { method:'POST', body: form })
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
          ed.plugins.get('FileRepository').createUploadAdapter = function(loader){ return new UploadAdapter(loader); };
        })
        .catch(function(e){ console.warn('CKE init error', e); });
    });

    // --- Конструктор тестов и задач ---
    var testsBuilderWrap = document.createElement('div');
    testsBuilderWrap.className = 'builder tests-builder';
    var tasksBuilderWrap = document.createElement('div');
    tasksBuilderWrap.className = 'builder tasks-builder';

    // Хранилища инстансов редакторов
    var testsEditors = [];
    var tasksEditors = [];

    function destroyEditors(arr){ (arr||[]).forEach(function(rec){ if(rec && rec.editor){ try{ rec.editor.destroy(); }catch(e){} } }); arr.length = 0; }
    function uid(){ return Math.random().toString(36).slice(2,9); }

    function buildTestsUI(){
      testsBuilderWrap.innerHTML = '';
      var h = document.createElement('h4'); h.textContent = 'Тестовые вопросы'; testsBuilderWrap.appendChild(h);
      var list = document.createElement('div'); testsBuilderWrap.appendChild(list);
      var addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Добавить вопрос'; testsBuilderWrap.appendChild(addBtn);

      function addQuestion(q){
        var qid = uid();
        var item = document.createElement('div');
        item.className = 'item';
        item.dataset.qid = qid;
        var qLabel = document.createElement('div');
        qLabel.textContent = 'Текст вопроса:';
        item.appendChild(qLabel);
        var qArea = document.createElement('div');
        qArea.setAttribute('contenteditable','true');
        qArea.style.minHeight = '80px';
        qArea.style.border = '1px solid #ccc';
        qArea.style.padding = '6px';
        item.appendChild(qArea);
        var answersWrap = document.createElement('div');
        answersWrap.className = 'answers-list';
        item.appendChild(answersWrap);
        var ansLabel = document.createElement('div');
        ansLabel.textContent = 'Ответы (выберите правильный):';
        item.insertBefore(ansLabel, answersWrap);

        function addAnswerRow(val, idx, correctIdx){
          var row = document.createElement('div');
          row.className = 'answer-row';
          var rb = document.createElement('input');
          rb.type = 'radio';
          rb.name = 'correct-' + qid;
          rb.value = String(idx);
          if (typeof correctIdx === 'number' && correctIdx === idx) {
            rb.checked = true;
          }
          var inp = document.createElement('input');
          inp.type = 'text';
          inp.placeholder = 'Ответ';
          inp.value = val || '';
          row.appendChild(rb);
          row.appendChild(inp);
          answersWrap.appendChild(row);
        }

        var Ctor = getClassicCtor();
        function initQ(){
          var C = getClassicCtor(); 
          if(!C){ 
            console.warn('CKE not ready for tests'); 
            return; 
          }
          C.create(qArea, {
            toolbar: { items: ['heading','|','bold','italic','link','fontColor','|','alignment','|','imageUpload','blockQuote','|','undo','redo'] },
            removePlugins: [
              'MediaEmbed','List','Indent','IndentBlock',
              'RealTimeCollaborativeComments','RealTimeCollaborativeTrackChanges','RealTimeCollaborativeRevisionHistory',
              'PresenceList','Comments','TrackChanges','TrackChangesData','RevisionHistory',
              'CloudServices','CKBox','CKBoxUtils','CKBoxImageEdit','CKBoxImageEditUI','CKBoxImageEditEditing','CKFinder','EasyImage',
              'ExportPdf','ExportWord','WProofreader','MathType','SlashCommand','Template','DocumentOutline','FormatPainter','TableOfContents','Style','Pagination',
              'AIAssistant','MultiLevelList','MultiLevelListUI','MultiLevelListEditing','PasteFromOfficeEnhanced','PasteFromOfficeEnhancedUI','PasteFromOfficeEnhancedEditing','PasteFromOfficeEnhancedPropagator','CaseChange','CaseChangeUI','CaseChangeEditing'
            ],
            licenseKey: 'GPL'
          }).then(function(ed){
            testsEditors.push({qid: qid, editor: ed});
            ed.plugins.get('FileRepository').createUploadAdapter = function(loader){ return new UploadAdapter(loader); };
            if (q && q.question_html){ ed.setData(q.question_html); }
            else if (q && q.question){ ed.setData(q.question); }
          }).catch(function(e){ console.warn('CKE tests init error', e); });
        }
        if (Ctor) initQ(); else ensureCKE(initQ);

        var answers = (q && Array.isArray(q.answers)) ? q.answers.slice(0,4) : [];
        while (answers.length < 4) answers.push('');
        var corr = (q && typeof q.correctIndex==='number') ? q.correctIndex : -1;
        answers.forEach(function(a,i){
          addAnswerRow(a, i, corr);
        });
      }

      addBtn.addEventListener('click', function(){ addQuestion({answers:['',''], correctIndex:-1}); });

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

    // Валидация конструкторов
    function validateBuilders(){
      if (testsBuilderWrap.parentNode){
        var questions = testsBuilderWrap.querySelectorAll('.item');
        for (var i=0;i<questions.length;i++){
          var item = questions[i];
          var rows = item.querySelectorAll('.answers-list .answer-row');
          if (rows.length !== 4){ return 'В каждом вопросе должно быть ровно 4 варианта ответа.'; }
          var checked = 0; rows.forEach(function(row){ var rb=row.querySelector('input[type="radio"]'); if(rb && rb.checked) checked++; });
          if (checked !== 1){ return 'В каждом вопросе должен быть выбран ровно один правильный ответ.'; }
        }
      }
      return '';
    }

    function buildTasksUI(){
      tasksBuilderWrap.innerHTML = '';
      var h = document.createElement('h4'); h.textContent = 'Задачи'; tasksBuilderWrap.appendChild(h);
      var list = document.createElement('div'); tasksBuilderWrap.appendChild(list);
      var addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='btn-small'; addBtn.textContent='+ Добавить задачу'; tasksBuilderWrap.appendChild(addBtn);

      function addTask(t){
        var tid = uid();
        var item = document.createElement('div');
        item.className = 'item';
        item.dataset.tid = tid;
        var titleIn = document.createElement('input');
        titleIn.type = 'text';
        titleIn.placeholder = 'Заголовок';
        titleIn.value = (t && t.title) || '';
        var titleLabel = document.createElement('label');
        titleLabel.textContent = 'Заголовок задачи: ';
        titleLabel.appendChild(titleIn);
        item.appendChild(titleLabel);
        var bodyLabel = document.createElement('div');
        bodyLabel.textContent = 'Текст задачи:';
        item.appendChild(bodyLabel);
        var body = document.createElement('div');
        body.setAttribute('contenteditable','true');
        body.style.minHeight = '100px';
        body.style.border = '1px solid #ccc';
        body.style.padding = '6px';
        item.appendChild(body);

        var tools = document.createElement('div');
        tools.className = 'row';
        var delT = document.createElement('button');
        delT.type = 'button';
        delT.className = 'btn-small';
        delT.textContent = 'Удалить задачу';
        delT.addEventListener('click', function(){
          var recIdx = tasksEditors.findIndex(function(r){ return r.tid===tid; });
          if(recIdx>=0){ try{ tasksEditors[recIdx].editor.destroy(); }catch(e){} tasksEditors.splice(recIdx,1); }
          item.remove();
        });
        tools.appendChild(delT);
        item.appendChild(tools);

        list.appendChild(item);

        var Ctor = getClassicCtor();
        function initT(){
          var C = getClassicCtor(); if(!C){ console.warn('CKE not ready for tasks'); return; }
          C.create(body, {
            toolbar: { items: ['heading','|','bold','italic','link','fontColor','|','alignment','|','imageUpload','blockQuote','|','undo','redo'] },
            removePlugins: [
              'MediaEmbed','List','Indent','IndentBlock',
              'RealTimeCollaborativeComments','RealTimeCollaborativeTrackChanges','RealTimeCollaborativeRevisionHistory',
              'PresenceList','Comments','TrackChanges','TrackChangesData','RevisionHistory',
              'CloudServices','CKBox','CKBoxUtils','CKBoxImageEdit','CKBoxImageEditUI','CKBoxImageEditEditing','CKFinder','EasyImage',
              'ExportPdf','ExportWord','WProofreader','MathType',
              'SlashCommand','Template','DocumentOutline','FormatPainter','TableOfContents','Style','Pagination',
              'AIAssistant','MultiLevelList','MultiLevelListUI','MultiLevelListEditing',
              'PasteFromOfficeEnhanced','PasteFromOfficeEnhancedUI','PasteFromOfficeEnhancedEditing','PasteFromOfficeEnhancedPropagator',
              'CaseChange','CaseChangeUI','CaseChangeEditing'
            ],
            licenseKey: 'GPL'
          }).then(function(ed){
            tasksEditors.push({tid: tid, editor: ed, titleIn: titleIn});
            ed.plugins.get('FileRepository').createUploadAdapter = function(loader){ return new UploadAdapter(loader); };
            if (t && t.text_html){ ed.setData(t.text_html); }
          }).catch(function(e){ console.warn('CKE tasks init error', e); });
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
      var err = validateBuilders();
      if (err){ alert(err); return Promise.reject(new Error(err)); }
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
        .then(function(){ if(typeof onDone==='function') onDone(ls.section_id); })
        .catch(function(e){ if(e && e.message==='Неверный slug') return; alert('Ошибка: '+e.message); });
    });
    btnPub.addEventListener('click', function(){
      send(true)
        .then(function(){ flash(status2,'Опубликовано'); })
        .then(function(){ dlg.remove(); })
        .then(function(){ if(typeof onDone==='function') onDone(ls.section_id); })
        .catch(function(e){ if(e && e.message==='Неверный slug') return; alert('Ошибка: '+e.message); });
    });

    dlg.addEventListener('click', function(e){ /* отключено закрытие по клику по подложке */ });
  }

  window.AdminEditor = { openLessonEditor: openLessonEditor };
})();
