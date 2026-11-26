/* 서재와 읽기 화면을 잇는다: 책이 공중에서 책상으로 날아와 펼쳐지고, 덮으면 다시 날아간다. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var books = window.LIBRARY_BOOKS || [];
  var busy = false;
  var openId = null;
  var closing = false;
  var usedKeyboard = false;
  var resumeTimer = 0;
  var toastTimer = 0;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function frame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
  function byId(id) { for (var i = 0; i < books.length; i++) if (books[i].id === id) return books[i]; return null; }

  /* ───────── 읽던 곳 ───────── */
  function getMark(book) {
    try {
      var v = localStorage.getItem('library:last:' + book.id);
      var n = v == null ? NaN : parseInt(v, 10);
      return isNaN(n) ? null : n;
    } catch (e) { return null; }
  }
  function setMark(book, i) {
    try { localStorage.setItem('library:last:' + book.id, String(i)); } catch (e) { /* 저장 못 해도 읽기는 된다 */ }
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  /* ───────── 날아오는 책 ───────── */
  function clearFlyer() { $('flyer-stage').innerHTML = ''; }

  function fly(book, from, pose, to, dir) {
    var stage = $('flyer-stage');
    clearFlyer();
    var base = dir === 'in' ? to : from;          // 펼친 책 표지 크기를 기준으로 만든다
    var W = base.width, H = base.height, D = Math.max(10, W * 0.07);
    var wrap = document.createElement('div');
    wrap.className = 'flyer';
    wrap.style.width = W + 'px';
    wrap.style.height = H + 'px';
    wrap.style.transformOrigin = '50% 50%';
    var b = LibraryScene.buildBook(book, { w: W, h: H, d: D }, { flyer: true });
    wrap.appendChild(b);
    stage.appendChild(wrap);

    function at(rect, p, z, sMul) {
      var s = (rect.height / H) * (sMul || 1);
      var x = rect.left + rect.width / 2 - W / 2;
      var y = rect.top + rect.height / 2 - H / 2;
      return 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + (z || 0).toFixed(1) + 'px) ' +
        'rotateX(' + p.pitch.toFixed(2) + 'deg) rotateY(' + p.yaw.toFixed(2) + 'deg) rotateZ(' + p.roll.toFixed(2) + 'deg) ' +
        'scale3d(' + s.toFixed(4) + ',' + s.toFixed(4) + ',' + s.toFixed(4) + ')';
    }
    function lerpRect(a, c, t, lift) {
      var h = a.height + (c.height - a.height) * t;
      var cx = a.left + a.width / 2 + (c.left + c.width / 2 - a.left - a.width / 2) * t;
      var cy = a.top + a.height / 2 + (c.top + c.height / 2 - a.top - a.height / 2) * t - (lift || 0);
      return { left: cx - h * 0.35, top: cy - h / 2, width: h * 0.7, height: h };
    }
    var flat = { pitch: 0, yaw: 0, roll: 0 };
    var frames;
    if (dir === 'in') {
      frames = [
        { offset: 0, transform: at(from, pose, 0) },
        { offset: 0.42, transform: at(lerpRect(from, to, 0.45, 70), { pitch: -10, yaw: pose.yaw * 0.3 + 28, roll: -5 }, 240) },
        { offset: 0.78, transform: at(to, { pitch: 3, yaw: -6, roll: 0.6 }, 40, 1.01) },
        { offset: 1, transform: at(to, flat, -D / 2) }
      ];
    } else {
      frames = [
        { offset: 0, transform: at(from, flat, -D / 2) },
        { offset: 0.22, transform: at(from, { pitch: 6, yaw: -16, roll: 1 }, 160, 1.02) },
        { offset: 0.66, transform: at(lerpRect(from, to, 0.62, 60), { pitch: -6, yaw: pose.yaw * 0.6 - 24, roll: -3 }, 120) },
        { offset: 1, transform: at(to, pose, 0) }
      ];
    }
    if (reduceMotion || !wrap.animate) {
      wrap.style.transform = frames[frames.length - 1].transform;
      return wait(60);
    }
    var anim = wrap.animate(frames, {
      duration: dir === 'in' ? 1150 : 1050,
      easing: 'cubic-bezier(.33,.0,.2,1)',
      fill: 'both'
    });
    // 날아가는 동안 표지 위로 빛이 한 번 쓸고 지나간다
    b.style.setProperty('--gloss', '-60%');
    var g = b.querySelector('.front');
    if (g && g.animate) {
      g.animate([{ '--gloss': '-60%' }, { '--gloss': '60%' }], { duration: 1100 });
    }
    return anim.finished.catch(function () {});
  }

  /* ───────── 펼치기 ───────── */
  function openBook(book) {
    if (busy || openId) return;
    busy = true;
    if (window.PaperSound) PaperSound.unlock();
    LibraryScene.clearHover();
    LibraryScene.freeze(book.id);
    var from, pose;
    return frame().then(function () {
      from = LibraryScene.frontRect(book.id);
      pose = LibraryScene.pose(book.id);
      return BookReader.prepare(book);
    }).then(function () {
      var to = BookReader.coverRect();
      LibraryScene.setHidden(book.id, true);
      LibraryScene.dim(true);
      return fly(book, from, pose, to, 'in');
    }).then(function () {
      BookReader.reveal();
      return frame();
    }).then(function () {
      clearFlyer();
      openId = book.id;
      return wait(reduceMotion ? 40 : 280);
    }).then(function () {
      BookReader.openCover();
      setTimeout(function () { if (openId) LibraryScene.pause(); }, 1400);
      offerResume(book);
      busy = false;
      $('btn-back').focus({ preventScroll: true });
    }).catch(function (err) {
      busy = false;
      console.error(err);
      toast('책을 펼치지 못했어요. 새로고침한 뒤 다시 눌러 주세요.');
    });
  }

  /* ───────── 덮고 돌아가기 ───────── */
  function closeBook() {
    if (busy || !openId) return;
    busy = true;
    closing = true;
    hideResume();
    var book = byId(openId);
    LibraryScene.resume();
    BookReader.closeZoom();
    return BookReader.closeToCover().then(function () {
      var from = BookReader.coverRect();
      var to = LibraryScene.frontRect(book.id);
      var pose = LibraryScene.pose(book.id);
      var trip = fly(book, from, pose, to, 'out');
      BookReader.hide();
      LibraryScene.dim(false);
      return trip;
    }).then(function () {
      LibraryScene.setHidden(book.id, false);
      clearFlyer();
      LibraryScene.thaw(book.id);
      openId = null;
      closing = false;
      busy = false;
      if (usedKeyboard) LibraryScene.focusBook(book.id);
    }).catch(function (err) {
      console.error(err);
      clearFlyer();
      LibraryScene.setHidden(book.id, false);
      LibraryScene.dim(false);
      LibraryScene.thaw(book.id);
      openId = null;
      closing = false;
      busy = false;
    });
  }

  /* ───────── 이어 읽기 ───────── */
  function offerResume(book) {
    var mark = getMark(book);
    if (mark == null || mark < 3) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () {
      if (openId !== book.id || BookReader.current() > 2) return;
      $('resume-text').textContent = '지난번 ' + book.pageLabel(mark) + '까지 읽었어요';
      $('resume').hidden = false;
      $('resume').dataset.index = mark;
      resumeTimer = setTimeout(hideResume, 9000);
    }, 1300);
  }
  function hideResume() {
    clearTimeout(resumeTimer);
    $('resume').hidden = true;
  }

  /* ───────── 버튼과 키보드 ───────── */
  function bindUI() {
    $('btn-back').addEventListener('click', closeBook);
    $('btn-resume').addEventListener('click', function () {
      BookReader.goTo(+$('resume').dataset.index);
      hideResume();
    });
    $('btn-resume-x').addEventListener('click', hideResume);

    var sound = $('btn-sound');
    function paintSound() {
      var on = PaperSound.isEnabled();
      sound.setAttribute('aria-pressed', on ? 'true' : 'false');
      sound.setAttribute('aria-label', on ? '책장 소리 끄기' : '책장 소리 켜기');
    }
    sound.addEventListener('click', function () {
      PaperSound.setEnabled(!PaperSound.isEnabled());
      paintSound();
      if (PaperSound.isEnabled()) PaperSound.flip();
      toast(PaperSound.isEnabled() ? '책장 소리를 켰어요' : '책장 소리를 껐어요');
    });
    paintSound();

    $('btn-full').addEventListener('click', function () {
      var d = document;
      try {
        if (d.fullscreenElement) { d.exitFullscreen(); return; }
        var p = d.documentElement.requestFullscreen && d.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(function () { toast('이 화면에서는 전체 화면을 쓸 수 없어요'); });
        if (!p) toast('이 화면에서는 전체 화면을 쓸 수 없어요');
      } catch (e) { toast('이 화면에서는 전체 화면을 쓸 수 없어요'); }
    });

    BookReader.on('flip', function (i) {
      var b = BookReader.book();
      if (b && !closing && i > 0) setMark(b, i);
      if (i > 2) hideResume();
    });

    document.addEventListener('pointerdown', function () { usedKeyboard = false; }, true);
    document.addEventListener('keydown', function (e) {
      usedKeyboard = true;
      if (!openId || busy) return;
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (BookReader.zoomOpen()) {
        if (e.key === 'Escape') { e.preventDefault(); BookReader.closeZoom(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); BookReader.zoomStep(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); BookReader.zoomStep(1); }
        return;
      }
      if (tag === 'input') return; // 쪽 이동 막대는 화살표를 스스로 처리한다
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': e.preventDefault(); BookReader.next(); break;
        case 'ArrowLeft': case 'PageUp': e.preventDefault(); BookReader.prev(); break;
        case ' ':
          if (tag === 'button') return;
          e.preventDefault();
          if (e.shiftKey) BookReader.prev(); else BookReader.next();
          break;
        case 'Home': e.preventDefault(); BookReader.goTo(0); break;
        case 'End': e.preventDefault(); BookReader.goTo(BookReader.count() - 1); break;
        case 'Escape':
          e.preventDefault();
          if (BookReader.tocOpen()) BookReader.toggleToc(false); else closeBook();
          break;
        case 'z': case 'Z': BookReader.openZoom(); break;
        case 't': case 'T': BookReader.toggleToc(); break;
      }
    });
  }

  /* ───────── 시작 ───────── */
  var preloaded = {};
  function preload(book) {
    if (preloaded[book.id]) return;
    preloaded[book.id] = true;
    [1, 2, 3].forEach(function (n) {
      var im = new Image();
      im.src = book.dir + '/pages/p' + String(n).padStart(3, '0') + '.webp';
    });
  }

  function start() {
    LibraryScene.init({
      books: books,
      onOpen: openBook,
      onHover: preload,
      getBookmark: function (b) {
        var m = getMark(b);
        return m != null && m > 0 ? b.pageLabel(m) : null;
      }
    });
    bindUI();
    var want = byId(decodeURIComponent((location.hash || '').slice(1)));
    if (want) { preload(want); setTimeout(function () { openBook(want); }, reduceMotion ? 100 : 1700); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
