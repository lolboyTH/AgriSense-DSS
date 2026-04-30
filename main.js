// ── Supabase Client ──────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(
  'https://rbtydbqysqvrhaevxprd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHlkYnF5c3F2cmhhZXZ4cHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTEzMDEsImV4cCI6MjA5MzEyNzMwMX0.U3qC9459jvLToUMl2TlzmSjxCLzeWYIvxloCJS5Ojsg'
);

let currentUser  = null;
let currentTab   = 'location';
let tooltipDismissed = false;

// ── Auth Functions ───────────────────────────────────────
async function signIn() {
  const email    = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) showAuthError(error.message);
}

async function signUp() {
  const email    = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const { error } = await sb.auth.signUp({ email, password });
  if (error) showAuthError(error.message);
  else showAuthError('✅ ตรวจสอบอีเมลเพื่อยืนยัน');
}

async function magicLink() {
  const email = document.getElementById('authEmail').value;
  if (!email) { showAuthError('กรุณากรอกอีเมล'); return; }
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) showAuthError(error.message);
  else showAuthError('✅ ส่ง Magic Link ไปที่อีเมลแล้ว');
}

async function signOut() {
  await sb.auth.signOut();
}

function showAuthError(msg) {
  document.getElementById('authError').textContent = msg;
}

// ── Auth View Transitions ──────────────────────────────
let currentView = 'viewLogin';

function goToView(nextId) {
  const current = document.getElementById(currentView);
  const next    = document.getElementById(nextId);

  // Clear errors
  ['loginError','signupError','magicError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });

  current.classList.remove('active');
  current.classList.add('exit-left');

  next.classList.remove('exit-left');
  next.style.opacity = '0';
  next.style.transform = 'translateX(30px)';
  next.style.position = 'absolute';
  next.style.top = '0'; next.style.left = '0';
  next.style.padding = '32px 28px';
  next.style.pointerEvents = 'none';

  // Force reflow
  void next.offsetWidth;

  // Make next active
  next.classList.add('active');
  next.style.opacity = '';
  next.style.transform = '';
  next.style.position = '';
  next.style.top = '';
  next.style.left = '';
  next.style.padding = '';
  next.style.pointerEvents = '';

  // Cleanup current after transition
  setTimeout(() => {
    current.classList.remove('exit-left');
  }, 350);

  currentView = nextId;
}

async function handleSignIn() {
  const email    = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.querySelector('#viewLogin button');
  btn.textContent = 'กำลังเข้าสู่ระบบ…';
  btn.classList.add('loading');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.textContent = 'เข้าสู่ระบบ';
  btn.classList.remove('loading');
  if (error) {
    document.getElementById('loginError').textContent = error.message;
  }
}

async function handleSignUp() {
  const email    = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const btn = document.querySelector('#viewSignup button');
  btn.textContent = 'กำลังสมัคร…';
  btn.classList.add('loading');
  const { error } = await sb.auth.signUp({ email, password });
  btn.textContent = 'สมัครสมาชิก';
  btn.classList.remove('loading');
  if (error) {
    document.getElementById('signupError').textContent = error.message;
  } else {
    document.getElementById('successIcon').textContent = '✅';
    document.getElementById('successTitle').textContent = 'สมัครสมาชิกสำเร็จ';
    document.getElementById('successMsg').innerHTML = 'ส่งอีเมลยืนยันไปแล้ว<br>กรุณาตรวจสอบกล่องจดหมาย';
    goToView('viewSuccess');
  }
}

async function handleMagicLink() {
  const email = document.getElementById('magicEmail').value;
  if (!email) {
    document.getElementById('magicError').textContent = 'กรุณากรอกอีเมล';
    return;
  }
  const btn = document.querySelector('#viewMagic button');
  btn.textContent = 'กำลังส่ง…';
  btn.classList.add('loading');
  const { error } = await sb.auth.signInWithOtp({ email });
  btn.textContent = 'ส่ง Magic Link';
  btn.classList.remove('loading');
  if (error) {
    document.getElementById('magicError').textContent = error.message;
  } else {
    document.getElementById('successIcon').textContent = '✉️';
    document.getElementById('successTitle').textContent = 'ตรวจสอบอีเมล';
    document.getElementById('successMsg').innerHTML = `ส่ง Magic Link ไปที่<br><strong>${email}</strong><br>แล้ว กรุณาตรวจสอบกล่องจดหมาย`;
    goToView('viewSuccess');
  }
}

/*Heatmap data: province id → level ปลอม**** */
const heatmapData = {
  'prov-loei':         'high',
  'prov-nbp':          'mid',
  'prov-udon':         'high',
  'prov-nongkhai':     'low',
  'prov-buengkan':     'mid',
  'prov-sakon':        'high',
  'prov-nakhonphanom': 'mid',
  'prov-kalasin':      'high',
  'prov-mahasarakham': 'high',
  'prov-roiet':        'mid',
  'prov-mukdahan':     'low',
  'prov-korat':        'high',
  'prov-chaiyaphum':   'high',
  'prov-buriram':      'mid',
  'prov-surin':        'high',
  'prov-sisaket':      'mid',
  'prov-ubon':         'low',
  'prov-yasothon':     'high',
  'prov-amnat':        'mid',
};

/*Tab switching*/
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('btn-location').classList.toggle('active', tab === 'location');
  document.getElementById('btn-heatmap').classList.toggle('active', tab === 'heatmap');

  const legend = document.getElementById('heatmapLegend');

  if (tab === 'heatmap') {
    applyHeatmap();
    legend.classList.add('visible');
  } else {
    removeHeatmap();
    legend.classList.remove('visible');
  }
}

