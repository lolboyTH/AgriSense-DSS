// ── Supabase Client ──────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(
  'https://rbtydbqysqvrhaevxprd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHlkYnF5c3F2cmhhZXZ4cHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTEzMDEsImV4cCI6MjA5MzEyNzMwMX0.U3qC9459jvLToUMl2TlzmSjxCLzeWYIvxloCJS5Ojsg'
);

let currentUser  = null;
let currentTab   = 'location';
let tooltipDismissed = false;

// ── WebGIS Map Variables ─────────────────────────────────
let map;
let currentOverlay;
const koratBounds = [[14.116667, 101.183333], [15.808333, 103.016667]];

function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).fitBounds(koratBounds);

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
  }).addTo(map);

  updateMapOverlay();

  map.on('click', handleLeafletClick);
}

function findMyLocation() {
  const gpsBtn = document.getElementById('gpsBtn');
  const originalText = gpsBtn.innerHTML;
  gpsBtn.innerHTML = '⏳';

  if (!navigator.geolocation) {
    alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง (Geolocation is not supported)");
    gpsBtn.innerHTML = originalText;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      gpsBtn.innerHTML = originalText;
      
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      // Move map
      map.flyTo([lat, lng], 14, { duration: 1.5 });
      
      // Wait for flyTo to finish before analyzing
      setTimeout(() => {
          const containerPoint = map.latLngToContainerPoint([lat, lng]);
          triggerPulse(containerPoint.x, containerPoint.y);
          showLoading();
          
          // Add a small marker for GPS location
          L.circleMarker([lat, lng], { radius: 6, color: '#c85a3a', fillColor: '#fca5a5', fillOpacity: 1 }).addTo(map);
          
          // Run analysis
          showResults(lat.toFixed(6), lng.toFixed(6));
      }, 1600);
    },
    (error) => {
      gpsBtn.innerHTML = originalText;
      alert("ไม่สามารถเข้าถึงตำแหน่งของคุณได้ กรุณาอนุญาตสิทธิ์ Location ในเบราว์เซอร์ (Please allow Location access)");
      console.error(error);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/* Search Location via Nominatim */
async function searchLocation() {
  const input = document.getElementById('searchInput');
  const query = input.value.trim();
  if (!query) return;

  input.disabled = true;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=th`);
    const data = await res.json();

    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      map.flyTo([lat, lng], 13, { duration: 1.5 });
      input.value = data[0].display_name.split(',').slice(0, 2).join(', ');
    } else {
      alert('ไม่พบสถานที่ที่ค้นหา กรุณาลองใหม่อีกครั้ง');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการค้นหา');
    console.error(err);
  } finally {
    input.disabled = false;
  }
}

function updateMapOverlay() {
  const year = document.getElementById('yearSelect').value;
  const opacity = document.getElementById('layer-opacity').value;
  const url = `maps/${year}_web.png`;

  // Use Canvas to Smart Crop and Isolate the heatmap
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const colCount = new Array(canvas.width).fill(0);
    const rowCount = new Array(canvas.height).fill(0);

    // Pass 1: Count vibrant pixels (ignore black text, grey axes, white bg)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        
        if (maxC - minC > 15 && maxC > 50) {
          colCount[x]++;
          rowCount[y]++;
        }
      }
    }

    // Find the center of the heatmap blob
    let maxCol = 0, cX = Math.floor(canvas.width / 2);
    for(let x=0; x<canvas.width; x++) if(colCount[x] > maxCol) { maxCol = colCount[x]; cX = x; }

    let maxRow = 0, cY = Math.floor(canvas.height / 2);
    for(let y=0; y<canvas.height; y++) if(rowCount[y] > maxRow) { maxRow = rowCount[y]; cY = y; }

    // Expand outwards to find tight bounding box, stopping at empty space (ignores legends)
    let minX = cX, maxX = cX;
    while(minX > 0 && colCount[minX] > 0) minX--;
    while(maxX < canvas.width - 1 && colCount[maxX] > 0) maxX++;

    let minY = cY, maxY = cY;
    while(minY > 0 && rowCount[minY] > 0) minY--;
    while(maxY < canvas.height - 1 && rowCount[maxY] > 0) maxY++;

    // Pass 2: Make everything outside the bounding box or non-vibrant transparent
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i], g = data[i+1], b = data[i+2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        
        if (x < minX || x > maxX || y < minY || y > maxY || (maxC - minC <= 15)) {
           data[i+3] = 0; // transparent
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);

    // Crop the canvas to the tight bounding box
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    if (cropW <= 0 || cropH <= 0) return; 

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const croppedCtx = croppedCanvas.getContext('2d');
    
    croppedCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    
    if (currentOverlay) {
      map.removeLayer(currentOverlay);
    }
    
    currentOverlay = L.imageOverlay(croppedCanvas.toDataURL(), koratBounds, { opacity: opacity, zIndex: 10 }).addTo(map);
  };
  img.src = url;
}

async function saveUserHistory(lat, lng, year, cropPoolNormal) {
  if (!currentUser) return;
  try {
    const cropName = cropPoolNormal[0]?.name || 'Unknown';
    const score = cropPoolNormal[0]?.score || null;

    await sb.from('user_history').insert([{
      user_id: currentUser.id,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      selected_year: year,
      crop_name: cropName,
      suitability_score: score
    }]);
  } catch (err) {
    console.error('Error saving history:', err);
  }
}

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
function handleLeafletClick(e) {
  const tooltip = document.getElementById('mapTooltip');

  if (!tooltipDismissed) {
    tooltip.style.display = 'none';
    tooltipDismissed = true;
  }

  /* Pulse effect */
  triggerPulse(e.containerPoint.x, e.containerPoint.y);

  const lat = e.latlng.lat.toFixed(4);
  const lng = e.latlng.lng.toFixed(4);

  showLoading();
  // Call showResults async
  showResults(lat, lng);
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

// GeoTIFF cache
const tiffCache = {};

async function getTiffValue(tiffPath, lat, lng) {
  if (!tiffCache[tiffPath]) {
    try {
      const response = await fetch(tiffPath);
      if (!response.ok) return 'ERR: HTTP ' + response.status;
      const arrayBuffer = await response.arrayBuffer();
      const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();
      tiffCache[tiffPath] = image;
    } catch (e) {
      console.error("Error loading TIFF:", tiffPath, e);
      return 'ERR: ' + e.message;
    }
  }
  
  const image = tiffCache[tiffPath];
  
  // Use hardcoded Bounding Box (Lat/Lon) to avoid UTM CRS mismatches in the TIFF metadata
  // [minLng, minLat, maxLng, maxLat]
  const bbox = [101.183333, 14.116667, 103.016667, 15.808333];
  
  if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
    return 'ERR: OUT OF BOUNDS'; // Out of bounds
  }
  
  const width = image.getWidth();
  const height = image.getHeight();
  
  const x = Math.floor(((lng - bbox[0]) / (bbox[2] - bbox[0])) * width);
  const y = Math.floor(((bbox[3] - lat) / (bbox[3] - bbox[1])) * height);
  
  try {
    const data = await image.readRasters({ window: [x, y, x + 1, y + 1] });
    const val = data[0][0];
    
    // Usually NoData is -3.4e38, NaN, or very negative
    if (isNaN(val) || val < -999) { 
       return null;
    }
    return val;
  } catch(e) {
    return null;
  }
}

/*Panel state helpers*/
function showLoading() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('loadingState').classList.add('visible');
  document.getElementById('analysisResults').classList.remove('visible');
}

/*Build & render analysis results*/
async function showResults(lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const year = document.getElementById('yearSelect').value;

  const tiffName = year === 'current' ? 'current.tif' : `${year}.tif`;
  
  const safeYear = year.replace('-', '_');
  
  // Fetch real scores in parallel
  const [rawScore, phRaw, fertilityRaw, tempRaw, rainRaw] = await Promise.all([
      getTiffValue(`maps/${tiffName}`, latNum, lngNum),
      getTiffValue(`soil/ph.tif`, latNum, lngNum),
      getTiffValue(`soil/fertility.tif`, latNum, lngNum),
      getTiffValue(`BIO/temp_${safeYear}.tif`, latNum, lngNum),
      getTiffValue(`BIO/rain_${safeYear}.tif`, latNum, lngNum)
  ]);
  
  document.getElementById('loadingState').classList.remove('visible');
  const results = document.getElementById('analysisResults');
  results.classList.add('visible');

  let scoreText = 'ไม่มีข้อมูล';
  let scorePercent = 0;
  let levelClass = '';
  
  // rawScore could be a number or a debug string
  let actualScore = typeof rawScore === 'number' ? rawScore : null;
  
  if (actualScore !== null) {
      // If score is 0-1, convert to 0-100. If already 0-100, use directly.
      scorePercent = actualScore <= 1.0 ? Math.round(actualScore * 100) : Math.round(actualScore);
      if (scorePercent > 100) scorePercent = 100;
      if (scorePercent < 0) scorePercent = 0;
      
      scoreText = `${scorePercent}%`;
      
      if (scorePercent >= 75) levelClass = 'high';
      else if (scorePercent >= 40) levelClass = 'mid';
      else levelClass = 'low';
  } else if (typeof rawScore === 'string') {
      scoreText = rawScore; // show error in UI
  }

  /* Save to DB */
  saveUserHistory(lat, lng, year, [{ name: 'ข้าว (Rice)', score: rawScore }]);

  let futureWarning = '';
  if (year !== 'current') {
    futureWarning = `
      <div style="background: rgba(200, 90, 58, 0.1); border-left: 3px solid #c85a3a; padding: 10px; border-radius: 4px; margin-top: 10px; margin-bottom: 10px; font-size: 11px; line-height: 1.5;">
        <strong>⚠️ คำเตือนอนาคต (${year}):</strong> อุณหภูมิเฉลี่ยและปัจจัยภูมิอากาศจะเปลี่ยนแปลง โปรดพิจารณาความเหมาะสมในการปลูกข้าวอย่างรอบคอบ
      </div>
    `;
  }

  let soilHtml = '';
  if (phRaw !== null || fertilityRaw !== null) {
      let phText = 'ไม่มีข้อมูล';
      if (typeof phRaw === 'number') phText = phRaw.toFixed(1);
      
      let phColor = '#ccc';
      let phPercent = 0;
      if (phRaw !== null) {
          phPercent = (phRaw / 14) * 100;
          phColor = (phRaw >= 5.5 && phRaw <= 7.5) ? 'var(--sage)' : '#e2a750'; 
      }

      let ferColor = '#ccc';
      let ferPercent = 0;
      let ferLabel = 'ไม่มีข้อมูล';
      if (fertilityRaw !== null) {
          // Attempt to classify fertility based on common ranges.
          // If fertility is an integer index (1,2,3)
          if (fertilityRaw === 1) { ferLabel = 'ต่ำ'; ferPercent = 33; ferColor = '#c85a3a'; }
          else if (fertilityRaw === 2) { ferLabel = 'ปานกลาง'; ferPercent = 66; ferColor = '#e2a750'; }
          else if (fertilityRaw >= 3) { ferLabel = 'สูง'; ferPercent = 100; ferColor = 'var(--sage)'; }
          else { 
             ferLabel = fertilityRaw.toFixed(1); 
             ferPercent = 50; 
             ferColor = 'var(--sage)'; 
          }
      }

      soilHtml = `
      <!-- Soil Overview -->
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 13px; color: var(--sage-dark); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">🌱</span> ข้อมูลดินและธาตุอาหาร (จากข้อมูลจริง)
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <!-- pH -->
          <div class="metric-card" style="background: white; border: 1.5px solid var(--border); padding: 10px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
              <span>ค่า pH</span>
              <strong style="color: var(--text-main); font-size: 13px;">${phText}</strong>
            </div>
            <div style="height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: ${phPercent}%; background: ${phColor}; transition: width 1s;"></div>
            </div>
          </div>
          <!-- Fertility -->
          <div class="metric-card" style="background: white; border: 1.5px solid var(--border); padding: 10px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
              <span>ความอุดมสมบูรณ์</span>
              <strong style="color: var(--text-main); font-size: 13px;">${ferLabel}</strong>
            </div>
            <div style="height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: ${ferPercent}%; background: ${ferColor}; transition: width 1s;"></div>
            </div>
          </div>
        </div>
      </div>
      `;
  }

  let bioHtml = '';
  if (tempRaw !== null || rainRaw !== null) {
      let tempText = 'ไม่มีข้อมูล';
      if (typeof tempRaw === 'number') tempText = tempRaw.toFixed(1) + ' °C';
      
      let rainText = 'ไม่มีข้อมูล';
      if (typeof rainRaw === 'number') rainText = Math.round(rainRaw) + ' mm';
      
      let tempPercent = typeof tempRaw === 'number' ? Math.min(100, Math.max(0, ((tempRaw - 15) / 25) * 100)) : 0;
      let rainPercent = typeof rainRaw === 'number' ? Math.min(100, Math.max(0, (rainRaw / 3000) * 100)) : 0;

      bioHtml = `
      <!-- Bio Overview -->
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 13px; color: #4a90e2; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">🌤️</span> ข้อมูลสภาพภูมิอากาศ (Bioclimatic)
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <!-- Temp -->
          <div class="metric-card" style="background: white; border: 1.5px solid var(--border); padding: 10px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
              <span>อุณหภูมิเฉลี่ย</span>
              <strong style="color: var(--text-main); font-size: 13px;">${tempText}</strong>
            </div>
            <div style="height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: ${tempPercent}%; background: #e2a750; transition: width 1s;"></div>
            </div>
          </div>
          <!-- Rain -->
          <div class="metric-card" style="background: white; border: 1.5px solid var(--border); padding: 10px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
              <span>ปริมาณน้ำฝน</span>
              <strong style="color: var(--text-main); font-size: 13px;">${rainText}</strong>
            </div>
            <div style="height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: ${rainPercent}%; background: #4a90e2; transition: width 1s;"></div>
            </div>
          </div>
        </div>
      </div>
      `;
  }

  /*Inject HTML*/
  results.innerHTML = `
    <div class="location-badge">
      <div class="loc-icon">📍</div>
      <div class="loc-info">
        <h4>Coordinate</h4>
        <p>${lat}°, ${lng}°</p>
      </div>
    </div>
    
    ${soilHtml}
    ${bioHtml}
    ${futureWarning}

    <!-- Single Rice Recommendation -->
    <div class="analysis-section">
      <h3 style="font-size: 13px; color: var(--sage-dark); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 16px;">🌾</span> ข้อมูลความเหมาะสม (พืชข้าว)
      </h3>
      
      <div style="padding: 12px; background: white; border: 1.5px solid var(--border); border-radius: 8px; margin-bottom: 8px; position: relative; overflow: hidden;">
        <!-- Background subtle color -->
        <div style="position: absolute; top:0; left:0; width:4px; height:100%; background: ${rawScore === null ? '#ccc' : (levelClass === 'high' ? 'var(--sage)' : (levelClass === 'mid' ? '#e2a750' : '#c85a3a'))};"></div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-left: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
               <span style="font-size: 20px;">🍚</span>
               <strong style="font-size: 14px; color: var(--text-main);">ข้าว (Rice)</strong>
            </div>
            <div class="suit-tag ${levelClass}">${rawScore === null ? 'No Data' : scoreText}</div>
        </div>
        
        <div style="padding-left: 8px;">
            <div style="height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                <div style="height: 100%; width: ${scorePercent}%; background: ${levelClass === 'high' ? 'var(--sage)' : (levelClass === 'mid' ? '#e2a750' : '#c85a3a')}; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
            <p style="font-size: 11px; color: var(--text-muted); text-align: right;">ดึงข้อมูลจากโมเดลพยากรณ์จริง (GeoTIFF)</p>
        </div>
      </div>
    </div>

    <!-- Save Plot Button -->
    <button onclick="savePlot(${lat}, ${lng})" style="
      width: 100%; padding: 10px; margin-top: 4px;
      background: rgba(144, 169, 85, 0.1); color: var(--sage-dark);
      border: 1.5px dashed var(--sage); border-radius: 8px;
      font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500;
      cursor: pointer; transition: all 0.2s;
    " onmouseover="this.style.background='rgba(144, 169, 85, 0.2)'" onmouseout="this.style.background='rgba(144, 169, 85, 0.1)'">
      ⭐ บันทึกแปลงนี้
    </button>
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

/* Save Favorite Plot */
async function savePlot(lat, lng) {
  if (!currentUser) {
    alert('กรุณาเข้าสู่ระบบก่อนบันทึกแปลง');
    return;
  }
  const name = prompt('ตั้งชื่อแปลงนี้ (เช่น "ไร่หลังบ้าน", "นาข้าวลุงสม")');
  if (!name || !name.trim()) return;

  try {
    const { error } = await sb.from('saved_plots').insert({
      user_id: currentUser.id,
      plot_name: name.trim(),
      lat: lat,
      lng: lng
    });
    if (error) throw error;
    alert('✅ บันทึกแปลง "' + name.trim() + '" สำเร็จ!');
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึก');
    console.error(err);
  }
}

/* Sidebar Tab Switching */
let currentSidebarTab = 'recent';

function switchSidebarTab(tab) {
  currentSidebarTab = tab;
  document.getElementById('tab-recent').classList.toggle('active', tab === 'recent');
  document.getElementById('tab-saved').classList.toggle('active', tab === 'saved');
  if (tab === 'recent') loadUserHistory();
  else loadSavedPlots();
}

/* History Viewer Logic */
async function toggleHistory() {
  const overlay = document.getElementById('historyOverlay');
  if (overlay.classList.contains('visible')) {
    overlay.classList.remove('visible');
  } else {
    overlay.classList.add('visible');
    if (currentSidebarTab === 'recent') loadUserHistory();
    else loadSavedPlots();
  }
}

async function loadUserHistory() {
  const content = document.getElementById('historyContent');
  const loading = document.getElementById('historyLoading');
  
  if (!currentUser) {
    content.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 13px;">กรุณาเข้าสู่ระบบก่อนดูประวัติ</div>';
    return;
  }
  
  content.innerHTML = '';
  loading.style.display = 'block';
  
  try {
    const { data, error } = await sb
      .from('user_history')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);
      
    loading.style.display = 'none';
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      content.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 13px;">ยังไม่มีประวัติการวิเคราะห์</div>';
      return;
    }
    
    data.forEach(item => {
      const dateStr = new Date(item.created_at).toLocaleString('th-TH', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      });
      
      const score = item.suitability_score !== null ? 
        (item.suitability_score <= 1.0 ? Math.round(item.suitability_score * 100) : Math.round(item.suitability_score)) : 
        'No Data';
      const scoreText = score === 'No Data' ? score : `${score}%`;
      
      let color = '#ccc';
      if (score !== 'No Data') {
        if (score >= 75) color = 'var(--sage)';
        else if (score >= 40) color = '#e2a750';
        else color = '#c85a3a';
      }
      
      const html = `
        <div class="history-card" onclick="goToHistory(${item.lat}, ${item.lng}, '${item.selected_year}')">
          <div class="date">🕒 ${dateStr}</div>
          <div class="coord">📍 ${item.lat}°, ${item.lng}°</div>
          <div class="score">
            <span>📅 ปีพยากรณ์: ${item.selected_year}</span>
            <span style="color: ${color}; font-weight: bold; background: rgba(0,0,0,0.03); padding: 2px 6px; border-radius: 4px;">ความเหมาะสม: ${scoreText}</span>
          </div>
        </div>
      `;
      content.innerHTML += html;
    });
  } catch (err) {
    loading.style.display = 'none';
    content.innerHTML = '<div style="text-align:center; padding: 20px; color: #c85a3a; font-size: 13px;">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    console.error(err);
  }
}

