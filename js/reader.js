/* 읽기 화면: 책장 넘기기(page-flip), 쪽 이미지 늦게 불러오기, 쪽 이동 막대, 목차, 크게 보기. */
(function () {
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };

  var book = null;
  var flip = null;
  var pages = [];
  var requested = {};
  var count = 0;
  var mode = 'landscape';
  var current = 0;
  var bookW = 0;
  var handlers = {};
  var zoomIndex = 0;
  var rebuildTimer = 0;

  function emit(name, data) { (handlers[name] || []).forEach(function (fn) { fn(data); }); }
  function pad(n) { return String(n).padStart(3, '0'); }
  function pageSrc(i) { return book.dir + '/pages/p' + pad(i + 1) + '.webp'; }
  function thumbSrc(i) { return book.dir + '/thumbs/p' + pad(i + 1) + '.webp'; }
  function label(i) { return book.pageLabel(i); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function frames(n) {
    return new Promise(function (r) {
      (function step(k) { if (k <= 0) r(); else requestAnimationFrame(function () { step(k - 1); }); })(n);
    });
  }

  /* ───────── 펼침면 계산 ───────── */
  function spreadOf(i) {
    if (mode === 'portrait') return [i];
    if (i === 0) return [0];
    var l = i % 2 === 1 ? i : i - 1;
    var r = l + 1;
    if (r > count - 1) return [l];
    return [l, r];
  }
  function spreadText(i) {
    var s = spreadOf(i);
    if (s.length === 1) return label(s[0]);
    var a = s[0], b = s[1];
    if (a === 0 || b === count - 1) return label(a) + ' · ' + label(b);
    return (a + 1) + '–' + (b + 1) + '쪽';
  }

  /* ───────── 쪽 만들기 ───────── */
  function buildPages() {
    var host = $('flipbook');
    host.innerHTML = '';
    host.className = 'flipbook' + (mode === 'portrait' ? ' is-portrait' : '');
    pages = [];
    requested = {};
    for (var i = 0; i < count; i++) {
      var p = document.createElement('div');
      var hard = i === 0 || i === count - 1;
      p.className = 'page ' + (i % 2 === 1 ? 'is-l' : 'is-r');
      if (hard) p.dataset.density = 'hard';
      var img = document.createElement('img');
      img.alt = book.title + ' ' + label(i);
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('load', function () { this.classList.add('is-loaded'); });
      p.appendChild(img);
      host.appendChild(p);
      pages.push(p);
    }
  }

  function want(i) {
    if (i < 0 || i >= count || requested[i]) return;
    requested[i] = true;
    pages[i].firstChild.src = pageSrc(i);
  }
  function loadAround(i) {
    // 지금 펼친 면을 먼저, 그다음 앞뒤 면을 미리
    var s = spreadOf(i);
    s.forEach(want);
    for (var k = 1; k <= 4; k++) { want(s[s.length - 1] + k); want(s[0] - k); }
  }

  /* ───────── 크기 맞추기 ───────── */
  function decideMode() {
    var w = window.innerWidth, h = window.innerHeight;
    return (w < 720 || w / h < 1.05) ? 'portrait' : 'landscape';
  }
  function measure() {
    var stage = $('stage');
    var cs = getComputedStyle(stage);
    var aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var ratio = book.pageWidth / book.pageHeight;
    var w;
    if (mode === 'landscape') w = Math.min(aw - 28, ah * ratio * 2);
    else w = Math.min(aw, ah * ratio);
    return Math.max(160, Math.floor(w));
  }
  function applySize() {
    bookW = measure();
    $('book-shift').style.width = bookW + 'px';
    if (flip) {
      var st = flip.getSettings();
      st.minWidth = mode === 'portrait' ? Math.ceil(bookW / 2) + 4 : Math.floor(bookW / 2) - 4;
      $('flipbook').style.minWidth = '0px';
    }
  }

  /* ───────── 책 옮기기와 종이 두께 ───────── */
  function shiftFor(i) {
    if (mode !== 'landscape') return 0;
    if (i === 0) return -bookW / 4;
    if (spreadOf(i).length === 1 && i === count - 1) return bookW / 4;
    return 0;
  }
  function applyShift(i, animate) {
    var el = $('book-shift');
    el.classList.toggle('no-anim', !animate);
    el.style.transform = 'translateX(' + shiftFor(i).toFixed(1) + 'px)';
  }
  function applyStacks(i) {
    var max = Math.max(4, Math.min(12, bookW * 0.011));
    var p = count > 1 ? i / (count - 1) : 0;
    if (mode !== 'landscape') { $('stack-l').style.setProperty('--sw', '0px'); $('stack-r').style.setProperty('--sw', '0px'); return; }
    var l = i === 0 ? 0 : Math.max(1.5, max * p);
    var r = i >= count - 1 ? 0 : Math.max(1.5, max * (1 - p));
    $('stack-l').style.setProperty('--sw', l.toFixed(1) + 'px');
    $('stack-r').style.setProperty('--sw', r.toFixed(1) + 'px');
  }

  /* ───────── 상태 표시 ───────── */
  function updateUI(i) {
    $('page-ind').textContent = spreadText(i) + ' / 전체 ' + count + '쪽';
    var sc = $('scrubber');
    sc.value = i;
    sc.style.setProperty('--fill', (count > 1 ? (i / (count - 1)) * 100 : 0) + '%');
    sc.setAttribute('aria-valuetext', spreadText(i));
    $('btn-prev').disabled = i <= 0;
    $('btn-next').disabled = spreadOf(i)[spreadOf(i).length - 1] >= count - 1;
    markToc(i);
  }

  function onFlip(i) {
    current = i;
    loadAround(i);
    applyShift(i, true);
    applyStacks(i);
    updateUI(i);
    emit('flip', i);
  }

  /* ───────── page-flip 만들기 ───────── */
  function createFlip(start) {
    if (flip) { try { flip.destroy(); } catch (e) { /* 이미 정리됨 */ } flip = null; }
    var host = document.createElement('div');
    host.className = 'flipbook';
    host.id = 'flipbook';
    var old = $('flipbook');
    old.parentNode.replaceChild(host, old);

    mode = decideMode();
    buildPages();
    bookW = measure();
    $('book-shift').style.width = bookW + 'px';
    var minW = mode === 'portrait' ? Math.ceil(bookW / 2) + 4 : Math.floor(bookW / 2) - 4;

    flip = new St.PageFlip(host, {
      width: book.pageWidth,
      height: book.pageHeight,
      size: 'stretch',
      minWidth: minW,
      maxWidth: 4000,
      minHeight: 100,
      maxHeight: 6000,
      showCover: true,
      usePortrait: true,
      drawShadow: true,
      maxShadowOpacity: 0.5,
      flippingTime: reduceMotion ? 250 : 900,
      mobileScrollSupport: false,
      swipeDistance: 24,
      showPageCorners: true,
      startPage: start || 0,
      autoSize: true
    });
    host.style.minWidth = '0px';
    flip.loadFromHTML(pages);
    flip.on('flip', function (e) { onFlip(e.data); });
    flip.on('changeState', function (e) {
      if (e.data === 'flipping') {
        var s = spreadOf(current);
        var nearCover = s[0] === 0 || s[s.length - 1] >= count - 1 || (mode === 'landscape' && (s[0] === 1 || s[s.length - 1] === count - 2));
        if (window.PaperSound) (nearCover ? PaperSound.cover() : PaperSound.flip());
      }
      emit('state', e.data);
    });
    current = flip.getCurrentPageIndex();
    loadAround(current);
    applyShift(current, false);
    applyStacks(current);
    updateUI(current);
  }

  function onResize() {
    if (!book || $('reader').hidden) return;
    var m = decideMode();
    if (m !== mode) {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(function () { createFlip(current); }, 160);
      return;
    }
    applySize();
    applyShift(current, false);
    applyStacks(current);
  }

  /* ───────── 쪽 이동 막대 ───────── */
  function bindScrubber() {
    var sc = $('scrubber');
    var prev = $('scrub-preview');
    var showing = false;
    function preview() {
      var v = +sc.value;
      var s = spreadOf(v);
      var box = $('sp-imgs');
      box.innerHTML = '';
      s.forEach(function (i) {
        var im = document.createElement('img');
        im.src = thumbSrc(i);
        im.alt = '';
        box.appendChild(im);
      });
      $('sp-label').textContent = spreadText(v);
      var w = sc.clientWidth;
      var x = 7 + (w - 14) * (count > 1 ? v / (count - 1) : 0);
      var half = (prev.offsetWidth || 160) / 2;
      x = Math.max(half - 8, Math.min(w - half + 8, x));
      prev.style.setProperty('--x', x + 'px');
      sc.style.setProperty('--fill', (count > 1 ? (v / (count - 1)) * 100 : 0) + '%');
      if (!showing) { prev.classList.add('is-on'); showing = true; }
    }
    function hide() { prev.classList.remove('is-on'); showing = false; }
    sc.addEventListener('input', preview);
    sc.addEventListener('pointerdown', preview);
    sc.addEventListener('change', function () { goTo(+sc.value); setTimeout(hide, 500); });
    sc.addEventListener('pointerup', function () { setTimeout(hide, 500); });
    sc.addEventListener('blur', hide);
  }

  /* ───────── 목차 ───────── */
  function buildToc() {
    var list = $('toc-list');
    list.innerHTML = '';
    (book.toc || []).forEach(function (g, gi) {
      var li = document.createElement('li');
      li.className = 'toc-group';
      li.style.setProperty('--i', gi);
      var h = document.createElement('p');
      h.className = 'toc-group-title';
      h.textContent = g.title;
      li.appendChild(h);
      if (g.meta) {
        var m = document.createElement('p');
        m.className = 'toc-group-meta';
        m.textContent = g.meta;
        li.appendChild(m);
      }
      g.items.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'toc-item';
        b.dataset.index = it.page - 1;
        b.innerHTML = '<span></span><span></span>';
        b.firstChild.textContent = it.label;
        b.lastChild.textContent = it.page + '쪽';
        b.addEventListener('click', function () { goTo(it.page - 1); toggleToc(false); });
        li.appendChild(b);
      });
      list.appendChild(li);
    });

    var grid = $('toc-grid');
    grid.innerHTML = '';
    for (var i = 0; i < count; i++) {
      (function (i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'toc-thumb';
        b.dataset.index = i;
        b.setAttribute('aria-label', label(i) + '로 이동');
        var im = document.createElement('img');
        im.loading = 'lazy';
        im.src = thumbSrc(i);
        im.alt = '';
        var cap = document.createElement('span');
        cap.textContent = i === 0 ? '앞표지' : i === count - 1 ? '뒤표지' : String(i + 1);
        b.appendChild(im);
        b.appendChild(cap);
        b.addEventListener('click', function () { goTo(i); toggleToc(false); });
        grid.appendChild(b);
      })(i);
    }
  }

  function markToc(i) {
    var s = spreadOf(i);
    var here = null;
    var items = document.querySelectorAll('#toc-list .toc-item');
    items.forEach(function (b) {
      b.classList.remove('is-here');
      var idx = +b.dataset.index;
      if (idx <= s[s.length - 1] && (!here || idx >= +here.dataset.index)) here = b;
    });
    if (here) here.classList.add('is-here');
    document.querySelectorAll('#toc-grid .toc-thumb').forEach(function (b) {
      b.classList.toggle('is-here', s.indexOf(+b.dataset.index) !== -1);
    });
  }

  function toggleToc(open) {
    var toc = $('toc');
    var btn = $('btn-toc');
    var isOpen = toc.classList.contains('is-open');
    if (open === undefined) open = !isOpen;
    if (open) {
      toc.hidden = false;
      requestAnimationFrame(function () { requestAnimationFrame(function () { toc.classList.add('is-open'); }); });
      var here = toc.querySelector('.toc-item.is-here');
      if (here) setTimeout(function () { here.focus({ preventScroll: false }); }, 300);
    } else if (isOpen) {
      toc.classList.remove('is-open');
      setTimeout(function () { if (!toc.classList.contains('is-open')) toc.hidden = true; }, 560);
    }
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ───────── 크게 보기 ───────── */
  function zoomShow(i, fromRect) {
    zoomIndex = Math.max(0, Math.min(count - 1, i));
    var z = $('zoom');
    var img = $('zoom-img');
    img.src = pageSrc(zoomIndex);
    img.alt = book.title + ' ' + label(zoomIndex);
    $('zoom-label').textContent = label(zoomIndex);
    $('zoom-prev').disabled = zoomIndex <= 0;
    $('zoom-next').disabled = zoomIndex >= count - 1;
    if (z.hidden) {
      z.hidden = false;
      $('zoom-scroll').scrollTop = 0;
      requestAnimationFrame(function () {
        z.classList.add('is-open');
        if (fromRect && !reduceMotion && img.animate) {
          var to = img.getBoundingClientRect();
          var sx = fromRect.width / to.width;
          var dx = fromRect.left + fromRect.width / 2 - (to.left + to.width / 2);
          var dy = fromRect.top - to.top;
          img.animate([
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ')', opacity: 0.6 },
            { transform: 'none', opacity: 1 }
          ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
        }
        $('zoom-x').focus({ preventScroll: true });
      });
    } else {
      $('zoom-scroll').scrollTop = 0;
      img.animate && img.animate([{ opacity: 0.2, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
    }
  }
  function zoomClose() {
    var z = $('zoom');
    if (z.hidden) return;
    z.classList.remove('is-open');
    setTimeout(function () { z.hidden = true; z.classList.remove('is-actual'); $('zoom-fit-label').textContent = '더 크게'; }, 360);
    var s = spreadOf(current);
    if (s.indexOf(zoomIndex) === -1) goTo(zoomIndex);
    $('btn-zoom').focus({ preventScroll: true });
  }
  function bindZoom() {
    $('zoom-prev').addEventListener('click', function () { zoomShow(zoomIndex - 1); });
    $('zoom-next').addEventListener('click', function () { zoomShow(zoomIndex + 1); });
    $('zoom-x').addEventListener('click', zoomClose);
    $('zoom-fit').addEventListener('click', function () {
      var z = $('zoom');
      var on = !z.classList.contains('is-actual');
      z.classList.toggle('is-actual', on);
      $('zoom-fit-label').textContent = on ? '화면에 맞추기' : '더 크게';
      $('zoom-fit').setAttribute('aria-label', on ? '화면 폭에 맞추기' : '더 크게 보기');
    });
    $('zoom-fit-label').textContent = '더 크게';
    $('zoom-fit').setAttribute('aria-label', '더 크게 보기');
    // 마우스로 끌어서 이동
    var sc = $('zoom-scroll');
    var drag = null;
    sc.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop };
      sc.classList.add('is-drag');
      sc.setPointerCapture(e.pointerId);
    });
    sc.addEventListener('pointermove', function (e) {
      if (!drag) return;
      sc.scrollLeft = drag.l - (e.clientX - drag.x);
      sc.scrollTop = drag.t - (e.clientY - drag.y);
    });
    function end() { drag = null; sc.classList.remove('is-drag'); }
    sc.addEventListener('pointerup', end);
    sc.addEventListener('pointercancel', end);
    // 바깥 어두운 곳을 누르면 닫기
    sc.addEventListener('click', function (e) { if (e.target === sc && !drag) zoomClose(); });
  }

  /* ───────── 이동 ───────── */
  function goTo(i) {
    if (!flip) return;
    i = Math.max(0, Math.min(count - 1, i));
    var s = spreadOf(current);
    if (s.indexOf(i) !== -1) return;
    if (flip.getState() !== 'read') { flip.turnToPage(i); onFlip(flip.getCurrentPageIndex()); return; }
    flip.flip(i, 'top');
  }

  var bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    bindScrubber();
    bindZoom();
    $('btn-prev').addEventListener('click', function () { R.prev(); });
    $('btn-next').addEventListener('click', function () { R.next(); });
    $('btn-toc').addEventListener('click', function () { toggleToc(); });
    $('btn-toc-x').addEventListener('click', function () { toggleToc(false); });
    // 서랍이 열린 채 책을 누르면 서랍부터 닫는다
    $('stage').addEventListener('pointerdown', function () {
      if ($('toc').classList.contains('is-open')) toggleToc(false);
    }, true);
    $('btn-zoom').addEventListener('click', function () { R.openZoom(); });
    window.addEventListener('resize', onResize);
    // 휠로 넘기기 (트랙패드에서 너무 예민하지 않게 모아서)
    var acc = 0, lastEvt = 0, lastStep = 0;
    $('stage').addEventListener('wheel', function (e) {
      if (!flip) return;
      e.preventDefault();
      var now = performance.now();
      if (now - lastEvt > 250) acc = 0;
      lastEvt = now;
      acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(acc) > 60 && now - lastStep > 700 && flip.getState() === 'read') {
        if (acc > 0) R.next(); else R.prev();
        acc = 0;
        lastStep = now;
      }
    }, { passive: false });
  }

  var R = window.BookReader = {
    on: function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    book: function () { return book; },
    current: function () { return current; },
    count: function () { return count; },
    mode: function () { return mode; },
    label: function (i) { return label(i); },

    // 화면 밖에서(보이지 않게) 책을 만들어 표지 위치를 잴 수 있게 한다
    prepare: function (b) {
      book = b;
      count = b.pageCount;
      bindOnce();
      $('r-name').textContent = b.title;
      $('r-sub').textContent = b.subtitle + ' · ' + b.publisher;
      var sc = $('scrubber');
      sc.max = count - 1;
      var reader = $('reader');
      reader.classList.remove('is-leaving');
      reader.classList.add('is-prep', 'is-entering');
      reader.hidden = false;
      $('toc').hidden = true;
      $('toc').classList.remove('is-open');
      buildToc();
      createFlip(0);
      var cover = pages[0].firstChild;
      var ready = cover.decode ? cover.decode().catch(function () {}) : wait(200);
      return Promise.race([ready, wait(700)]).then(function () { return frames(2); });
    },
    coverRect: function () {
      return pages[0] ? pages[0].getBoundingClientRect() : null;
    },
    reveal: function () {
      var reader = $('reader');
      reader.classList.remove('is-prep');
      frames(1).then(function () { reader.classList.remove('is-entering'); });
    },
    openCover: function () {
      if (flip && current === 0) flip.flipNext('top');
    },
    // 서재로 돌아가기 전에 책을 앞표지로 덮는다
    closeToCover: function () {
      if (!flip) return Promise.resolve();
      toggleToc(false);
      if (current === 0) return Promise.resolve();
      return new Promise(function (resolve) {
        var done = false;
        function finish() { if (done) return; done = true; resolve(); }
        R.on('flip', function once(i) { if (i === 0) setTimeout(finish, reduceMotion ? 50 : 820); });
        if (flip.getState() !== 'read') { flip.turnToPage(0); onFlip(0); }
        else flip.flip(0, 'top');
        setTimeout(finish, 2600);
      });
    },
    hide: function () {
      var reader = $('reader');
      reader.classList.add('is-leaving');
      zoomClose();
      return wait(reduceMotion ? 30 : 520).then(function () {
        reader.hidden = true;
        reader.classList.remove('is-leaving');
        if (flip) { try { flip.destroy(); } catch (e) { /* 무시 */ } flip = null; }
        handlers.flip = (handlers.flip || []).filter(function (fn) { return fn.name !== 'once'; });
      });
    },
    next: function () { if (flip) flip.flipNext('top'); },
    prev: function () { if (flip) flip.flipPrev('top'); },
    goTo: goTo,
    toggleToc: toggleToc,
    tocOpen: function () { return $('toc').classList.contains('is-open'); },
    zoomOpen: function () { return !$('zoom').hidden; },
    zoomStep: function (d) { zoomShow(zoomIndex + d); },
    closeZoom: zoomClose,
    openZoom: function () {
      var i = spreadOf(current)[0];
      zoomShow(i, pages[i] ? pages[i].getBoundingClientRect() : null);
    }
  };
})();