function applyHeatmap() {
  Object.entries(heatmapData).forEach(([id, level]) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('selected');
      el.classList.add(`heatmap-${level}`);
    }
  });
}

function removeHeatmap() {
  document.querySelectorAll('.province').forEach(el => {
    el.classList.remove('heatmap-high', 'heatmap-mid', 'heatmap-low');
  });
}

/*Map click handler*/
function handleMapClick(e) {
  const tooltip = document.getElementById('mapTooltip');

  if (!tooltipDismissed) {
    tooltip.style.display = 'none';
    tooltipDismissed = true;
  }

  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  /* Find clicked province */
  let clickedProvince = null;
  const el = e.target.closest('.province');
  if (el) {
    clickedProvince = { name: el.dataset.name, en: el.dataset.en, id: el.id };
    if (currentTab === 'location') {
      document.querySelectorAll('.province').forEach(p => p.classList.remove('selected'));
      el.classList.add('selected');
    }
  }

  /* Pulse effect */
  triggerPulse(x, y);

  /* Random coordinates near Isan region */
  const lat = (15.5 + Math.random() * 3.5).toFixed(4);
  const lng = (102.0 + Math.random() * 3.5).toFixed(4);

  showLoading();
  setTimeout(() => showResults(lat, lng, clickedProvince), 1200);
}

/*Pulse animation*/
function triggerPulse(x, y) {
  const dot  = document.getElementById('pulseDot');
  const ring = document.getElementById('pulseRing');

  dot.style.left  = x + 'px';
  dot.style.top   = y + 'px';
  ring.style.left = x + 'px';
  ring.style.top  = y + 'px';

  dot.style.display  = 'block';
  ring.style.display = 'none';
  ring.style.animation = 'none';
  void ring.offsetWidth; /* reflow to restart animation */
  ring.style.display   = 'block';
  ring.style.animation = 'pulse-ring 0.8s ease-out forwards';

  setTimeout(() => {
    dot.style.display  = 'none';
    ring.style.display = 'none';
  }, 900);
}

/*Panel state helpers*/
function showLoading() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('loadingState').classList.add('visible');
  document.getElementById('analysisResults').classList.remove('visible');
}

