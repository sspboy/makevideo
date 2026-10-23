'use strict';

(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const PARAM_KEY = 'jl_video_params_v1';
  const RECORD_KEY = 'jl_video_records_v1';

  const LIMITS = { video: 5, image: 40, audio: 1 };
  const PRESETS = {
    '750x750': [750, 750],
    '640x640': [640, 640]
  };
  const SCENE_KEYS = ['costume', 'general', 'keeporder'];
  const SCENE_LABEL = { costume: '服饰场景', general: '通用场景', keeporder: '按素材顺序' };
  const STYLE_LABEL = { slow: '舒缓', normal: '自然', fast: '动感' };
  const TYPE_LABEL = { video: '视频', image: '图片', audio: '音频' };
  const TRANS_LABEL = {
    '': '随机转场', basic: '无转场', slow: '舒缓', fast: '动感', normal: '自然',
    ink: '水墨', glitch: '机械故障', shift: '切换', mosaic: '马赛克', shutter: '百叶窗',
    zoom: '缩放', mask: '遮罩', brush: '笔刷', wind: '风舞', smog: '烟雾'
  };
  const DEFAULTS = {
    scene: 'costume', width: 750, height: 750, style: 'normal', duration: 6,
    transition: '', smart: true, puzzle: false
  };

  const state = {
    scene: DEFAULTS.scene,
    width: DEFAULTS.width,
    height: DEFAULTS.height,
    style: DEFAULTS.style,
    duration: DEFAULTS.duration,
    transition: DEFAULTS.transition,
    smart: DEFAULTS.smart,
    puzzle: DEFAULTS.puzzle,
    bgm: null,
    materials: [],
    phase: 'idle',
    timer: null,
    progress: 0
  };

  const TYPE_ICONS = {
    video: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="m16.5 10 5-3v10l-5-3"/></svg>',
    image: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m5 17 4.8-4.8a2 2 0 0 1 2.8 0L20 19"/></svg>',
    audio: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>'
  };

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function countType(type) {
    return state.materials.filter(function (m) { return m.type === type; }).length;
  }

  function usedCount(type) {
    return countType(type) + (type === 'audio' && state.bgm ? 1 : 0);
  }

  function videoSeconds() {
    return state.materials
      .filter(function (m) { return m.type === 'video'; })
      .reduce(function (sum, m) { return sum + (m.duration || 0); }, 0);
  }

  function fmtClock(sec) {
    const total = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' + s : String(s));
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes >= 1024 * 1024 * 1024) return ' · ' + (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return ' · ' + (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return ' · ' + Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function presetKey() {
    const key = state.width + 'x' + state.height;
    return PRESETS[key] ? key : '';
  }

  function saveParams() {
    try {
      localStorage.setItem(PARAM_KEY, JSON.stringify({
        scene: state.scene, width: state.width, height: state.height, style: state.style,
        duration: state.duration, transition: state.transition,
        smart: state.smart, puzzle: state.puzzle
      }));
    } catch (err) { /* storage unavailable */ }
  }

  function restoreParams() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PARAM_KEY) || 'null'); } catch (err) { saved = null; }
    if (!saved || typeof saved !== 'object') return;
    if (SCENE_KEYS.indexOf(saved.scene) !== -1) state.scene = saved.scene;
    if (STYLE_LABEL[saved.style]) state.style = saved.style;
    state.width = clampInt(saved.width, 32, 2160, DEFAULTS.width);
    state.height = clampInt(saved.height, 32, 2160, DEFAULTS.height);
    state.duration = clampInt(saved.duration, 6, 9, DEFAULTS.duration);
    if (typeof saved.smart === 'boolean') state.smart = saved.smart;
    if (typeof saved.puzzle === 'boolean') state.puzzle = saved.puzzle;
    if (typeof saved.transition === 'string' && TRANS_LABEL[saved.transition] !== undefined) {
      state.transition = saved.transition;
    }
  }

  function setSwitch(el, on) {
    if (el) el.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function syncParams() {
    $$('[data-seg="scene"] button').forEach(function (btn) {
      btn.setAttribute('aria-checked', String(btn.dataset.value === state.scene));
    });

    $$('[data-seg="style"] button').forEach(function (btn) {
      btn.setAttribute('aria-checked', String(btn.dataset.value === state.style));
    });
    $$('[data-seg="preset"] button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === presetKey()));
    });

    const w = $('#inputWidth');
    const h = $('#inputHeight');
    if (w && document.activeElement !== w) w.value = state.width;
    if (h && document.activeElement !== h) h.value = state.height;

    const range = $('#inputDuration');
    if (range) {
      range.value = state.duration;
      range.style.setProperty('--fill', ((state.duration - 6) / 3 * 100) + '%');
    }
    const out = $('#durationOut');
    if (out) out.textContent = state.duration + ' 秒';

    const transition = $('#inputTransition');
    if (transition) transition.value = state.transition;

    setSwitch($('#swSmart'), state.smart);
    setSwitch($('#swPuzzle'), state.puzzle);
    renderBgm();
  }

  function renderSummary() {
    const total = state.materials.length;
    const counts = '视频 ' + countType('video') + '/5 · 图片 ' + countType('image') + '/40 · 音频 ' + usedCount('audio') + '/1';
    const stripCounts = $('#stripCounts');
    if (stripCounts) stripCounts.textContent = counts;

    const seconds = videoSeconds();
    const stripDuration = $('#stripDuration');
    if (stripDuration) {
      stripDuration.textContent = '总时长 ' + fmtClock(seconds) + ' / 3:00';
      stripDuration.classList.toggle('is-warn', seconds > 180);
    }

    const durationText = state.duration + ' 秒';
    const spec = state.width + ' × ' + state.height;
    const sub = $('#stageSub');
    if (sub) sub.textContent = spec + ' · ' + durationText;
    const foot = $('#footSummary');
    if (foot) foot.textContent = total + ' 段素材 · ' + spec + ' · ' + durationText;
  }

  function materialMeta(m) {
    const parts = [TYPE_LABEL[m.type] + (m.local ? ' · 本地' : ' · 链接')];
    if (m.type === 'video' && m.duration) parts.push(fmtClock(m.duration));
    return parts.join(' · ') + fmtSize(m.size);
  }

  function renderStrip() {
    const strip = $('#strip');
    if (!strip) return;
    strip.innerHTML = '';
    state.materials.forEach(function (m) {
      const el = document.createElement('div');
      el.className = 'mat';
      el.dataset.id = m.id;
      el.innerHTML =
        '<div class="mat-thumb ' + m.type + '">' +
          (m.type === 'image' && m.url
            ? '<img src="' + escapeHtml(m.url) + '" alt="" />'
            : (TYPE_ICONS[m.type] || '')) +
        '</div>' +
        '<div class="mat-info">' +
          '<p class="mat-name" title="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + '</p>' +
          '<p class="mat-meta"><span class="type-dot ' + m.type + '"></span>' + escapeHtml(materialMeta(m)) + '</p>' +
        '</div>' +
        '<button class="mat-remove" type="button" aria-label="移除 ' + escapeHtml(m.name) + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>' +
        '</button>';
      strip.appendChild(el);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-tile';
    add.id = 'stripAdd';
    add.setAttribute('aria-label', '添加素材');
    add.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>添加</span>';
    add.addEventListener('click', pickFiles);

    if (state.bgm) {
      const bgmEl = document.createElement('div');
      bgmEl.className = 'mat mat-bgm';
      const meta = ['背景音乐'];
      if (state.bgm.duration) meta.push(fmtClock(state.bgm.duration));
      bgmEl.innerHTML =
        '<div class="mat-thumb audio">' + TYPE_ICONS.audio + '</div>' +
        '<div class="mat-info">' +
          '<p class="mat-name" title="' + escapeHtml(state.bgm.name) + '">' + escapeHtml(state.bgm.name) + '</p>' +
          '<p class="mat-meta">' + escapeHtml(meta.join(' · ')) + fmtSize(state.bgm.size) + '</p>' +
        '</div>' +
        '<button class="mat-remove" type="button" data-bgm="1" aria-label="移除背景音乐">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>' +
        '</button>';
      strip.appendChild(bgmEl);
    }

    strip.appendChild(add);
  }

  function renderPreview() {
    const empty = $('#stageEmpty');
    const video = $('#previewVideo');
    const image = $('#previewImage');
    const play = $('#playToggle');
    const firstVideo = state.materials.find(function (m) { return m.type === 'video'; });
    const firstImage = state.materials.find(function (m) { return m.type === 'image'; });
    const hasVisual = Boolean(firstVideo || firstImage);

    if (state.materials.length === 0) {
      empty.hidden = false;
      $('.empty-title', empty).textContent = '拖入素材，开始合成';
      $('.empty-sub', empty).textContent = '视频、图片、音频按列表顺序参与生成';
      $('.empty-actions', empty).hidden = false;
    } else if (!hasVisual) {
      empty.hidden = false;
      $('.empty-title', empty).textContent = '已添加音频素材';
      $('.empty-sub', empty).textContent = '画面将由场景、转场与智能特效自动生成';
      $('.empty-actions', empty).hidden = true;
    } else {
      empty.hidden = true;
    }

    if (firstVideo) {
      if (video.dataset.src !== firstVideo.url) {
        video.src = firstVideo.url;
        video.dataset.src = firstVideo.url;
      }
      video.hidden = false;
      image.hidden = true;
      play.hidden = false;
    } else if (firstImage) {
      image.src = firstImage.url;
      image.hidden = false;
      video.hidden = true;
      video.pause();
      play.hidden = true;
    } else {
      video.hidden = true;
      image.hidden = true;
      video.pause();
      play.hidden = true;
    }

    const frame = $('#stageFrame');
    if (frame) frame.classList.toggle('is-empty', !hasVisual);

    const badge = $('#stageBadge');
    if (badge) badge.hidden = state.phase !== 'done';
    if (play && state.phase === 'rendering') play.hidden = true;
  }

  function fitStage() {
    const box = $('#stageBox');
    const frame = $('#stageFrame');
    if (!box || !frame) return;
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const ratio = (Number(state.width) || 1) / (Number(state.height) || 1);
    if (!bw || !bh) return;
    let fw = bw;
    let fh = fw / ratio;
    if (fh > bh) {
      fh = bh;
      fw = fh * ratio;
    }
    frame.style.width = Math.max(80, Math.floor(fw)) + 'px';
    frame.style.height = Math.max(80, Math.floor(fh)) + 'px';
  }

  function renderPhase() {
    const rendering = state.phase === 'rendering';
    const done = state.phase === 'done';
    const generate = $('#btnGenerate');
    if (generate) {
      generate.hidden = rendering;
      generate.textContent = done ? '重新生成' : '生成视频';
    }
    const cancel = $('#btnCancel');
    if (cancel) cancel.hidden = !rendering;
    const payload = $('#btnPayload');
    if (payload) payload.disabled = rendering;
    const progress = $('#stageProgress');
    if (progress) progress.hidden = !rendering;
    const badge = $('#stageBadge');
    if (badge) badge.hidden = !done;
    document.body.classList.toggle('is-rendering', rendering);
  }

  function syncAll() {
    syncParams();
    renderStrip();
    renderPreview();
    renderSummary();
    renderPhase();
    fitStage();
  }

  function invalidate() {
    if (state.phase === 'done') {
      state.phase = 'idle';
      renderPhase();
      renderPreview();
    }
  }

  /* ─── Toast ─── */
  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 2400);
  }

  /* ─── Materials ─── */
  function pickFiles() {
    const input = $('#fileInput');
    if (input) input.click();
  }

  function detectType(file) {
    const mime = (file.type || '').toLowerCase();
    if (mime.indexOf('video/') === 0) return 'video';
    if (mime.indexOf('image/') === 0) return 'image';
    if (mime.indexOf('audio/') === 0) return 'audio';
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    if (['mp4', 'mov', 'avi', 'mkv'].indexOf(ext) !== -1) return 'video';
    if (['jpg', 'jpeg', 'png'].indexOf(ext) !== -1) return 'image';
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].indexOf(ext) !== -1) return 'audio';
    return '';
  }

  function probeDuration(material) {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = function () {
      if (Number.isFinite(probe.duration)) {
        material.duration = probe.duration;
        renderSummary();
        renderStrip();
      }
      probe.removeAttribute('src');
      probe.load();
    };
    probe.src = material.url;
  }

  function addFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    let added = 0;
    let skipped = 0;
    let bgmBlocked = 0;
    files.forEach(function (file) {
      const type = detectType(file);
      if (type === 'audio' && state.bgm) {
        bgmBlocked += 1;
        return;
      }
      if (!type || usedCount(type) >= LIMITS[type] || (type === 'video' && file.size > 1024 * 1024 * 1024)) {
        skipped += 1;
        return;
      }
      const material = {
        id: uid(),
        type: type,
        name: file.name,
        url: URL.createObjectURL(file),
        size: file.size,
        local: true,
        duration: 0
      };
      state.materials.push(material);
      added += 1;
      if (type === 'video') probeDuration(material);
    });

    if (added > 0) {
      invalidate();
      syncAll();
      toast('已添加 ' + added + ' 个素材');
    }
    if (skipped > 0) {
      toast('有 ' + skipped + ' 个文件超出数量限制或格式不支持');
    }
    if (bgmBlocked > 0) {
      toast('背景音乐已占用音频轨，请先移除背景音乐');
    }
    if (added === 0 && skipped === 0 && bgmBlocked === 0) toast('未选择任何文件');
  }

  function removeMaterial(id) {
    const index = state.materials.findIndex(function (m) { return m.id === id; });
    if (index === -1) return;
    const material = state.materials[index];
    state.materials.splice(index, 1);
    const video = $('#previewVideo');
    if (video && video.dataset.src === material.url) {
      video.pause();
      video.removeAttribute('src');
      video.removeAttribute('data-src');
      video.load();
    }
    if (material.local && material.url) URL.revokeObjectURL(material.url);
    invalidate();
    syncAll();
  }

  function addLinkedMaterial(type, url, name) {
    if (type === 'audio' && state.bgm) {
      toast('背景音乐已占用音频轨，请先移除背景音乐');
      return false;
    }
    if (usedCount(type) >= LIMITS[type]) {
      toast('该类型素材已达上限（最多 ' + LIMITS[type] + ' 个）');
      return false;
    }
    state.materials.push({
      id: uid(), type: type, name: name, url: url, size: 0, local: false, duration: 0
    });
    invalidate();
    syncAll();
    toast('已添加链接素材');
    return true;
  }

  /* ─── Background music ─── */
  function renderBgm() {
    const zone = $('#bgmZone');
    const empty = $('#bgmEmpty');
    const filled = $('#bgmFilled');
    if (!zone || !empty || !filled) return;

    const bgm = state.bgm;
    empty.hidden = Boolean(bgm);
    filled.hidden = !bgm;
    zone.classList.toggle('is-filled', Boolean(bgm));

    if (bgm) {
      const name = $('#bgmName');
      if (name) {
        name.textContent = bgm.name;
        name.title = bgm.name;
      }
      const meta = $('#bgmMeta');
      if (meta) {
        const parts = ['音频'];
        if (bgm.duration) parts.push(fmtClock(bgm.duration));
        meta.textContent = parts.join(' · ') + fmtSize(bgm.size);
      }
    }

    const hint = $('#bgmHint');
    if (hint) hint.textContent = '最多 1 首，作为音频轨参与合成。';
    syncBgmPlayIcon();
  }

  function syncBgmPlayIcon() {
    const audio = $('#bgmAudio');
    const btn = $('#btnBgmPlay');
    if (!audio || !btn) return;
    const playing = Boolean(state.bgm) && !audio.paused;
    const playIcon = $('.icon-bgm-play', btn);
    const pauseIcon = $('.icon-bgm-pause', btn);
    if (playIcon) playIcon.hidden = playing;
    if (pauseIcon) pauseIcon.hidden = !playing;
    btn.setAttribute('aria-label', playing ? '暂停试听' : '试听背景音乐');
  }

  function resetBgmBar() {
    const bar = $('#bgmBar');
    if (bar) bar.style.width = '0%';
  }

  function setBgm(file) {
    if (!file) return;
    if (detectType(file) !== 'audio') {
      toast('请选择音频文件（MP3 / WAV / M4A）');
      return;
    }
    if (file.size > 1024 * 1024 * 1024) {
      toast('音频文件不能超过 1 GB');
      return;
    }
    if (countType('audio') > 0) {
      toast('素材列表已有音频，请先移除后再上传背景音乐');
      return;
    }
    clearBgm(true);
    state.bgm = {
      id: uid(),
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
      duration: 0
    };
    const audio = $('#bgmAudio');
    if (audio) {
      audio.src = state.bgm.url;
    }
    invalidate();
    renderBgm();
    renderStrip();
    renderSummary();
    toast('已添加背景音乐');
  }

  function clearBgm(silent) {
    const audio = $('#bgmAudio');
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (state.bgm && state.bgm.url) URL.revokeObjectURL(state.bgm.url);
    state.bgm = null;
    resetBgmBar();
    renderBgm();
    if (!silent) {
      renderStrip();
      renderSummary();
      invalidate();
      toast('已移除背景音乐');
    }
  }

  function pauseBgm() {
    const audio = $('#bgmAudio');
    if (audio && !audio.paused) audio.pause();
  }

  function bindBgm() {
    const input = $('#bgmInput');
    const pick = function () { if (input) input.click(); };

    if (input) {
      input.addEventListener('change', function () {
        setBgm(input.files && input.files[0]);
        input.value = '';
      });
    }

    const empty = $('#bgmEmpty');
    if (empty) empty.addEventListener('click', pick);
    const replace = $('#btnBgmReplace');
    if (replace) replace.addEventListener('click', pick);
    const remove = $('#btnBgmRemove');
    if (remove) remove.addEventListener('click', function () { clearBgm(false); });

    const audio = $('#bgmAudio');
    const play = $('#btnBgmPlay');
    if (play && audio) {
      play.addEventListener('click', function () {
        if (!state.bgm) return;
        if (audio.paused) audio.play().catch(function () { toast('无法播放该音频'); });
        else audio.pause();
      });
    }
    if (audio) {
      audio.addEventListener('play', syncBgmPlayIcon);
      audio.addEventListener('pause', syncBgmPlayIcon);
      audio.addEventListener('loadedmetadata', function () {
        if (state.bgm && Number.isFinite(audio.duration)) {
          state.bgm.duration = audio.duration;
          renderBgm();
          renderStrip();
        }
      });
      audio.addEventListener('timeupdate', function () {
        const bar = $('#bgmBar');
        if (!bar) return;
        const total = Number(audio.duration) || (state.bgm ? state.bgm.duration : 0);
        const pct = total > 0 ? Math.min(100, (audio.currentTime / total) * 100) : 0;
        bar.style.width = pct + '%';
      });
      audio.addEventListener('ended', function () {
        resetBgmBar();
        syncBgmPlayIcon();
      });
    }

    const zone = $('#bgmZone');
    if (zone) {
      ['dragenter', 'dragover'].forEach(function (type) {
        zone.addEventListener(type, function (event) {
          event.preventDefault();
          event.stopPropagation();
          zone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'dragend'].forEach(function (type) {
        zone.addEventListener(type, function () { zone.classList.remove('is-dragover'); });
      });
      zone.addEventListener('drop', function (event) {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.remove('is-dragover');
        if (event.dataTransfer && event.dataTransfer.files.length) setBgm(event.dataTransfer.files[0]);
      });
    }
  }

  /* ─── Param interactions ─── */
  function bindParams() {
    $$('[data-seg]').forEach(function (group) {
      group.addEventListener('click', function (event) {
        const btn = event.target.closest('button[data-value]');
        if (!btn) return;
        const kind = group.dataset.seg;
        if (kind === 'scene') state.scene = btn.dataset.value;
        if (kind === 'style') state.style = btn.dataset.value;
        if (kind === 'preset' && PRESETS[btn.dataset.value]) {
          state.width = PRESETS[btn.dataset.value][0];
          state.height = PRESETS[btn.dataset.value][1];
        }
        invalidate();
        syncParams();
        renderSummary();
        fitStage();
        saveParams();
      });
    });

    const width = $('#inputWidth');
    const height = $('#inputHeight');
    if (width) {
      width.addEventListener('input', function () {
        const value = Number(width.value);
        if (Number.isFinite(value) && value > 0) state.width = Math.round(value);
        invalidate(); renderSummary(); syncParams(); fitStage(); saveParams();
      });
      width.addEventListener('blur', function () {
        state.width = clampInt(width.value, 32, 2160, state.width);
        syncParams(); renderSummary(); fitStage(); saveParams();
      });
    }
    if (height) {
      height.addEventListener('input', function () {
        const value = Number(height.value);
        if (Number.isFinite(value) && value > 0) state.height = Math.round(value);
        invalidate(); renderSummary(); syncParams(); fitStage(); saveParams();
      });
      height.addEventListener('blur', function () {
        state.height = clampInt(height.value, 32, 2160, state.height);
        syncParams(); renderSummary(); fitStage(); saveParams();
      });
    }

    const duration = $('#inputDuration');
    if (duration) {
      duration.addEventListener('input', function () {
        state.duration = clampInt(duration.value, 6, 9, DEFAULTS.duration);
        invalidate(); syncParams(); renderSummary(); saveParams();
      });
    }

    const transition = $('#inputTransition');
    if (transition) {
      transition.addEventListener('change', function () {
        state.transition = transition.value;
        invalidate(); saveParams();
      });
    }

    const switches = [
      ['#swSmart', 'smart'], ['#swPuzzle', 'puzzle']
    ];
    switches.forEach(function (pair) {
      const el = $(pair[0]);
      if (!el) return;
      el.addEventListener('click', function () {
        state[pair[1]] = !state[pair[1]];
        invalidate(); syncParams(); renderSummary(); saveParams();
      });
    });

    const reset = $('#btnResetParams');
    if (reset) {
      reset.addEventListener('click', function () {
        Object.keys(DEFAULTS).forEach(function (key) { state[key] = DEFAULTS[key]; });
        invalidate(); syncParams(); renderSummary(); fitStage(); saveParams();
        toast('已恢复默认参数');
      });
    }
  }

  /* ─── URL popover ─── */
  function openUrlPopover() {
    const popover = $('#urlPopover');
    if (!popover) return;
    popover.hidden = false;
    const input = $('#urlInput');
    if (input) setTimeout(function () { input.focus(); }, 20);
  }

  function closeUrlPopover() {
    const popover = $('#urlPopover');
    if (popover) popover.hidden = true;
  }

  function bindUrl() {
    const openers = [$('#btnUrlAdd'), $('#btnEmptyUrl')];
    openers.forEach(function (btn) { if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); openUrlPopover(); }); });
    const close = $('#btnCloseUrl');
    if (close) close.addEventListener('click', closeUrlPopover);
    const cancel = $('#btnCancelUrl');
    if (cancel) cancel.addEventListener('click', closeUrlPopover);

    const form = $('#urlForm');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const type = $('#urlType').value;
      const url = $('#urlInput').value.trim();
      const nameInput = $('#urlName');
      if (!/^https?:\/\/\S+$/i.test(url)) {
        toast('请输入以 http(s) 开头的有效链接');
        return;
      }
      if (/[\u4e00-\u9fa5]/.test(url)) {
        toast('链接地址中不能包含中文字符');
        return;
      }
      let name = nameInput && nameInput.value.trim();
      if (!name) {
        const segment = url.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '素材';
        try { name = decodeURIComponent(segment); } catch (err) { name = segment; }
      }
      if (addLinkedMaterial(type, url, name)) {
        form.reset();
        closeUrlPopover();
      }
    });
  }

  /* ─── Generation ─── */
  const STEPS = [
    [0, '解析素材与元数据'], [22, '生成分镜脚本'], [48, '合成转场与特效'],
    [74, '渲染输出'], [94, '准备预览']
  ];

  function updateProgress(p) {
    let label = STEPS[0][1];
    STEPS.forEach(function (step) { if (p >= step[0]) label = step[1]; });
    const stage = $('#progressStage');
    if (stage) stage.textContent = label;
    const pct = $('#progressPct');
    if (pct) pct.textContent = String(Math.round(p));
    const bar = $('#progressBar');
    if (bar) bar.style.width = p.toFixed(1) + '%';
  }

  function startGenerate() {
    if (state.phase === 'rendering') return;
    if (state.materials.length === 0) {
      toast(state.bgm ? '已设置背景音乐，还需添加视频或图片素材' : '请先添加至少 1 个素材');
      return;
    }
    closeUrlPopover();
    pauseBgm();
    state.phase = 'rendering';
    state.progress = 0;
    updateProgress(0);
    renderPhase();
    renderPreview();
    const started = performance.now();
    const total = 4600;
    state.timer = setInterval(function () {
      const p = Math.min(100, ((performance.now() - started) / total) * 100);
      state.progress = p;
      updateProgress(p);
      if (p >= 100) finishGenerate();
    }, 70);
  }

  function finishGenerate() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.phase = 'done';
    state.progress = 100;
    renderPhase();
    renderPreview();
    fitStage();
    addRecord();
    toast('预览渲染完成，可在「请求参数」查看调用参数');
  }

  function cancelGenerate() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.phase = 'idle';
    state.progress = 0;
    renderPhase();
    renderPreview();
    toast('已取消本次生成');
  }

  function buildPayload() {
    const payload = {
      Action: 'GenerateVideo',
      Scene: state.scene,
      Width: state.width,
      Height: state.height,
      Style: state.style,
      Duration: state.duration
    };
    if (state.transition) payload.TransitionStyle = state.transition;
    payload.SmartEffect = state.smart;
    payload.PuzzleEffect = state.puzzle;
    const files = state.materials.slice();
    if (state.bgm) {
      files.push({ type: 'audio', name: state.bgm.name, local: true, url: state.bgm.url });
    }
    files.forEach(function (m, index) {
      const n = index + 1;
      payload['FileList.' + n + '.Type'] = m.type;
      payload['FileList.' + n + '.FileUrl'] = m.local ? '<需上传至 OSS>' : m.url;
      payload['FileList.' + n + '.FileName'] = m.name;
    });
    return JSON.stringify(payload, null, 2);
  }

  function openPayload() {
    const code = $('#payloadCode');
    const modal = $('#payloadModal');
    const scrim = $('#modalScrim');
    if (!code || !modal) return;
    code.textContent = buildPayload();
    modal.hidden = false;
    if (scrim) scrim.hidden = false;
  }

  function closePayload() {
    const modal = $('#payloadModal');
    const scrim = $('#modalScrim');
    if (modal) modal.hidden = true;
    if (scrim) scrim.hidden = true;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        area.remove();
      }
    });
  }

  /* ─── Records ─── */
  function loadRecords() {
    try {
      const list = JSON.parse(localStorage.getItem(RECORD_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (err) { return []; }
  }

  function addRecord() {
    const list = loadRecords();
    list.unshift({
      ts: Date.now(),
      scene: SCENE_LABEL[state.scene],
      size: state.width + '×' + state.height,
      duration: state.duration + ' 秒',
      count: state.materials.length,
      transition: TRANS_LABEL[state.transition] || '随机转场',
      bgm: state.bgm ? state.bgm.name : ''
    });
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(list.slice(0, 30))); } catch (err) { /* ignore */ }
    updateRecordCount();
    renderRecords();
  }

  function updateRecordCount() {
    const badge = $('#recordCount');
    if (!badge) return;
    const count = loadRecords().length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function fmtDate(ts) {
    const date = new Date(ts);
    const pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function renderRecords() {
    const list = $('#recordsList');
    if (!list) return;
    const records = loadRecords();
    if (records.length === 0) {
      list.innerHTML = '<div class="drawer-empty"><p>暂无生成记录</p><p class="hint">完成一次生成后会保存在这里。</p></div>';
      return;
    }
    list.innerHTML = records.map(function (rec) {
      return '<div class="rec">' +
        '<div class="rec-top"><span class="rec-time">' + escapeHtml(fmtDate(rec.ts)) + '</span>' +
        '<span class="rec-size">' + escapeHtml(rec.size) + '</span></div>' +
        '<p class="rec-detail">' + escapeHtml(rec.scene) + ' · ' + escapeHtml(rec.duration) +
        ' · ' + rec.count + ' 段素材 · ' + escapeHtml(rec.transition) +
        (rec.bgm ? ' · 配乐 ' + escapeHtml(rec.bgm) : '') + '</p>' +
        '</div>';
    }).join('');
  }

  function openRecords() {
    const drawer = $('#recordsDrawer');
    const scrim = $('#scrim');
    if (!drawer) return;
    renderRecords();
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeRecords() {
    const drawer = $('#recordsDrawer');
    const scrim = $('#scrim');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (scrim) scrim.hidden = true;
    document.body.style.overflow = '';
  }

  /* ─── Media interactions ─── */
  function syncPlayIcon() {
    const video = $('#previewVideo');
    const btn = $('#playToggle');
    if (!video || !btn) return;
    const playing = !video.paused;
    btn.classList.toggle('is-playing', playing);
    const playIcon = $('.icon-play', btn);
    const pauseIcon = $('.icon-pause', btn);
    if (playIcon) playIcon.hidden = playing;
    if (pauseIcon) pauseIcon.hidden = !playing;
    btn.setAttribute('aria-label', playing ? '暂停预览' : '播放预览');
  }

  function bindMedia() {
    const video = $('#previewVideo');
    const btn = $('#playToggle');
    const frame = $('#stageFrame');
    if (video) {
      video.addEventListener('play', syncPlayIcon);
      video.addEventListener('pause', syncPlayIcon);
    }
    if (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        if (!video || video.hidden) return;
        if (video.paused) video.play().catch(function () {});
        else video.pause();
      });
    }
    if (frame) {
      frame.addEventListener('click', function (event) {
        if (event.target.closest('button')) return;
        if (state.phase === 'rendering') return;
        if (!video || video.hidden) return;
        if (video.paused) video.play().catch(function () {});
        else video.pause();
      });
    }

    const strip = $('#strip');
    if (strip) {
      strip.addEventListener('click', function (event) {
        const remove = event.target.closest('.mat-remove');
        if (!remove) return;
        if (remove.dataset.bgm) { clearBgm(false); return; }
        const item = remove.closest('.mat');
        if (item) removeMaterial(item.dataset.id);
      });
    }

    const input = $('#fileInput');
    if (input) {
      input.addEventListener('change', function () {
        addFiles(input.files);
        input.value = '';
      });
    }
    const addButtons = [$('#btnAddFiles'), $('#btnEmptyPick')];
    addButtons.forEach(function (el) { if (el) el.addEventListener('click', function (e) { e.stopPropagation(); pickFiles(); }); });

    const stageBox = $('#stageBox');
    if (stageBox) {
      ['dragenter', 'dragover'].forEach(function (type) {
        stageBox.addEventListener(type, function (event) {
          event.preventDefault();
          event.stopPropagation();
          stageBox.classList.add('is-dragover');
        });
      });
      ['dragleave', 'dragend'].forEach(function (type) {
        stageBox.addEventListener(type, function (event) {
          if (event.target === stageBox) stageBox.classList.remove('is-dragover');
        });
      });
      stageBox.addEventListener('drop', function (event) {
        event.preventDefault();
        event.stopPropagation();
        stageBox.classList.remove('is-dragover');
        if (event.dataTransfer && event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
      });
      stageBox.addEventListener('click', function (event) {
        if (event.target.closest('button')) return;
        if (state.materials.length === 0) pickFiles();
      });
    }
  }

  function bindOverlays() {
    const records = $('#btnRecords');
    if (records) records.addEventListener('click', openRecords);
    const closeRecordsBtn = $('#btnCloseRecords');
    if (closeRecordsBtn) closeRecordsBtn.addEventListener('click', closeRecords);
    const scrim = $('#scrim');
    if (scrim) scrim.addEventListener('click', closeRecords);
    const clear = $('#btnClearRecords');
    if (clear) {
      clear.addEventListener('click', function () {
        try { localStorage.removeItem(RECORD_KEY); } catch (err) { /* ignore */ }
        updateRecordCount();
        renderRecords();
        toast('已清空生成记录');
      });
    }

    const payload = $('#btnPayload');
    if (payload) payload.addEventListener('click', openPayload);
    const modalScrim = $('#modalScrim');
    if (modalScrim) modalScrim.addEventListener('click', closePayload);
    const closePayloadBtn = $('#btnClosePayload');
    if (closePayloadBtn) closePayloadBtn.addEventListener('click', closePayload);
    const closePayloadBtn2 = $('#btnClosePayload2');
    if (closePayloadBtn2) closePayloadBtn2.addEventListener('click', closePayload);
    const copy = $('#btnCopyPayload');
    if (copy) {
      copy.addEventListener('click', function () {
        const code = $('#payloadCode');
        if (!code) return;
        copyText(code.textContent).then(function () {
          toast('请求参数已复制');
        }).catch(function () {
          toast('复制失败，请手动选择文本复制');
        });
      });
    }

    const generate = $('#btnGenerate');
    if (generate) generate.addEventListener('click', startGenerate);
    const cancel = $('#btnCancel');
    if (cancel) cancel.addEventListener('click', cancelGenerate);

    document.addEventListener('click', function (event) {
      const popover = $('#urlPopover');
      if (!popover || popover.hidden) return;
      if (popover.contains(event.target)) return;
      if (event.target.closest('#btnUrlAdd, #btnEmptyUrl')) return;
      closeUrlPopover();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      const modal = $('#payloadModal');
      const drawer = $('#recordsDrawer');
      const popover = $('#urlPopover');
      if (modal && !modal.hidden) { closePayload(); return; }
      if (drawer && drawer.classList.contains('is-open')) { closeRecords(); return; }
      if (popover && !popover.hidden) closeUrlPopover();
    });
  }

  function init() {
    restoreParams();
    bindParams();
    bindBgm();
    bindUrl();
    bindMedia();
    bindOverlays();
    updateRecordCount();
    syncAll();
    requestAnimationFrame(fitStage);

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(function () { fitStage(); });
      const box = $('#stageBox');
      if (box) observer.observe(box);
    }
    window.addEventListener('resize', fitStage);
    ['dragover', 'drop'].forEach(function (type) {
      document.addEventListener(type, function (event) {
        if (!event.target.closest('#stageBox')) event.preventDefault();
      });
    });
    window.addEventListener('beforeunload', function () {
      state.materials.forEach(function (m) {
        if (m.local && m.url) URL.revokeObjectURL(m.url);
      });
      if (state.bgm && state.bgm.url) URL.revokeObjectURL(state.bgm.url);
    });
  }

  init();
})();