function goToHistory(lat, lng, year) {
  // Close sidebar
  document.getElementById('historyOverlay').classList.remove('visible');
  
  // Update year select
  document.getElementById('yearSelect').value = year;
  updateMapOverlay(); // Refresh heatmap overlay if active
  
  // Move map
  map.setView([lat, lng], 12);
  
  // Show results
  showLoading();
  triggerPulse(map.latLngToContainerPoint([lat, lng]).x, map.latLngToContainerPoint([lat, lng]).y);
  showResults(lat, lng);
}

/* Load Saved Plots */
async function loadSavedPlots() {
  const content = document.getElementById('historyContent');
  const loading = document.getElementById('historyLoading');

  if (!currentUser) {
    content.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 13px;">กรุณาเข้าสู่ระบบก่อนดูแปลงโปรด</div>';
    return;
  }

  content.innerHTML = '';
  loading.style.display = 'block';

  try {
    const { data, error } = await sb
      .from('saved_plots')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    loading.style.display = 'none';
    if (error) throw error;

    if (!data || data.length === 0) {
      content.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 13px;">ยังไม่มีแปลงโปรดที่บันทึกไว้<br><span style="font-size:11px;">กดปุ่ม ⭐ ในหน้าผลวิเคราะห์เพื่อบันทึก</span></div>';
      return;
    }

    data.forEach(item => {
      const dateStr = new Date(item.created_at).toLocaleString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      const html = `
        <div class="history-card" style="position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div onclick="goToPlot(${item.lat}, ${item.lng})" style="cursor:pointer; flex:1;">
              <div class="coord" style="font-size: 14px;">⭐ ${item.plot_name}</div>
              <div class="date">📍 ${item.lat}°, ${item.lng}°</div>
              <div class="date">📅 บันทึกเมื่อ ${dateStr}</div>
            </div>
            <button onclick="deletePlot('${item.id}')" title="ลบแปลงนี้" style="
              background: none; border: none; font-size: 14px; cursor: pointer;
              color: var(--text-muted); padding: 4px; transition: color 0.2s;
            " onmouseover="this.style.color='#c85a3a'" onmouseout="this.style.color='var(--text-muted)'">
              🗑️
            </button>
          </div>
        </div>
      `;
      content.innerHTML += html;
    });
  } catch (err) {
    loading.style.display = 'none';
    content.innerHTML = '<div style="text-align:center; padding: 20px; color: #c85a3a; font-size: 13px;">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    console.error(err);
  }
}

