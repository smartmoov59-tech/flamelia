/* =========================================================
   FLAMELIA — animations & réservation (site statique, sans back-end)
   GSAP + ScrollTrigger + Lenis (fichiers locaux, aucun service externe)
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Constantes métier (à modifier ici si besoin) ---------- */
  const PHONE = '+33769751036';
  const PHONE_LABEL = '07 69 75 10 36';
  const ADDRESS = '20 rue Vallon de Farine, 04000 Digne-les-Bains';
  // Horaires : [ouverture, fermeture] en heures, par jour (0 = dimanche)
  const HOURS = { 0: [10, 19], 1: [14, 23], 2: [14, 23], 3: [14, 23], 4: [14, 23], 5: [14, 23], 6: [10, 19] };
  const SLOT_STEP = 30;      // minutes entre deux créneaux proposés
  const MIN_DURATION = 60;   // dernier départ = fermeture - 60 min
  const LEAD_MIN = 120;      // délai minimum avant un créneau le jour même (minutes)
  const DAYS_AHEAD = 14;     // nombre de jours proposés

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');

  if (reduce) root.classList.add('reduce');
  if (!window.gsap || !window.ScrollTrigger) { // sécurité : si les scripts n'ont pas chargé, on affiche tout
    root.classList.remove('is-loading');
    const l = $('#loader'); if (l) l.style.display = 'none';
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  /* ---------- Smooth scroll (Lenis) ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true, touchMultiplier: 1.3 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollStop = () => lenis && lenis.stop();
  const scrollStart = () => lenis && lenis.start();

  /* ---------- Split text (mots / lettres, accessible) ---------- */
  function splitText(el, mode) {
    if (el.dataset.splitDone) return $$('.c', el);
    const label = el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim();
    if (!el.hasAttribute('aria-label') && !el.closest('[aria-hidden="true"]')) el.setAttribute('aria-label', label);
    const chars = [];
    const walk = (node, parent) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { parent.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w'; w.setAttribute('aria-hidden', 'true');
            if (mode === 'chars') {
              Array.from(p).forEach((ch) => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); chars.push(c); });
            } else {
              const c = document.createElement('span'); c.className = 'c'; c.textContent = p; w.appendChild(c); chars.push(c);
            }
            parent.appendChild(w);
          });
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { parent.appendChild(n.cloneNode(false)); return; }
          const clone = n.cloneNode(false);
          parent.appendChild(clone);
          walk(n, clone);
        }
      });
    };
    const holder = document.createElement('div');
    walk(el, holder);
    el.textContent = '';
    while (holder.firstChild) el.appendChild(holder.firstChild);
    el.dataset.splitDone = '1';
    return $$('.c', el);
  }

  /* ---------- Heure de Paris & ouverture ---------- */
  function parisNow() {
    const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = {};
    f.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    const y = +p.year, m = +p.month, d = +p.day;
    const h = +p.hour % 24, mi = +p.minute;
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { y, m, d, h, mi, dow, minutes: h * 60 + mi };
  }
  function updateOpen() {
    const n = parisNow();
    const [o, c] = HOURS[n.dow];
    const open = n.minutes >= o * 60 && n.minutes < c * 60;
    let txt;
    if (open) txt = `Ouvert maintenant · jusqu'à ${c} h`;
    else if (n.minutes < o * 60) txt = `Fermé · ouvre à ${o} h`;
    else txt = `Fermé · rouvre demain à ${HOURS[(n.dow + 1) % 7][0]} h`;
    const chip = $('#openChip'), chipTxt = $('#openChipText'), box = $('#statusBox'), boxTxt = $('#statusText');
    if (chipTxt) chipTxt.textContent = txt;
    if (boxTxt) boxTxt.textContent = txt;
    [chip, box].forEach((e) => e && e.classList.toggle('is-closed', !open));
    $$('#hours tr').forEach((tr) => tr.classList.toggle('is-today', +tr.dataset.d === n.dow));
  }

  /* ---------- Bords en langues de feu (SVG généré) ---------- */
  function flamePath(w, h, n, seed) {
    let s = seed * 9301 + 7;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const seg = w / n;
    let d = `M0 ${h}`;
    for (let i = 0; i < n; i++) {
      const x0 = i * seg, tip = h * (0.06 + rnd() * 0.6), lean = (rnd() - 0.5) * seg * 0.55;
      d += ` C${x0 + seg * 0.34} ${h} ${x0 + seg * 0.22 + lean * 0.4} ${tip + (h - tip) * 0.5} ${x0 + seg * 0.5 + lean} ${tip}`;
      d += ` C${x0 + seg * 0.78 + lean * 0.3} ${tip + (h - tip) * 0.45} ${x0 + seg * 0.66} ${h} ${x0 + seg} ${h}`;
    }
    return d + ` V${h + 2} H0 Z`;
  }
  function buildEdges() {
    const w = Math.max(window.innerWidth, 320), h = 90, n = Math.max(7, Math.round(w / 78));
    $$('[data-flame-edge]').forEach((svg, i) => {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      $('path', svg).setAttribute('d', flamePath(w, h, n, i + 3));
    });
  }

  /* =========================================================
     INTRO : préchargeur -> hero
     ========================================================= */
  const hero = $('.hero');
  const heroVideo = $('#heroVideo');
  const heroChars = [];

  function prepHero() {
    // titre géant lettre par lettre
    $$('[data-split-chars]', hero).forEach((el) => { splitText(el, 'chars').forEach((c) => heroChars.push(c)); });
    // dégradé "flamme" lettre par lettre (évite background-clip sur éléments transformés)
    const fire = $('.hl--fire', hero);
    if (fire) {
      const cs = $$('.c', fire), stops = [[255, 74, 43], [255, 138, 61], [255, 197, 138]];
      cs.forEach((c, i) => {
        const t = cs.length > 1 ? i / (cs.length - 1) : 0, k = t * (stops.length - 1), a = Math.floor(k), b = Math.min(a + 1, stops.length - 1), f = k - a;
        const col = stops[a].map((v, j) => Math.round(v + (stops[b][j] - v) * f));
        c.style.color = `rgb(${col[0]},${col[1]},${col[2]})`;
      });
    }
    // sources vidéo selon l'écran
    const mobile = window.matchMedia('(max-width: 899px)').matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (heroVideo) {
      if (mobile) heroVideo.setAttribute('poster', heroVideo.dataset.posterMobile);
      if (!reduce && !saveData) {
        heroVideo.src = mobile ? heroVideo.dataset.srcMobile : heroVideo.dataset.srcDesktop;
        heroVideo.muted = true;
      }
    }
    if (reduce) return;
    gsap.set(heroChars, { yPercent: 118, rotate: 5 });
    gsap.set(['.hero__eyebrow', '.hero__lead', '.hero__cta > *', '.hero__foot > *'], { opacity: 0, y: 30 });
    gsap.set('#nav', { yPercent: -120 });
    gsap.set('.fnail', { opacity: 0, scale: 0.3 });
  }

  function introHero() {
    if (reduce) return;
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo(heroVideo, { scale: 1.34 }, { scale: 1.12, duration: 3, ease: 'power3.out' }, 0)
      .to(heroChars, { yPercent: 0, rotate: 0, duration: 1.5, stagger: 0.07 }, 0.15)
      .to('.hero__eyebrow', { opacity: 1, y: 0, duration: 1.1 }, 0.5)
      .to('.hero__lead', { opacity: 1, y: 0, duration: 1.2 }, 0.8)
      .to('.hero__cta > *', { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.95)
      .to('.hero__foot > *', { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 1.15)
      .to('.fnail', { opacity: 1, scale: 1, duration: 1.8, stagger: 0.12, ease: 'back.out(1.6)' }, 0.7)
      .to('#nav', { yPercent: 0, duration: 1.2 }, 1.1);
    // lente respiration de la vidéo (Ken Burns)
    gsap.to(heroVideo, { scale: 1.2, duration: 22, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 3 });
    // bobbing des ongles flottants
    $$('.fnail').forEach((n, i) => gsap.to(n, { rotation: '+=' + (i % 2 ? 9 : -9), duration: 3 + i * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  }

  function playHero() {
    if (!heroVideo || reduce || !heroVideo.src) return;
    const p = heroVideo.play();
    if (p && p.catch) p.catch(() => {});
    // ne lit la vidéo que lorsque le hero est visible (économie d'énergie)
    new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) heroVideo.play().catch(() => {}); else heroVideo.pause(); }), { threshold: 0.05 }).observe(hero);
  }

  async function runLoader() {
    const loader = $('#loader');
    const finish = () => { if (loader) loader.classList.add('is-done'); root.classList.remove('is-loading'); scrollStart(); };
    if (!loader || reduce) { finish(); playHero(); return; }
    scrollStop();
    window.scrollTo(0, 0);

    const num = $('#loaderNum'), rect = $('#fillrect'), line = $('#flameLine'), hole = $('#hole'), flameG = $('#loaderFlame');
    const letters = $$('.loader__word span');
    const len = line.getTotalLength();
    gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
    gsap.set(hole, { scale: 0, svgOrigin: '500 388' });
    gsap.set(letters, { yPercent: 115 });

    // on attend polices + affiche du hero (avec garde-fou)
    const posterReady = new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = 'assets/img/poster-hero.jpg'; });
    const ready = Promise.race([Promise.all([document.fonts ? document.fonts.ready : 0, posterReady]), wait(4500)]);

    const st = { p: 0 };
    await new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to(line, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, 0)
        .to(letters, { yPercent: 0, duration: 0.9, stagger: 0.055, ease: 'expo.out' }, 0.25)
        .to(st, { p: 100, duration: 2, ease: 'power2.inOut', onUpdate() { num.textContent = Math.round(st.p); rect.setAttribute('y', (140 - 144 * st.p / 100).toFixed(2)); } }, 0)
        .to(flameG, { scale: 1.02, svgOrigin: '500 388', duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 1.7);
    });
    await ready;

    await new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to('.loader__ui', { opacity: 0, y: -20, duration: 0.4, ease: 'power2.in' }, 0)
        .set(hole, { scale: 1 }, 0.35)
        .to(flameG, { opacity: 0, duration: 0.35, ease: 'power1.out' }, 0.4)
        .to(hole, { scale: 70, duration: 1.7, ease: 'power3.inOut' }, 0.42)
        .add(() => { playHero(); introHero(); }, 0.9);
    });
    finish();
    ScrollTrigger.refresh();
  }

  /* =========================================================
     NAVIGATION, MENU, PROGRESSION, ANCRES
     ========================================================= */
  const nav = $('#nav');
  const menu = $('#menu');
  const burger = $('#burger');
  let menuOpen = false;

  function setupNav() {
    let last = 0;
    const fab = $('#fab');
    let bookVisible = false;
    const bookEl = $('#reserver');
    if (bookEl && 'IntersectionObserver' in window) {
      new IntersectionObserver((es) => { bookVisible = es[0].isIntersecting; }, { threshold: 0.12 }).observe(bookEl);
    }
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate(self) {
        const y = self.scroll(), dy = y - last;
        if (!menuOpen) {
          if (y > 140 && dy > 3) nav.classList.add('is-hidden');
          else if (dy < -3 || y < 140) nav.classList.remove('is-hidden');
        }
        nav.classList.toggle('is-solid', y > 60);
        last = y;
        gsap.set('#progress', { scaleX: self.progress });
        if (fab) fab.classList.toggle('is-on', y > window.innerHeight * 0.55 && !bookVisible && !menuOpen);
      }
    });
  }

  function openMenu() {
    menuOpen = true;
    const r = burger.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rad = Math.hypot(window.innerWidth, window.innerHeight) + 40;
    burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Fermer le menu');
    menu.classList.add('is-open'); menu.setAttribute('aria-hidden', 'false');
    nav.classList.remove('is-hidden');
    scrollStop();
    gsap.fromTo(menu, { clipPath: `circle(0px at ${cx}px ${cy}px)` }, { clipPath: `circle(${rad}px at ${cx}px ${cy}px)`, duration: reduce ? 0.01 : 1.1, ease: 'expo.inOut' });
    gsap.fromTo('.menu__links a, .menu__foot', { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: reduce ? 0.01 : 1, ease: 'expo.out', stagger: 0.06, delay: reduce ? 0 : 0.35 });
    const first = $('.menu__links a'); if (first) setTimeout(() => first.focus({ preventScroll: true }), 400);
  }
  function closeMenu(instant) {
    if (!menuOpen) return;
    menuOpen = false;
    const r = burger.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rad = Math.hypot(window.innerWidth, window.innerHeight) + 40;
    burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Ouvrir le menu');
    gsap.fromTo(menu, { clipPath: `circle(${rad}px at ${cx}px ${cy}px)` }, {
      clipPath: `circle(0px at ${cx}px ${cy}px)`, duration: instant || reduce ? 0.01 : 0.8, ease: 'expo.inOut',
      onComplete() { menu.classList.remove('is-open'); menu.setAttribute('aria-hidden', 'true'); scrollStart(); }
    });
  }

  function scrollToTarget(target) {
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)) });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }

  function setupAnchors() {
    burger.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id.length < 2 && id !== '#top') return;
      const target = id === '#top' ? document.body : $(id);
      if (!target) return;
      e.preventDefault();
      if (a.dataset.pick) preselectService(a.dataset.pick);
      const go = () => (id === '#top' ? (lenis ? lenis.scrollTo(0, { duration: 2, easing: (t) => 1 - Math.pow(1 - t, 4) }) : window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })) : scrollToTarget(target));
      if (menuOpen) { closeMenu(); setTimeout(go, 500); } else go();
    });
  }

  /* =========================================================
     CURSEUR, BOUTONS MAGNÉTIQUES, TILT 3D
     ========================================================= */
  function setupCursor() {
    if (!finePointer || reduce) return;
    root.classList.add('has-cursor');
    const cur = $('#cursor'), dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('#cursorLabel');
    const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' }), dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.55, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: 0.55, ease: 'power3' });
    window.addEventListener('pointermove', (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); cur.style.opacity = 1; }, { passive: true });
    document.addEventListener('pointerleave', () => { cur.style.opacity = 0; });
    document.addEventListener('pointerover', (e) => {
      const lab = e.target.closest('[data-cursor]');
      if (lab) { label.textContent = lab.dataset.cursor; cur.classList.add('is-label'); cur.classList.remove('is-link'); return; }
      cur.classList.remove('is-label');
      cur.classList.toggle('is-link', !!e.target.closest('a,button,label,input,textarea,[data-tilt]'));
    });
    $$('.g__btn').forEach((b) => { b.dataset.cursor = 'Voir'; });
    const rs = $('#revStage'); if (rs) rs.dataset.cursor = 'Glisser';
  }

  function setupMagnetic() {
    if (!finePointer || reduce) return;
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        gsap.to(el, { x: (e.clientX - (r.left + r.width / 2)) * 0.3, y: (e.clientY - (r.top + r.height / 2)) * 0.4, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
      });
      el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1,.4)', overwrite: 'auto' }));
    });
  }

  function setupTilt() {
    if (!finePointer || reduce) return;
    $$('[data-tilt]').forEach((el) => {
      const isCard = el.classList.contains('panel--card');
      const max = isCard ? 6 : 9;
      const glare = $('.glare', el);
      const rX = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3' });
      const rY = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3' });
      gsap.set(el, { transformPerspective: 1000 });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        rY((px - 0.5) * 2 * max); rX(-(py - 0.5) * 2 * max);
        if (glare) gsap.to(glare, { x: px * r.width - glare.offsetWidth / 2, y: py * r.height - glare.offsetHeight / 2, duration: 0.4, ease: 'power3.out', overwrite: 'auto' });
      });
      el.addEventListener('pointerleave', () => { rX(0); rY(0); });
    });
  }

  /* =========================================================
     HERO : parallax multicouche, braises, ongles flottants
     ========================================================= */
  function setupHeroScroll() {
    if (reduce) return;
    const trg = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('[data-hero-media]', { yPercent: 12, ease: 'none', scrollTrigger: trg });
    gsap.to('[data-hero-content]', { yPercent: -18, opacity: 0.15, ease: 'none', scrollTrigger: trg });
    gsap.to('.hero__foot', { opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: '45% top', scrub: true } });
    $$('.fnail').forEach((n) => {
      const d = +n.dataset.depth || 1;
      gsap.to(n, { yPercent: -70 * d, ease: 'none', scrollTrigger: trg });
    });
    // parallax souris sur les ongles (plan intermédiaire)
    if (finePointer) {
      const q = $$('.fnail').map((n) => ({ d: +n.dataset.depth || 1, x: gsap.quickTo(n, 'x', { duration: 1.4, ease: 'power3' }), y: gsap.quickTo(n, 'y', { duration: 1.4, ease: 'power3' }) }));
      hero.addEventListener('pointermove', (e) => {
        const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
        q.forEach((o) => { o.x(nx * 70 * o.d); o.y(ny * 46 * o.d); });
      });
    }
  }

  function setupEmbers() {
    const cv = $('#embers');
    if (!cv || reduce) return;
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, parts = [], visible = true;
    // sprite de braise pré-rendu
    const spr = document.createElement('canvas'); spr.width = spr.height = 32;
    const sc = spr.getContext('2d'), g = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,230,190,1)'); g.addColorStop(0.25, 'rgba(255,138,61,.85)'); g.addColorStop(1, 'rgba(245,54,31,0)');
    sc.fillStyle = g; sc.fillRect(0, 0, 32, 32);
    const spawn = (init) => ({ x: Math.random() * W, y: init ? Math.random() * H : H + 20, s: 5 + Math.random() * 14, vy: 0.25 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.3, ph: Math.random() * 6.28, a: 0.25 + Math.random() * 0.6 });
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = window.innerWidth < 900 ? 22 : 52;
      parts = Array.from({ length: n }, () => spawn(true));
    };
    resize();
    window.addEventListener('resize', resize);
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(hero);
    gsap.ticker.add((t) => {
      if (!visible) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.y -= p.vy; p.x += p.vx + Math.sin(t * 0.8 + p.ph) * 0.25;
        if (p.y < -20) Object.assign(p, spawn(false));
        const fade = Math.min(1, (H - p.y) / (H * 0.2)) * Math.min(1, p.y / (H * 0.35) + 0.15);
        ctx.globalAlpha = Math.max(0, p.a * fade);
        ctx.drawImage(spr, p.x, p.y, p.s, p.s);
      }
      ctx.globalAlpha = 1;
    });
  }

  /* =========================================================
     MARQUEE (réagit à la vitesse et au sens du scroll)
     ========================================================= */
  function setupMarquee() {
    const rows = $$('.marquee__row').map((row) => {
      const track = $('.marquee__track', row);
      const base = track.innerHTML;
      const setW = track.scrollWidth + parseFloat(getComputedStyle(track).columnGap || 0);
      let guard = 0;
      while (track.scrollWidth < window.innerWidth * 2 + setW && guard++ < 8) track.insertAdjacentHTML('beforeend', base);
      return { track, dir: +row.dataset.dir || -1, x: 0, setW };
    });
    if (reduce) return;
    let boost = 0, scrollDir = 1;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate(self) {
        const v = self.getVelocity();
        boost = Math.min(Math.abs(v) / 1200, 6);
        if (Math.abs(v) > 30) scrollDir = v > 0 ? 1 : -1;
      }
    });
    gsap.ticker.add((time, dt) => {
      boost *= 0.94;
      const sec = dt / 1000;
      rows.forEach((r) => {
        r.x += r.dir * scrollDir * (55 + boost * 120) * sec;
        if (r.x <= -r.setW) r.x += r.setW;
        if (r.x >= 0) r.x -= r.setW;
        r.track.style.transform = `translate3d(${r.x.toFixed(2)}px,0,0)`;
      });
    });
  }

  /* =========================================================
     TITRES ET RÉVÉLATIONS GÉNÉRIQUES
     ========================================================= */
  function setupReveals() {
    // titres mot par mot (masque qui monte)
    $$('[data-split]').forEach((el) => {
      const chars = splitText(el, 'words');
      if (reduce) return;
      const inStory = el.closest('.story');
      gsap.set(chars, { yPercent: 118 });
      gsap.to(chars, {
        yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.08,
        scrollTrigger: { trigger: inStory ? '.story' : el, start: inStory ? 'top 55%' : 'top 86%', once: true }
      });
    });
    if (reduce) return;
    // éléments qui montent en fondu
    const sel = ['.eyebrow:not(.hero__eyebrow)', '.story__intro', '.gallery__lead', '.book__lead', '.phone-big', '.book__facts li', '.rating', '.link-u--lg', '.reviews__ctrl', '.find__card > *', '.footer__col', '.panel--cta > *'];
    $$(sel.join(',')).forEach((el) => {
      if (el.closest('.services__track') && !el.closest('.panel--cta')) return;
      if (el.closest('.panel--cta')) return; // déjà dans le défilement horizontal
      const inStory = el.closest('.story');
      gsap.from(el, { opacity: 0, y: 36, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: inStory ? '.story' : el, start: inStory ? 'top 55%' : 'top 90%', once: true } });
    });
    // carte "nous trouver" : rideau sur la carte
    const map = $('.find__map');
    if (map) gsap.fromTo(map, { clipPath: 'inset(0% 0% 100% 0% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: map, start: 'top 85%', once: true } });
    // footer : lettres géantes
    const fg = $('.footer__giant span');
    if (fg) {
      const cs = splitText(fg, 'chars');
      gsap.set(cs, { yPercent: 110 });
      let ready = false;
      gsap.to(cs, { yPercent: 0, duration: 1.5, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: '.footer__giant', start: 'top 92%', once: true }, onComplete() { ready = true; } });
      if (finePointer) {
        const box = $('.footer__giant');
        box.addEventListener('pointermove', (e) => {
          if (!ready) return;
          cs.forEach((c) => {
            const r = c.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)) / (r.width * 1.6);
            gsap.to(c, { yPercent: -14 * Math.max(0, 1 - d), duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
          });
        });
        box.addEventListener('pointerleave', () => gsap.to(cs, { yPercent: 0, duration: 1, ease: 'elastic.out(1,.5)', stagger: 0.03 }));
      }
    }
    // langues de feu : léger vacillement
    $$('[data-flame-edge]').forEach((e, i) => gsap.to(e, { scaleY: 0.78, transformOrigin: '50% 100%', duration: 1.4 + i * 0.35, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  }

  /* =========================================================
     SAVOIR-FAIRE : section pinnée (desktop) / empilée (mobile)
     ========================================================= */
  function setupStory(mm) {
    mm.add('(min-width: 900px)', () => {
      if (reduce) return;
      const steps = $$('.story .step'), imgs = $$('.arch__img'), n = steps.length;
      const cur = $('#storyCur'), bar = $('.story__progress span');
      gsap.set(steps, { autoAlpha: 0, y: 50 });
      gsap.set(steps[0], { autoAlpha: 1, y: 0 });
      gsap.set(imgs, { clipPath: 'inset(100% 0% 0% 0%)' });
      gsap.set(imgs[0], { clipPath: 'inset(0% 0% 0% 0%)' });
      $$('img', $('.arch')).forEach((im) => gsap.set(im, { scale: 1.3 }));
      let shown = 0;
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '.story__pin', start: 'top top', end: () => '+=' + Math.round(window.innerHeight * 0.9 * n),
          pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate(self) {
            const i = Math.min(n - 1, Math.floor(self.progress * n * 0.9999));
            if (i !== shown) { shown = i; cur.textContent = pad(i + 1); gsap.fromTo(cur, { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'expo.out' }); }
          }
        }
      });
      tl.to(bar, { scaleX: 1, duration: n }, 0);
      tl.to($('img', imgs[0]), { scale: 1.1, duration: 1 }, 0);
      for (let i = 1; i < n; i++) {
        const t = i - 0.12;
        tl.to(steps[i - 1], { autoAlpha: 0, y: -50, duration: 0.3, ease: 'power2.in' }, t)
          .to(steps[i], { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, t + 0.18)
          .to(imgs[i], { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.55, ease: 'power3.inOut' }, t)
          .to($('img', imgs[i]), { scale: 1.1, duration: 1.1 }, t);
      }
      tl.to({}, { duration: 0.12 }, n - 0.12 + 0.88);
      return () => { cur.textContent = '01'; };
    });
    mm.add('(max-width: 899px)', () => {
      if (reduce) return;
      $$('.story .step').forEach((s) => gsap.from(s, { opacity: 0, y: 50, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: s, start: 'top 88%', once: true } }));
    });
  }

  /* =========================================================
     PRESTATIONS : défilement horizontal piloté par le scroll
     ========================================================= */
  function setupServices(mm) {
    mm.add('(min-width: 900px)', () => {
      if (reduce) return;
      const track = $('#servicesTrack'), pin = $('.services__pin');
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: pin, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true }
      });
      $$('.panel--card').forEach((card) => {
        const img = $('img', card), num = $('.panel__num', card);
        const st = { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true };
        gsap.fromTo(img, { xPercent: 0 }, { xPercent: -23, ease: 'none', scrollTrigger: st });
        gsap.fromTo(num, { xPercent: 25 }, { xPercent: -25, ease: 'none', scrollTrigger: st });
        gsap.from(card, { opacity: 0.25, scale: 0.92, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 100%', end: 'left 62%', scrub: true } });
      });
      const ctaFlame = $('.panel__flame');
      if (ctaFlame) gsap.from(ctaFlame, { scale: 0.3, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.panel--cta', containerAnimation: tween, start: 'left 95%', end: 'left 55%', scrub: true } });
      const chars = $$('.panel--intro .c');
      if (chars.length) { gsap.set(chars, { yPercent: 118 }); gsap.to(chars, { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.07, scrollTrigger: { trigger: pin, start: 'top 75%', once: true } }); }
    });
    mm.add('(max-width: 899px)', () => {
      if (reduce) return;
      $$('.services .panel').forEach((p) => gsap.from(p, { opacity: 0, y: 60, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: p, start: 'top 90%', once: true } }));
    });
  }

  /* =========================================================
     CHIFFRES CLÉS (compteurs)
     ========================================================= */
  function setupStats() {
    const fmt = (v, dec) => v.toFixed(dec).replace('.', ',');
    $$('[data-stat]').forEach((stat, i) => {
      const el = $('[data-count]', stat);
      const target = parseFloat(el.dataset.count), dec = +(el.dataset.decimals || 0);
      if (reduce) { stat.classList.add('is-in'); return; }
      el.textContent = fmt(0, dec);
      const o = { v: 0 };
      ScrollTrigger.create({
        trigger: stat, start: 'top 88%', once: true,
        onEnter() {
          stat.classList.add('is-in');
          gsap.to(o, { v: target, duration: 2.4, delay: i * 0.12, ease: 'power3.out', onUpdate() { el.textContent = fmt(o.v, dec); } });
          gsap.from($('.stat__num', stat), { yPercent: 18, opacity: 0, duration: 1.3, delay: i * 0.12, ease: 'expo.out' });
        }
      });
    });
  }

  /* =========================================================
     GALERIE : parallax de colonnes, révélation en cercle, lightbox
     ========================================================= */
  function setupGallery(mm) {
    const figs = $$('.g');
    if (!reduce) {
      figs.forEach((f) => {
        const mask = $('.g__mask', f), img = $('img', f);
        gsap.fromTo(mask, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(78% at 50% 50%)', duration: 1.7, ease: 'expo.out', scrollTrigger: { trigger: f, start: 'top 90%', once: true } });
        gsap.from(img, { scale: 1.45, duration: 2, ease: 'expo.out', scrollTrigger: { trigger: f, start: 'top 90%', once: true } });
        gsap.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: f, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
      mm.add('(min-width: 900px)', () => {
        $$('.gcol').forEach((col) => {
          const s = parseFloat(col.dataset.speed || 0);
          gsap.fromTo(col, { yPercent: s * 7 }, { yPercent: -s * 7, ease: 'none', scrollTrigger: { trigger: '.gallery__cols', start: 'top bottom', end: 'bottom top', scrub: true } });
        });
      });
    }

    // lightbox
    const lb = $('#lightbox'), lbImg = $('#lbImg'), lbCap = $('#lbCap');
    const items = $$('.g__btn');
    let idx = 0, lastFocus = null;
    const show = (i) => {
      idx = (i + items.length) % items.length;
      const b = items[idx];
      lbImg.src = b.dataset.full; lbImg.alt = $('img', b).alt; lbCap.textContent = b.dataset.cap || '';
    };
    const open = (i) => {
      lastFocus = document.activeElement; show(i);
      lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); scrollStop();
      setTimeout(() => $('#lbClose').focus({ preventScroll: true }), 50);
    };
    const close = () => {
      lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); scrollStart();
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    };
    items.forEach((b, i) => b.addEventListener('click', () => open(i)));
    $('#lbClose').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', () => show(idx - 1));
    $('#lbNext').addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'Tab') { // piège à focus
        const f = $$('button', lb), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* =========================================================
     AVIS : carrousel (glisser, flèches, clavier, autoplay)
     ========================================================= */
  function setupReviews() {
    const stage = $('#revStage'), track = $('#revTrack');
    if (!stage || !track) return;
    const cards = $$('.rev', track), count = $('#revCount'), bar = $('#revBar');
    const N = cards.length, DUR = 7;
    let i = 0, barTween = null, hovering = false, dragging = false;
    stage.setAttribute('tabindex', '0');
    const step = () => cards[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 24);
    const maxX = () => Math.max(0, track.scrollWidth - stage.clientWidth);
    const xFor = (k) => -Math.min(k * step(), maxX());

    function mark() {
      cards.forEach((c, k) => { c.style.opacity = k === i ? '1' : '0.5'; c.style.transform = k === i ? 'scale(1)' : 'scale(.95)'; });
      count.textContent = `${pad(i + 1)} / ${pad(N)}`;
    }
    function startBar() {
      if (reduce) return;
      if (barTween) barTween.kill();
      gsap.set(bar, { scaleX: 0 });
      barTween = gsap.to(bar, { scaleX: 1, duration: DUR, ease: 'none', onComplete: () => go(i + 1) });
      if (hovering || dragging) barTween.pause();
    }
    function go(k, instant) {
      i = (k + N) % N;
      gsap.to(track, { x: xFor(i), duration: instant || reduce ? 0.01 : 1.2, ease: 'expo.out', overwrite: true });
      mark(); startBar();
    }
    $('#revNext').addEventListener('click', () => go(i + 1));
    $('#revPrev').addEventListener('click', () => go(i - 1));
    stage.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); } });
    ['pointerenter', 'focusin'].forEach((ev) => stage.addEventListener(ev, () => { hovering = true; barTween && barTween.pause(); }));
    ['pointerleave', 'focusout'].forEach((ev) => stage.addEventListener(ev, () => { hovering = false; if (!dragging && barTween) barTween.resume(); }));

    // glisser avec la souris / le doigt
    let sx = 0, sy = 0, startTrackX = 0, moved = false, pid = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a,button')) return;
      sx = e.clientX; sy = e.clientY; startTrackX = gsap.getProperty(track, 'x'); moved = false; pid = e.pointerId; dragging = true;
      barTween && barTween.pause();
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pid) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 6) moved = true;
      if (moved) gsap.set(track, { x: startTrackX + dx });
    });
    const end = (e) => {
      if (!dragging || e.pointerId !== pid) return;
      dragging = false;
      const dx = e.clientX - sx;
      if (moved && dx < -60) go(i + 1);
      else if (moved && dx > 60) go(i - 1);
      else go(i);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => go(i, true));
    go(0, true);
    if (!reduce) {
      ScrollTrigger.create({ trigger: stage, start: 'top 85%', end: 'bottom 10%', onToggle: (s) => { if (barTween) (s.isActive && !hovering ? barTween.resume() : barTween.pause()); } });
    }
  }

  /* =========================================================
     RÉSERVATION (sans back-end : SMS pré-rempli, appel, .ics)
     ========================================================= */
  const DAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const COLOURS = [
    ['Rouge flamme', '#F5361F'], ['Rose poudré', '#F2B8C0'], ['Nude', '#D9A98F'], ['Bordeaux', '#6E1230'],
    ['Noir', '#17100F'], ['Blanc nacré', '#F4EFE9'], ['Lilas', '#B9A5E0'], ['Or doré', '#D8A24A']
  ];
  const SHAPES = ['Amande', 'Ovale', 'Carrée', 'Ballerine'];

  let preselectService = () => {};

  function setupBooking() {
    const form = $('#bookForm');
    if (!form) return;
    const steps = $$('[data-bstep]', form), stepper = $$('#stepper li');
    const back = $('#bBack'), next = $('#bNext'), err = $('#formError');
    const daysEl = $('#days'), timesEl = $('#times'), hint = $('#slotHint');
    const st = { service: '', date: null, time: '', colour: null, shape: null, note: '', name: '' };
    let cur = 1;

    /* jours */
    const now = parisNow();
    const todayUTC = Date.UTC(now.y, now.m - 1, now.d);
    function slotsFor(dateObj, isToday) {
      const [o, c] = HOURS[dateObj.dow];
      const out = [];
      for (let t = o * 60; t <= c * 60 - MIN_DURATION; t += SLOT_STEP) {
        if (isToday && t < now.minutes + LEAD_MIN) continue;
        out.push(t);
      }
      return out;
    }
    const days = [];
    for (let k = 0; k < DAYS_AHEAD; k++) {
      const dt = new Date(todayUTC + k * 86400000);
      const o = { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay(), k };
      o.iso = `${o.y}-${pad(o.m)}-${pad(o.d)}`;
      o.slots = slotsFor(o, k === 0);
      if (o.slots.length) days.push(o);
    }
    daysEl.innerHTML = days.map((o) => `<label class="day"><input type="radio" name="day" value="${o.iso}"><span><small>${o.k === 0 ? 'auj.' : DAYS_SHORT[o.dow]}</small><b>${o.d}</b><em>${MONTHS_SHORT[o.m - 1]}</em></span></label>`).join('');
    daysEl.addEventListener('change', (e) => {
      const o = days.find((x) => x.iso === e.target.value);
      if (!o) return;
      st.date = o; st.time = '';
      const [op, cl] = HOURS[o.dow];
      hint.textContent = `${DAYS_LONG[o.dow][0].toUpperCase() + DAYS_LONG[o.dow].slice(1)} : ouvert de ${op} h à ${cl} h. Choisissez l'heure d'arrivée souhaitée.`;
      timesEl.innerHTML = o.slots.map((t) => { const v = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; return `<label class="time"><input type="radio" name="time" value="${v}"><span>${v.replace(':', 'h')}</span></label>`; }).join('');
      if (!reduce) gsap.from(timesEl.children, { opacity: 0, y: 14, duration: 0.6, ease: 'expo.out', stagger: 0.025 });
      clearError();
    });
    timesEl.addEventListener('change', (e) => { st.time = e.target.value; clearError(); });

    /* service */
    form.addEventListener('change', (e) => { if (e.target.name === 'service') { st.service = e.target.value; clearError(); } });
    preselectService = (v) => {
      const inp = $$('input[name="service"]', form).find((x) => x.value === v);
      if (inp) { inp.checked = true; st.service = v; if (cur !== 1) show(1, -1); }
    };

    /* envie : teinte + forme */
    const prev = $('#nailPrev');
    $('#swatches').innerHTML = COLOURS.map((c, i) => `<label class="sw" title="${c[0]}"><input type="radio" name="colour" value="${i}" aria-label="${c[0]}"><span style="--c:${c[1]}"></span></label>`).join('');
    $('#shapes').innerHTML = SHAPES.map((s) => `<label class="shp"><input type="radio" name="shape" value="${s}"><span>${s}</span></label>`).join('');
    $('#swatches').addEventListener('change', (e) => { const c = COLOURS[+e.target.value]; st.colour = { name: c[0], hex: c[1] }; prev.style.setProperty('--polish', c[1]); if (!reduce) gsap.fromTo($$('.pn', prev), { y: 6 }, { y: 0, duration: 0.7, ease: 'elastic.out(1,.5)', stagger: 0.05 }); });
    $('#shapes').addEventListener('change', (e) => { st.shape = e.target.value; prev.dataset.shape = e.target.value; });
    $('#note').addEventListener('input', (e) => { st.note = e.target.value; });

    /* message / recap */
    function message() {
      const o = st.date;
      const what = st.service === 'Je ne sais pas encore' ? 'un rendez-vous (je ne sais pas encore quelle prestation)' : st.service;
      let m = `Bonjour Flamelia, c'est ${st.name.trim() || '…'}. Je souhaite réserver : ${what}, le ${DAYS_LONG[o.dow]} ${o.d} ${MONTHS_LONG[o.m - 1]} à ${st.time.replace(':', 'h')}.`;
      const e = [];
      if (st.colour) e.push(`teinte ${st.colour.name.toLowerCase()}`);
      if (st.shape) e.push(`forme ${st.shape.toLowerCase()}`);
      if (e.length) m += ` Mon envie : ${e.join(', ')}.`;
      if (st.note.trim()) m += ` ${st.note.trim()}`;
      return m + ' Pouvez-vous me confirmer le créneau ? Merci !';
    }
    const sms = $('#sendSms');
    function refresh4() {
      const o = st.date;
      $('#recap').innerHTML =
        `<p><b>${st.service}</b></p>` +
        `<p>${DAYS_LONG[o.dow]} ${o.d} ${MONTHS_LONG[o.m - 1]} à <b>${st.time.replace(':', 'h')}</b></p>` +
        (st.colour || st.shape ? `<p>Envie : ${[st.colour && st.colour.name, st.shape && 'forme ' + st.shape.toLowerCase()].filter(Boolean).join(' · ')}</p>` : '') +
        `<p class="msg">« ${message().replace(/</g, '&lt;')} »</p>`;
      sms.href = `sms:${PHONE}?&body=${encodeURIComponent(message())}`;
    }
    $('#firstname').addEventListener('input', (e) => { st.name = e.target.value; clearError(); if (cur === 4) refresh4(); });

    /* validation */
    function showError(msg) { err.textContent = msg; err.hidden = false; if (!reduce) gsap.fromTo(err, { x: -8 }, { x: 0, duration: 0.8, ease: 'elastic.out(1,.3)' }); }
    function clearError() { err.hidden = true; }
    function valid(n) {
      if (n === 1 && !st.service) { showError('Choisissez une prestation pour continuer.'); return false; }
      if (n === 2 && !st.date) { showError('Choisissez un jour.'); return false; }
      if (n === 2 && !st.time) { showError('Choisissez une heure.'); return false; }
      if (n === 4 && st.name.trim().length < 2) { showError('Indiquez votre prénom : il sera dans le message.'); $('#firstname').focus(); return false; }
      clearError(); return true;
    }

    /* navigation entre étapes */
    function show(n, dir) {
      if (n === cur) return;
      const from = steps[cur - 1], to = steps[n - 1];
      cur = n;
      stepper.forEach((li, k) => { li.classList.toggle('is-on', k === n - 1); li.classList.toggle('is-done', k < n - 1); });
      back.hidden = n === 1;
      next.hidden = n === 4;
      if (n === 4) refresh4();
      const swap = () => {
        from.hidden = true; to.hidden = false;
        if (!reduce) gsap.fromTo(to, { opacity: 0, x: 40 * dir }, { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out' });
        const lg = $('legend', to); if (lg) { lg.tabIndex = -1; lg.focus({ preventScroll: true }); }
      };
      if (reduce) swap(); else gsap.to(from, { opacity: 0, x: -30 * dir, duration: 0.25, ease: 'power2.in', onComplete: swap });
    }
    next.addEventListener('click', () => { if (valid(cur)) show(cur + 1, 1); });
    back.addEventListener('click', () => { clearError(); show(cur - 1, -1); });
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') { e.preventDefault(); if (cur < 4 && valid(cur)) show(cur + 1, 1); } });

    /* actions finales */
    sms.addEventListener('click', (e) => { if (!valid(4)) e.preventDefault(); });
    $('#copyMsg').addEventListener('click', async () => {
      if (!valid(4)) return;
      const txt = message(), lab = $('#copyMsgText');
      try { await navigator.clipboard.writeText(txt); }
      catch (_) { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (__) {} ta.remove(); }
      lab.textContent = 'Message copié ✓'; setTimeout(() => { lab.textContent = 'Copier le message'; }, 2200);
    });
    $('#dlIcs').addEventListener('click', () => {
      if (!valid(4)) return;
      const o = st.date, [h, mi] = st.time.split(':').map(Number);
      const start = new Date(Date.UTC(o.y, o.m - 1, o.d, h, mi)), end = new Date(start.getTime() + 60 * 60000);
      const f = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flamelia//Reservation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT', `UID:${Date.now()}@flamelia`, `DTSTAMP:${stamp}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
        `SUMMARY:Flamelia - ${st.service} (a confirmer)`, `LOCATION:Flamelia\\, ${ADDRESS.replace(/,/g, '\\,')}`,
        `DESCRIPTION:Demande de rendez-vous envoyee a Flamelia (${PHONE_LABEL}). Creneau a confirmer par Flamelia.`,
        'STATUS:TENTATIVE', 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Rendez-vous Flamelia', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'
      ];
      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'flamelia-rendez-vous.ics';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  /* =========================================================
     BORDS, DIVERS, DÉMARRAGE
     ========================================================= */
  function init() {
    buildEdges();
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(buildEdges, 200); });
    updateOpen(); setInterval(updateOpen, 60000);

    prepHero();
    setupNav();
    setupAnchors();
    setupCursor();
    setupHeroScroll();
    setupEmbers();

    const mm = gsap.matchMedia();
    setupStory(mm);       // créés dans l'ordre de la page (pins avant le reste)
    setupServices(mm);
    setupMarquee();
    setupStats();
    setupGallery(mm);
    setupReveals();
    setupReviews();
    setupBooking();
    setupMagnetic();
    setupTilt();

    window.addEventListener('load', () => ScrollTrigger.refresh());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
    runLoader();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
