/* 떠다니는 서재: 입체 책, 둥실거리는 움직임, 빛 속의 먼지, 마우스를 따라 기우는 공간. */
(function () {
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var library, world, canvas, card;
  var items = [];          // 진짜 책 + 장식용 책
  var hovered = null;
  var opts = {};
  var running = false;
  var rafId = 0;
  var startT = 0;
  var lastNow = 0;
  var scatter = 0, scatterTarget = 0;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var view = { w: 0, h: 0, floorY: 0, hero: 300 };
  var motes = [], mctx = null, dpr = 1;

  var GHOST_COLORS = [
    ['#35596a', '#2a4856'], ['#4a5878', '#3a4662'], ['#6b6052', '#574d41'],
    ['#2f5252', '#244242'], ['#5a6d74', '#48585e'], ['#6f5b66', '#5a4953'],
    ['#3d6670', '#30525a'], ['#566a5a', '#455648'], ['#7a6f5e', '#62584a'],
    ['#44536b', '#364256']
  ];
  var NIGHT = [10, 24, 32];

  /* ───────── 도우미 ───────── */
  function mix(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function fog(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(mix(r, NIGHT[0], amount));
    g = Math.round(mix(g, NIGHT[1], amount));
    b = Math.round(mix(b, NIGHT[2], amount));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function make(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ───────── 입체 책 만들기 (서재와 날아오는 책이 같이 씀) ───────── */
  function buildBook(book, size, o) {
    o = o || {};
    var root = make(o.ghost || o.flyer ? 'div' : 'button', 'book' + (o.ghost ? ' ghost' : ''));
    if (!o.ghost && !o.flyer) {
      root.type = 'button';
      root.setAttribute('aria-label', book.title + ' ' + book.subtitle + ' 펼치기');
    }
    root.style.setProperty('--w', size.w + 'px');
    root.style.setProperty('--h', size.h + 'px');
    root.style.setProperty('--d', size.d + 'px');
    var c = o.colors || book.colors;
    root.style.setProperty('--cover', c.cover);
    root.style.setProperty('--spine', c.spine);
    if (c.spineInk) root.style.setProperty('--spine-ink', c.spineInk);
    if (c.edge) root.style.setProperty('--edge', c.edge);

    var front = make('div', 'face front', root);
    var back = make('div', 'face back', root);
    var spine = make('div', 'face spine', root);
    make('div', 'face edge', root);
    make('div', 'face top', root);
    make('div', 'face bottom', root);

    if (!o.ghost) {
      var fi = make('img', '', front);
      fi.src = book.dir + '/cover.webp';
      fi.alt = '';
      fi.draggable = false;
      var bi = make('img', '', back);
      bi.src = book.dir + '/back.webp';
      bi.alt = '';
      bi.draggable = false;
      var st = make('span', 'spine-title', spine);
      st.textContent = book.spine || book.title;
      var sm = make('span', 'spine-mark', spine);
      sm.textContent = String(book.year || '');
    }
    return root;
  }

  /* ───────── 배치 ───────── */
  function layout() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    var narrow = view.w < 640;
    var books = opts.books || [];
    var heroH = clamp(Math.min(view.h * 0.5, view.w * (narrow ? 0.62 : 0.4) * 1.414), 200, 470);
    if (books.length > 1) heroH *= 0.78;
    view.hero = heroH;
    view.floorY = view.h * 0.36;

    var real = items.filter(function (it) { return it.kind === 'book'; });
    real.forEach(function (it, i) {
      var n = real.length;
      var h = heroH, w = h / 1.414;
      var d = Math.max(10, w * 0.07);
      it.size = { w: w, h: h, d: d };
      it.el.style.setProperty('--w', w + 'px');
      it.el.style.setProperty('--h', h + 'px');
      it.el.style.setProperty('--d', d + 'px');
      it.shadow.style.setProperty('--sw', (w * 1.25) + 'px');
      if (n === 1) {
        it.base = { x: narrow ? 0 : view.w * 0.07, y: narrow ? view.h * 0.04 : view.h * 0.02, z: 0 };
      } else {
        var span = Math.min(view.w * 0.62, n * w * 1.5);
        it.base = {
          x: -span / 2 + span * (i / (n - 1)),
          y: (i % 2 ? 1 : -1) * view.h * 0.05,
          z: (i % 2 ? -140 : 0)
        };
      }
    });

    var r = rng(7);
    items.filter(function (it) { return it.kind === 'ghost'; }).forEach(function (it, i) {
      var front = it.layer === 'front';
      var h = heroH * (front ? mix(0.7, 0.95, r()) : mix(0.42, 0.78, r()));
      var w = h / mix(1.3, 1.5, r());
      var d = w * mix(0.06, 0.14, r());
      it.size = { w: w, h: h, d: d };
      it.el.style.setProperty('--w', w + 'px');
      it.el.style.setProperty('--h', h + 'px');
      it.el.style.setProperty('--d', d + 'px');
      var x, y, z;
      if (front) {
        x = (i % 2 ? 1 : -1) * view.w * mix(0.46, 0.56, r());
        y = view.h * mix(-0.18, 0.32, r());
        z = mix(160, 260, r());
      } else {
        // 원근으로 화면에 비치는 자리를 계산해, 가운데 책과 겹치지 않게 흩는다
        var heroX = view.w < 640 ? 0 : view.w * 0.07;
        var tries = 0, f, clash;
        do {
          z = mix(-1150, -380, r());
          f = 1500 / (1500 - z);
          x = view.w * mix(-0.75, 0.75, r()) / f;
          y = view.h * mix(-0.46, 0.42, r()) / f;
          clash = Math.abs(x * f - heroX) < (heroH / 1.414) * 0.75 + w * f * 0.6 &&
                  Math.abs(y * f) < heroH * 0.62 + h * f * 0.5;
          tries++;
        } while (clash && tries < 24);
      }
      it.base = { x: x, y: y, z: z };
    });

    if (canvas) sizeCanvas();
  }

  function makeParams(r, hero) {
    return {
      ax: hero ? 10 : mix(10, 26, r()), fx: mix(0.25, 0.45, r()), px: r() * 6.28,
      ay: hero ? 16 : mix(12, 30, r()), fy: mix(0.55, 0.9, r()), py: r() * 6.28,
      yaw0: hero ? 20 : mix(-50, 50, r()), ayaw: hero ? 15 : mix(10, 40, r()), fyaw: mix(0.18, 0.32, r()), pyaw: r() * 6.28,
      pitch0: hero ? 7 : mix(-14, 18, r()), ap: mix(3, 7, r()), fp: mix(0.3, 0.6, r()),
      ar: hero ? 3 : mix(3, 14, r()), fr: mix(0.2, 0.45, r()), pr: r() * 6.28
    };
  }

  function build() {
    var books = opts.books || [];
    var r = rng(42);
    books.forEach(function (book, i) {
      var el = buildBook(book, { w: 200, h: 280, d: 16 });
      var sh = make('div', 'shadow', world);
      world.appendChild(el);
      var it = {
        kind: 'book', book: book, el: el, shadow: sh,
        params: makeParams(r, true), delay: 0.25 + i * 0.18, alpha: 1,
        h: 0, tiltX: 0, tiltY: 0, ttx: 0, tty: 0,
        pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, s: 1 },
        frozen: null, thaw: 0, hidden: false
      };
      bindBook(it);
      items.push(it);
    });

    var ghosts = reduceMotion ? 4 : Math.max(0, 11 - books.length);
    for (var g = 0; g < ghosts; g++) {
      var front = g < 2;
      var depth = front ? 0 : mix(0.35, 0.75, r());
      var pair = GHOST_COLORS[g % GHOST_COLORS.length];
      var colors = {
        cover: fog(pair[0], front ? 0.55 : depth),
        spine: fog(pair[1], front ? 0.55 : depth),
        edge: fog('#e9eeee', front ? 0.7 : Math.min(0.92, depth + 0.25))
      };
      var gel = buildBook(null, { w: 120, h: 170, d: 12 }, { ghost: true, colors: colors });
      gel.setAttribute('aria-hidden', 'true');
      world.insertBefore(gel, world.firstChild);
      items.push({
        kind: 'ghost', layer: front ? 'front' : 'back', el: gel,
        params: makeParams(r, false), delay: 0.05 + g * 0.07, alpha: front ? 0.55 : 1,
        h: 0, pose: {}
      });
    }
  }

  /* ───────── 진짜 책: 마우스·키보드 ───────── */
  function bindBook(it) {
    var el = it.el;
    el.addEventListener('pointerenter', function () { setHover(it); });
    el.addEventListener('pointerleave', function () { if (hovered === it) setHover(null); it.ttx = 0; it.tty = 0; });
    el.addEventListener('pointermove', function (e) {
      var rect = el.getBoundingClientRect();
      it.ttx = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      it.tty = clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    });
    el.addEventListener('focus', function () { setHover(it); });
    el.addEventListener('blur', function () { if (hovered === it) setHover(null); });
    el.addEventListener('click', function () {
      if (opts.onOpen) opts.onOpen(it.book);
    });
  }

  function setHover(it) {
    hovered = it;
    if (!card) return;
    if (!it) { card.classList.remove('is-on'); return; }
    var b = it.book;
    document.getElementById('hc-kicker').textContent = (b.note ? b.note + ' · ' : '') + b.pageCount + '쪽';
    document.getElementById('hc-title').textContent = b.title;
    document.getElementById('hc-sub').textContent = b.subtitle + '\n' + b.publisher;
    document.getElementById('hc-sub').style.whiteSpace = 'pre-line';
    var mark = opts.getBookmark ? opts.getBookmark(b) : null;
    document.getElementById('hc-mark').textContent = mark ? '지난번 ' + mark + '까지 읽었어요' : '';
    placeCard();
    card.classList.add('is-on');
    if (opts.onHover) opts.onHover(b);
  }

  function placeCard() {
    if (!hovered || !card) return;
    var rect = hovered.el.querySelector('.front').getBoundingClientRect();
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var x, y;
    if (view.w < 640) {
      x = clamp(rect.left + rect.width / 2 - cw / 2, 16, view.w - cw - 16);
      y = Math.min(rect.bottom + 14, view.h - ch - 70);
    } else if (rect.right + 28 + cw < view.w - 16) {
      x = rect.right + 28;
      y = clamp(rect.top + rect.height * 0.3, 16, view.h - ch - 16);
    } else {
      x = Math.max(16, rect.left - 28 - cw);
      y = clamp(rect.top + rect.height * 0.3, 16, view.h - ch - 16);
    }
    card.style.setProperty('--hx', Math.round(x) + 'px');
    card.style.setProperty('--hy', Math.round(y) + 'px');
  }

  /* ───────── 움직임 ───────── */
  var cardTick = 0;
  function frame(now) {
    if (!lastNow) lastNow = now;
    var dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    var t = now / 1000;
    var since = t - startT;
    var k4 = 1 - Math.exp(-dt * 4);
    var k6 = 1 - Math.exp(-dt * 6);

    pointer.x += (pointer.tx - pointer.x) * k4;
    pointer.y += (pointer.ty - pointer.y) * k4;
    scatter += (scatterTarget - scatter) * (1 - Math.exp(-dt * 3));
    var mAmp = reduceMotion ? 0.15 : 1;

    world.style.transform = 'rotateX(' + (-pointer.y * 3).toFixed(3) + 'deg) rotateY(' + (pointer.x * 5).toFixed(3) + 'deg)';
    library.style.setProperty('--px', (pointer.x * -14).toFixed(2) + 'px');
    library.style.setProperty('--py', (pointer.y * -9).toFixed(2) + 'px');

    for (var i = 0; i < items.length; i++) {
      var it = items[i], p = it.params, b = it.base;
      if (!b) continue;
      var intro = reduceMotion ? 1 : easeOut(clamp((since - it.delay) / 1.7, 0, 1));
      var isBook = it.kind === 'book';
      if (isBook) {
        it.h += ((hovered === it ? 1 : 0) - it.h) * k6;
        it.tiltX += (it.ttx - it.tiltX) * k6;
        it.tiltY += (it.tty - it.tiltY) * k6;
      }
      var calm = 1 - it.h * 0.85;
      var x = b.x + Math.sin(t * p.fx + p.px) * p.ax * calm * mAmp;
      var y = b.y + Math.sin(t * p.fy + p.py) * p.ay * calm * mAmp - it.h * 14;
      var z = b.z + mix(-1500, 0, intro) + it.h * 80;
      var yaw = p.yaw0 + Math.sin(t * p.fyaw + p.pyaw) * p.ayaw * mAmp;
      var pitch = p.pitch0 + Math.sin(t * p.fp) * p.ap * mAmp;
      var roll = Math.sin(t * p.fr + p.pr) * p.ar * mAmp;
      if (isBook) {
        yaw = mix(yaw, -6 + it.tiltX * 16, it.h);
        pitch = mix(pitch, 3 - it.tiltY * 10, it.h);
        roll = mix(roll, 0, it.h);
      } else {
        // 책을 펼치면 장식 책들이 바깥으로 비켜난다
        x *= 1 + scatter * 0.35;
        z -= scatter * 420;
      }
      // 처음 나타날 때 한 바퀴 돌며 들어온다
      yaw += (1 - intro) * (isBook ? -140 : 90);
      var s = 1 + it.h * 0.03;

      var pose = { x: x, y: y, z: z, yaw: yaw, pitch: pitch, roll: roll, s: s };
      if (isBook && it.frozen) {
        pose = it.frozen;
      } else if (isBook && it.thaw) {
        var q = easeOut(clamp((t - it.thaw) / 0.9, 0, 1));
        var f = it.thawFrom;
        pose = {
          x: mix(f.x, x, q), y: mix(f.y, y, q), z: mix(f.z, z, q),
          yaw: mix(f.yaw, yaw, q), pitch: mix(f.pitch, pitch, q), roll: mix(f.roll, roll, q), s: mix(f.s, s, q)
        };
        if (q >= 1) it.thaw = 0;
      }
      it.pose = pose;

      it.el.style.transform =
        'translate3d(' + pose.x.toFixed(1) + 'px,' + pose.y.toFixed(1) + 'px,' + pose.z.toFixed(1) + 'px) ' +
        'rotateX(' + pose.pitch.toFixed(2) + 'deg) rotateY(' + pose.yaw.toFixed(2) + 'deg) rotateZ(' + pose.roll.toFixed(2) + 'deg) ' +
        'scale3d(' + pose.s + ',' + pose.s + ',' + pose.s + ')';
      var alpha = intro * it.alpha * (isBook ? 1 : 1 - scatter * 0.6);
      it.el.style.setProperty('--a', alpha.toFixed(3));
      for (var c = 0; c < it.el.children.length; c++) it.el.children[c].style.opacity = alpha.toFixed(3);

      if (isBook) {
        it.el.style.setProperty('--gloss', (pose.yaw * 2.4 + pointer.x * 30 - 10).toFixed(1) + '%');
        // 바닥 그림자: 책이 높이 뜰수록 작고 옅어진다
        var lift = clamp((view.floorY - (pose.y + it.size.h / 2)) / view.h, 0, 1);
        var ss = mix(1.05, 0.6, lift) * (1 + it.h * 0.08);
        it.shadow.style.transform = 'translate3d(' + pose.x.toFixed(1) + 'px,' + view.floorY.toFixed(1) + 'px,' + pose.z.toFixed(1) + 'px) scale(' + ss.toFixed(3) + ')';
        it.shadow.style.opacity = (it.hidden ? 0 : intro * mix(0.75, 0.3, lift) * (1 - it.h * 0.2)).toFixed(3);
      }
    }

    if (hovered && ++cardTick % 3 === 0) placeCard();
    drawMotes(dt, t);
    if (running) rafId = requestAnimationFrame(frame);
  }

  /* ───────── 빛 속의 먼지 ───────── */
  function sizeCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    mctx = canvas.getContext('2d');
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var want = reduceMotion ? 0 : Math.round(clamp((view.w * view.h) / 14000, 40, 130));
    var r = Math.random;
    while (motes.length < want) {
      motes.push({ x: r() * view.w, y: r() * view.h, z: 0.2 + r() * 0.8, ph: r() * 6.28, tw: 0.6 + r() * 1.8 });
    }
    motes.length = want;
  }

  function drawMotes(dt, t) {
    if (!mctx || !motes.length) return;
    mctx.clearRect(0, 0, view.w, view.h);
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.y -= (3 + m.z * 9) * dt;
      m.x += Math.sin(t * 0.35 + m.ph) * 4 * m.z * dt;
      if (m.y < -10) { m.y = view.h + 10; m.x = Math.random() * view.w; }
      var px = m.x + pointer.x * -26 * m.z;
      var py = m.y + pointer.y * -14 * m.z;
      // 창빛 줄기 안에 있는 먼지는 더 밝고 따뜻하게
      var cx = view.w * (0.2 + 0.3 * (py / view.h));
      var inShaft = Math.abs(px - cx) < view.w * 0.13;
      var a = (0.1 + 0.45 * m.z) * (0.55 + 0.45 * Math.sin(t * m.tw + m.ph));
      if (inShaft) a *= 1.9;
      mctx.fillStyle = inShaft ? 'rgba(241,205,146,' + a.toFixed(3) + ')' : 'rgba(205,232,232,' + (a * 0.7).toFixed(3) + ')';
      mctx.beginPath();
      mctx.arc(px, py, 0.4 + m.z * 1.6, 0, 6.283);
      mctx.fill();
    }
  }

  /* ───────── 공개 함수 ───────── */
  function find(id) {
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'book' && items[i].book.id === id) return items[i];
    return null;
  }

  window.LibraryScene = {
    buildBook: buildBook,
    init: function (o) {
      opts = o || {};
      library = document.getElementById('library');
      world = document.getElementById('world');
      canvas = document.getElementById('motes');
      card = document.getElementById('hover-card');
      build();
      layout();
      var count = (opts.books || []).length;
      document.getElementById('lib-count').textContent = '책 ' + count + '권';

      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        pointer.tx = clamp((e.clientX / view.w) * 2 - 1, -1, 1);
        pointer.ty = clamp((e.clientY / view.h) * 2 - 1, -1, 1);
      });
      document.addEventListener('pointerleave', function () { pointer.tx = 0; pointer.ty = 0; });
      var rt = 0;
      window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(layout, 120);
      });

      startT = performance.now() / 1000;
      this.resume();
      requestAnimationFrame(function () { library.classList.add('is-ready'); });
    },
    resume: function () {
      if (running) return;
      running = true;
      lastNow = 0;
      frame(performance.now());
    },
    pause: function () {
      running = false;
      cancelAnimationFrame(rafId);
    },
    dim: function (on) {
      library.classList.toggle('is-dimmed', !!on);
      scatterTarget = on ? 1 : 0;
      if (on) setHover(null);
    },
    frontRect: function (id) {
      var it = find(id);
      return it ? it.el.querySelector('.front').getBoundingClientRect() : null;
    },
    pose: function (id) {
      var it = find(id);
      return it ? it.pose : null;
    },
    size: function (id) {
      var it = find(id);
      return it ? it.size : null;
    },
    // 날아가는 동안 책의 자세를 고정했다가, 돌아오면 부드럽게 원래 움직임으로 섞는다
    freeze: function (id) {
      var it = find(id);
      if (it) { it.frozen = it.pose; it.thaw = 0; }
    },
    thaw: function (id) {
      var it = find(id);
      if (!it || !it.frozen) return;
      it.thawFrom = it.frozen;
      it.frozen = null;
      it.thaw = performance.now() / 1000;
    },
    setHidden: function (id, hidden) {
      var it = find(id);
      if (!it) return;
      it.hidden = !!hidden;
      it.el.classList.toggle('is-hidden', !!hidden);
    },
    focusBook: function (id) {
      var it = find(id);
      if (it) it.el.focus({ preventScroll: true });
    },
    clearHover: function () { setHover(null); }
  };
})();