/*Build & render analysis results*/
function showResults(lat, lng, province) {
  document.getElementById('loadingState').classList.remove('visible');

  const results = document.getElementById('analysisResults');
  results.classList.add('visible');

  /*Randomised soil data*/
  const ph       = (5.8 + Math.random() * 1.8).toFixed(1);
  const moisture = Math.floor(30 + Math.random() * 40);
  const nitrogen = Math.floor(20 + Math.random() * 60);
  const organic  = (1.2 + Math.random() * 2.5).toFixed(1);

  const phPercent       = Math.round((ph / 14) * 100);
  const nitrogenPercent = Math.round(nitrogen);

  const provName = province ? province.name : 'ไม่ระบุ';

  /*Crop pools*/
  const cropPoolNormal = parseFloat(ph) > 6.5
    ? [
        { emoji: '🌾', name: 'ข้าวหอมมะลิ', suit: 'เหมาะสมมาก', level: 'high' },
        { emoji: '🌽', name: 'ข้าวโพดหวาน', suit: 'เหมาะสมมาก', level: 'high' },
        { emoji: '🥜', name: 'ถั่วเหลือง',   suit: 'เหมาะสมมาก', level: 'high' },
      ]
    : [
        { emoji: '🌾', name: 'ข้าวเหนียว',  suit: 'เหมาะสมมาก', level: 'high' },
        { emoji: '🌾', name: 'ข้าวนาปี',    suit: 'เหมาะสมมาก', level: 'high' },
        { emoji: '🌾', name: 'ข้าวนาปรัง',  suit: 'เหมาะสมมาก', level: 'high' },
      ];

  const cropPoolWarm = [
    { emoji: '🥔', name: 'มันสำปะหลัง', suit: 'เหมาะสมมาก', level: 'high' },
    { emoji: '🌾', name: 'ข้าว',         suit: 'เหมาะสมมาก', level: 'high' },
    { emoji: '🎋', name: 'อ้อย',         suit: 'เหมาะสมมาก', level: 'high' },
  ];

  /*Helper: render crop row*/
  const cropRow = (c, i, delayBase) => `
    <div class="crop-item" style="animation-delay:${delayBase + i * 0.07}s">
      <div style="width:22px;text-align:center;font-size:12px;color:var(--text-muted);
                  font-family:'Space Mono',monospace;flex-shrink:0">${i + 1}</div>
      <div class="crop-emoji">${c.emoji}</div>
      <div class="crop-info"><div class="crop-name">${c.name}</div></div>
      <div class="suit-tag ${c.level}">${c.suit}</div>
    </div>`;

  /*Inject HTML*/
  results.innerHTML = `
    <div class="location-badge">
      <div class="loc-icon">📍</div>
      <div class="loc-info">
        <h4>Coordinate</h4>
        <p>${lat}°, ${lng}°</p>
      </div>
    </div>

    <div class="section-label" style="margin-top:4px">ผลวิเคราะห์ดิน</div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">ค่า pH</div>
        <div class="metric-value">${ph}</div>
        <div class="metric-unit">กรด–เบส</div>
        <div class="metric-bar-wrap">
          <div class="metric-bar"
               style="width:${phPercent}%;
                      background:${parseFloat(ph) > 6.5 ? '#8fc87a' : '#e09a50'}">
          </div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">ความชื้น</div>
        <div class="metric-value">${moisture}</div>
        <div class="metric-unit">เปอร์เซ็นต์ (%)</div>
        <div class="metric-bar-wrap">
          <div class="metric-bar"
               style="width:${moisture}%;
                      background:${moisture > 50 ? '#8fc87a' : '#e09a50'}">
          </div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">ไนโตรเจน</div>
        <div class="metric-value">${nitrogen}</div>
        <div class="metric-unit">mg/kg</div>
        <div class="metric-bar-wrap">
          <div class="metric-bar"
               style="width:${nitrogenPercent}%;
                      background:${nitrogen > 40 ? '#8fc87a' : '#e09a50'}">
          </div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">อินทรียวัตถุ</div>
        <div class="metric-value">${organic}</div>
        <div class="metric-unit">เปอร์เซ็นต์ (%)</div>
        <div class="metric-bar-wrap">
          <div class="metric-bar" style="width:${Math.round(organic / 5 * 100)}%"></div>
        </div>
      </div>
    </div>

    <div class="section-label">
      <span class="scenario-badge">☀️ พืชแนะนำ (ปัจจุบัน)</span>
    </div>
    <div class="crop-list">
      ${cropPoolNormal.map((c, i) => cropRow(c, i, 0.10)).join('')}
    </div>

    <div class="section-label" style="margin-top:8px">
      <span class="scenario-badge warm">🌡️ พืชแนะนำ (อุณหภูมิเพิ่มขึ้น +2°C)</span>
    </div>
    <div class="crop-list">
      ${cropPoolWarm.map((c, i) => cropRow(c, i, 0.35)).join('')}
    </div>
  `;

  /*Animate metric bars*/
  setTimeout(() => {
    results.querySelectorAll('.metric-bar').forEach(bar => {
      const targetWidth = bar.style.width;
      bar.style.width = '0%';
      setTimeout(() => { bar.style.width = targetWidth; }, 50);
    });
  }, 50);
}

/*Init*/
document.addEventListener('DOMContentLoaded', () => {
  sb.auth.onAuthStateChange((event, session) => {
    if (session) {
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('logoutBtn').style.display = 'block';
      currentUser = session.user;
    } else {
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('logoutBtn').style.display = 'none';
    }
  });

  const tooltip = document.getElementById('mapTooltip');
  tooltip.style.display = 'block';
  tooltip.classList.add('visible');
});