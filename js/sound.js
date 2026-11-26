/* 책장 넘기는 소리. 녹음 파일 없이 걸러 낸 잡음으로 종이 스치는 소리를 만듭니다.
   브라우저는 사용자가 한 번 누른 뒤에만 소리를 내 주므로, 첫 소리는 책을 고른 뒤에 납니다. */
(function () {
  var KEY = 'library:sound';
  var ctx = null;
  var noise = null;
  var enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 저장소를 못 쓰면 켜 둔다 */ }

  function audio() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    var len = Math.floor(ctx.sampleRate * 0.8);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noise.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      // 살짝 붉은 잡음: 흰 잡음보다 종이 소리에 가깝다
      var white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 3.2 + white * 0.25;
    }
    return ctx;
  }

  function swish(opts) {
    if (!enabled) return;
    var ac = audio();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    var t = ac.currentTime + 0.01;
    var dur = opts.dur;

    var src = ac.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = opts.rate || 1;

    var band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = opts.q || 0.9;
    band.frequency.setValueAtTime(opts.f0, t);
    band.frequency.exponentialRampToValueAtTime(opts.f1, t + dur * 0.7);

    var gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.vol, t + dur * 0.18);
    gain.gain.exponentialRampToValueAtTime(opts.vol * 0.55, t + dur * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(band).connect(gain).connect(ac.destination);
    src.start(t, Math.random() * 0.2, dur + 0.05);

    if (opts.thump) {
      var osc = ac.createOscillator();
      var og = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, t + dur * 0.75);
      osc.frequency.exponentialRampToValueAtTime(60, t + dur * 0.95);
      og.gain.setValueAtTime(0.0001, t + dur * 0.72);
      og.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.78);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
      osc.connect(og).connect(ac.destination);
      osc.start(t + dur * 0.7);
      osc.stop(t + dur * 1.1);
    }
  }

  window.PaperSound = {
    isEnabled: function () { return enabled; },
    setEnabled: function (on) {
      enabled = !!on;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* 무시 */ }
    },
    flip: function () {
      swish({ dur: 0.34 + Math.random() * 0.08, f0: 900 + Math.random() * 400, f1: 3200 + Math.random() * 900, vol: 0.22, q: 0.8 });
    },
    cover: function () {
      swish({ dur: 0.5, f0: 500, f1: 1800, vol: 0.2, q: 0.7, rate: 0.8, thump: true });
    },
    // 첫 사용자 동작 안에서 불러 두면 이후 소리가 바로 난다
    unlock: function () { var ac = audio(); if (ac && ac.state === 'suspended') ac.resume(); }
  };
})();