function goToPlot(lat, lng) {
  document.getElementById('historyOverlay').classList.remove('visible');
  map.flyTo([lat, lng], 14, { duration: 1.5 });
  setTimeout(() => {
    const containerPoint = map.latLngToContainerPoint([lat, lng]);
    triggerPulse(containerPoint.x, containerPoint.y);
    showLoading();
    showResults(lat, lng);
  }, 1600);
}

async function deletePlot(plotId) {
  if (!confirm('ต้องการลบแปลงนี้หรือไม่?')) return;
  try {
    const { error } = await sb.from('saved_plots').delete().eq('id', plotId);
    if (error) throw error;
    loadSavedPlots(); // Refresh the list
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการลบ');
    console.error(err);
  }
}

/*Init*/
document.addEventListener('DOMContentLoaded', () => {
  initMap();

  sb.auth.onAuthStateChange((event, session) => {
    if (session) {
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('logoutBtn').style.display = 'block';
      document.getElementById('historyBtn').style.display = 'block';
      currentUser = session.user;
    } else {
      document.getElementById('authOverlay').style.display = 'flex';
      document.getElementById('logoutBtn').style.display = 'none';
      document.getElementById('historyBtn').style.display = 'none';
    }
  });

  const tooltip = document.getElementById('mapTooltip');
  tooltip.style.display = 'block';
  tooltip.classList.add('visible');
});