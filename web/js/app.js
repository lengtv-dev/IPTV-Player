/* ===== Config ===== */
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const PLAYLIST_URL = isLocal
  ? "/playlist/main.txt"
  : "https://raw.githubusercontent.com/natajrak/IPTV-Player/main/playlist/main.txt";

const PAGE_SIZE = 30;

/* ===== State ===== */
let navHistory = [];
let currentStations = [];
let currentIndex = 0;
let hls = null;
let upnextCountdown = null;
let upnextCancelled = false;
let searchIndex = [];
let currentPage = 0;
let currentGroups = [];
let currentGroupTitle = "";
let currentGroupParent = null;
let inheritedRefererCache = null;
let currentTracks = null;    // [{name, stations, referer}]
let currentTrackIdx = 0;
let activeSearchIdx = -1;
let preSearchState = null;   // saved state before search
let lastNode = null;
let lastTitle = "Home";

/* ===== DOM refs ===== */
const loading    = document.getElementById("loading");
const errorView  = document.getElementById("error-view");
const errorMsg   = document.getElementById("error-message");
const gridView   = document.getElementById("grid-view");
const breadcrumb = document.getElementById("breadcrumb");
const logo       = document.querySelector(".logo");

const playerOverlay = document.getElementById("player-overlay");
const playerVideo   = document.getElementById("player-video");
const playerBack    = document.getElementById("player-back");
const playerTitle   = document.getElementById("player-title");
const playerSeek    = document.getElementById("player-seek");
const playerTime    = document.getElementById("player-time");

const btnPrevEp    = document.getElementById("btn-prev-ep");
const btnRewind    = document.getElementById("btn-rewind");
const btnPlayPause = document.getElementById("btn-playpause");
const btnForward   = document.getElementById("btn-forward");
const btnNextEp    = document.getElementById("btn-next-ep");
const btnMute       = document.getElementById("btn-mute");
const volumeSlider  = document.getElementById("volume-slider");
const btnFullscreen = document.getElementById("btn-fullscreen");
const btnEpisodes   = document.getElementById("btn-episodes");
const epPanel       = document.getElementById("ep-panel");
const epPanelGrid   = document.getElementById("ep-panel-grid");
const epPanelClose  = document.getElementById("ep-panel-close");
const btnTrack      = document.getElementById("btn-track");

const upnextToast     = document.getElementById("upnext-toast");
const upnextThumb     = document.getElementById("upnext-thumb");
const upnextTitle     = document.getElementById("upnext-title");
const upnextCountEl   = document.getElementById("upnext-countdown");
const upnextBar       = document.getElementById("upnext-bar");
const upnextPlayBtn   = document.getElementById("upnext-play-now");
const upnextCancelBtn = document.getElementById("upnext-cancel");

const searchInput   = document.getElementById("search-input");
const searchClear   = document.getElementById("search-clear");
const searchResults = document.getElementById("search-results");

/* ===== Init ===== */
logo.addEventListener("click", () => {
  navHistory = [];
  preSearchState = null;
  searchInput.value = "";
  searchClear.classList.add("hidden");
  closeSearch();
  fetchAndRender(PLAYLIST_URL, "Home");
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!playerOverlay.classList.contains("hidden")) closePlayer();
    else closeSearch();
  }
  if (!playerOverlay.classList.contains("hidden")) {
    if (e.key === "ArrowLeft")  rewind10();
    if (e.key === "ArrowRight") forward10();
    if (e.key === " ") { e.preventDefault(); togglePlayPause(); }
  }
});

document.addEventListener("click", (e) => {
  if (!document.getElementById("search-container").contains(e.target)) closeSearch();
});

fetchAndRender(PLAYLIST_URL, "Home");

/* ===== Fetch & Render ===== */
async function fetchAndRender(url, title, pushHistory = false, previousNode = null) {
  showLoading();
  try {
    const node = await fetchJSON(url);
    if (pushHistory && previousNode) {
      navHistory.push({ node: previousNode, title });
    }
    if (searchIndex.length === 0) buildSearchIndex(node, [{ node, title: "Home" }]);
    renderNode(node, title);
  } catch (err) {
    showError(err.message || "โหลดข้อมูลไม่สำเร็จ");
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ===== Search Index ===== */
function buildSearchIndex(node, historyChain) {
  (node.groups || []).forEach(group => {
    const name = group.name || group.info || "";
    if (!name) return;
    searchIndex.push({
      name,
      image: group.image || null,
      node: group,
      path: historyChain.map(h => h.title),
      historyChain: [...historyChain],
    });
    if (group.groups) {
      buildSearchIndex(group, [...historyChain, { node: group, title: name }]);
    }
  });
}

/* ===== Search UI ===== */
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim();
  activeSearchIdx = -1;

  // save state before first search action
  if (q && !preSearchState) {
    preSearchState = { node: lastNode, title: lastTitle, history: [...navHistory] };
  }

  // toggle clear button
  searchClear.classList.toggle("hidden", q.length === 0);

  if (!q) { closeSearch(); return; }

  const results = searchIndex
    .filter(e => e.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  renderSearchResults(results, q);
});

searchInput.addEventListener("keydown", (e) => {
  const items = searchResults.querySelectorAll(".search-item");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeSearchIdx = Math.min(activeSearchIdx + 1, items.length - 1);
    updateActiveSearch(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSearchIdx = Math.max(activeSearchIdx - 1, -1);
    updateActiveSearch(items);
  } else if (e.key === "Enter" && activeSearchIdx >= 0) {
    items[activeSearchIdx]?.click();
  }
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.add("hidden");
  closeSearch();
  if (preSearchState) {
    navHistory = preSearchState.history;
    renderNode(preSearchState.node, preSearchState.title);
    preSearchState = null;
  }
});

function updateActiveSearch(items) {
  items.forEach((el, i) => el.classList.toggle("active", i === activeSearchIdx));
}

function renderSearchResults(results, q) {
  if (results.length === 0) {
    searchResults.innerHTML = `<div class="search-no-result">ไม่พบ "${esc(q)}"</div>`;
  } else {
    searchResults.innerHTML = results.map((r, i) => {
      const thumb = r.image
        ? `<img class="search-thumb" src="${esc(r.image)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : "";
      const ph = `<div class="search-thumb-ph" style="${r.image ? "display:none" : ""}">🎬</div>`;
      const pathStr = r.path.length ? esc(r.path.join(" › ")) : "";
      return `<div class="search-item" data-idx="${i}">${thumb}${ph}
        <div class="search-item-info">
          <div class="search-item-name">${esc(r.name)}</div>
          ${pathStr ? `<div class="search-item-path">${pathStr}</div>` : ""}
        </div></div>`;
    }).join("");

    searchResults.querySelectorAll(".search-item").forEach((el, i) => {
      el.addEventListener("click", () => {
        navigateToSearchResult(results[i]);
      });
    });
  }
  searchResults.classList.remove("hidden");
}

function navigateToSearchResult(entry) {
  // Set navHistory to reconstruct proper breadcrumb
  navHistory = [...entry.historyChain];
  closeSearch();
  // Keep search text visible
  searchClear.classList.remove("hidden");

  const group = entry.node;
  if (group.url && !group.groups && !group.stations) {
    fetchAndRender(group.url, group.name || "...");
  } else {
    renderNode(group, group.name || "...");
  }
}

function closeSearch() {
  searchResults.classList.add("hidden");
  activeSearchIdx = -1;
}

/* ===== Render node ===== */
function renderNode(node, title, tracks = null) {
  lastNode = node;
  lastTitle = title;
  updateBreadcrumb(title);

  if (node.groups?.length) {
    currentPage = 0;
    renderGroups(node.groups, title, node);
  } else if (node.stations?.length) {
    renderStations(node.stations, node.referer, title, tracks);
  } else {
    showError("ไม่พบข้อมูลใน playlist นี้");
    return;
  }
  showGrid();
}

/* ===== Render group cards (with pagination) ===== */
function renderGroups(groups, sectionTitle, parentNode) {
  currentGroups = groups;
  currentGroupTitle = sectionTitle;
  currentGroupParent = parentNode;

  const total = groups.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = currentPage * PAGE_SIZE;
  const pageGroups = groups.slice(start, start + PAGE_SIZE);

  gridView.innerHTML = `<h2 class="section-title">${esc(sectionTitle)}</h2>
    <div class="card-grid portrait"></div>
    ${totalPages > 1 ? `<div id="pagination">
      <button class="page-btn" id="page-prev" ${currentPage === 0 ? "disabled" : ""}>◀ ก่อนหน้า</button>
      <span id="page-info">หน้า ${currentPage + 1} / ${totalPages}</span>
      <button class="page-btn" id="page-next" ${currentPage >= totalPages - 1 ? "disabled" : ""}>ถัดไป ▶</button>
    </div>` : ""}`;

  const grid = gridView.querySelector(".card-grid");

  pageGroups.forEach((group) => {
    const card = makeCard({
      name: group.name || group.info || "ไม่มีชื่อ",
      image: group.image,
      sub: group.author || null,
      landscape: false,
    });

    card.addEventListener("click", () => {
      const prevNode = { groups, referer: null };
      if (group.url && !group.groups && !group.stations) {
        navHistory.push({ node: prevNode, title: sectionTitle });
        fetchAndRender(group.url, group.name || "...");
      } else {
        // detect sibling language tracks
        const siblingTracks = groups
          .filter(g => g.stations?.length)
          .map(g => ({ name: g.name || g.info || "ไม่ทราบ", stations: g.stations, referer: g.referer || null }));
        const tracks = siblingTracks.length > 1 ? siblingTracks : null;

        navHistory.push({ node: prevNode, title: sectionTitle });
        renderNode(group, group.name || "...", tracks);
      }
    });

    grid.appendChild(card);
  });

  if (totalPages > 1) {
    document.getElementById("page-prev")?.addEventListener("click", () => {
      currentPage--;
      renderGroups(currentGroups, currentGroupTitle, currentGroupParent);
      showGrid();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.getElementById("page-next")?.addEventListener("click", () => {
      currentPage++;
      renderGroups(currentGroups, currentGroupTitle, currentGroupParent);
      showGrid();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

/* ===== Render episode cards ===== */
function renderStations(stations, referer, sectionTitle, tracks = null) {
  gridView.innerHTML = `<h2 class="section-title">${esc(sectionTitle)}</h2>
    <div class="card-grid landscape"></div>`;

  const grid = gridView.querySelector(".card-grid");

  stations.forEach((station, i) => {
    const card = makeCard({
      name: station.name || `ตอนที่ ${i + 1}`,
      image: station.image,
      sub: null,
      landscape: true,
    });

    card.addEventListener("click", () => {
      openPlayer(stations, i, referer, tracks);
    });

    grid.appendChild(card);
  });
}

/* ===== Make Card element ===== */
function makeCard({ name, image, sub, landscape }) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") e.target.click();
  });

  const thumb = document.createElement(image ? "img" : "div");
  thumb.className = "card-thumb" + (image ? "" : " card-thumb-placeholder");
  if (image) {
    thumb.src = image;
    thumb.alt = name;
    thumb.loading = "lazy";
    thumb.onerror = () => {
      thumb.style.display = "none";
      const ph = document.createElement("div");
      ph.className = "card-thumb card-thumb-placeholder";
      ph.textContent = landscape ? "▶" : "🎬";
      card.insertBefore(ph, card.firstChild);
    };
  } else {
    thumb.textContent = landscape ? "▶" : "🎬";
  }

  const info = document.createElement("div");
  info.className = "card-info";
  info.innerHTML = `<div class="card-name">${esc(name)}</div>${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}`;

  card.appendChild(thumb);
  card.appendChild(info);
  return card;
}

/* ===== Breadcrumb ===== */
function updateBreadcrumb(currentTitle) {
  breadcrumb.innerHTML = "";

  navHistory.forEach((entry, i) => {
    const span = document.createElement("span");
    span.className = "breadcrumb-item";
    span.textContent = entry.title;
    span.addEventListener("click", () => {
      navHistory = navHistory.slice(0, i);
      renderNode(entry.node, entry.title);
    });
    breadcrumb.appendChild(span);

    const sep = document.createElement("span");
    sep.className = "breadcrumb-sep";
    sep.textContent = "›";
    breadcrumb.appendChild(sep);
  });

  const current = document.createElement("span");
  current.className = "breadcrumb-item active";
  current.textContent = currentTitle;
  breadcrumb.appendChild(current);
}

/* ===== Player ===== */
function openPlayer(stations, index, inheritedReferer, tracks = null) {
  currentStations = stations;
  currentIndex = index;
  upnextCancelled = false;
  inheritedRefererCache = inheritedReferer;
  currentTracks = tracks;
  currentTrackIdx = tracks ? tracks.findIndex(t => t.stations === stations) : 0;
  if (currentTrackIdx < 0) currentTrackIdx = 0;
  updateTrackButton();

  playerOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  updateVolumeUI();
  showPlayerUI();

  playEpisode(index, inheritedReferer);
}

function playEpisode(index, inheritedReferer) {
  const station = currentStations[index];
  if (!station) { closePlayer(); return; }

  currentIndex = index;
  inheritedRefererCache = inheritedReferer;

  const referer = station.referer ?? inheritedReferer ?? null;
  const url = station.url;

  playerTitle.textContent = station.name || `ตอนที่ ${index + 1}`;
  btnPrevEp.disabled = index <= 0;
  btnNextEp.disabled = index >= currentStations.length - 1;
  btnEpisodes.textContent = `☰ ${index + 1}/${currentStations.length}`;
  if (!epPanel.classList.contains("hidden")) renderEpPanel();

  cancelUpnext();
  destroyHls();
  resetProgress();

  if (Hls.isSupported() && url.includes(".m3u8")) {
    hls = new Hls({
      xhrSetup: referer
        ? (xhr) => { xhr.setRequestHeader("Referer", referer); }
        : undefined,
    });
    hls.loadSource(url);
    hls.attachMedia(playerVideo);
    hls.on(Hls.Events.MANIFEST_PARSED, () => playerVideo.play());
  } else {
    playerVideo.src = url;
    playerVideo.play();
  }

  playerVideo.onended = () => scheduleNext(inheritedReferer);
}

/* ===== Player Controls ===== */
function togglePlayPause() {
  if (playerVideo.paused) playerVideo.play();
  else playerVideo.pause();
}

function rewind10()  { playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 10); }
function forward10() { if (playerVideo.duration) playerVideo.currentTime = Math.min(playerVideo.duration, playerVideo.currentTime + 10); }

btnPlayPause.addEventListener("click", togglePlayPause);
btnRewind.addEventListener("click", rewind10);
btnForward.addEventListener("click", forward10);
btnPrevEp.addEventListener("click", () => { if (currentIndex > 0) playEpisode(currentIndex - 1, inheritedRefererCache); });
btnNextEp.addEventListener("click", () => { if (currentIndex < currentStations.length - 1) playEpisode(currentIndex + 1, inheritedRefererCache); });

playerVideo.addEventListener("play",  () => { btnPlayPause.textContent = "⏸"; showPlayerUI(); });
playerVideo.addEventListener("pause", () => { btnPlayPause.textContent = "▶"; showPlayerUI(); });

playerVideo.addEventListener("timeupdate", () => {
  if (!playerVideo.duration) return;
  const pct = (playerVideo.currentTime / playerVideo.duration) * 100;
  playerSeek.value = pct;
  playerSeek.style.background = `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,.3) ${pct}%)`;
  playerTime.textContent = `${formatTime(playerVideo.currentTime)} / ${formatTime(playerVideo.duration)}`;
});

playerSeek.addEventListener("input", () => {
  if (playerVideo.duration) {
    playerVideo.currentTime = (playerSeek.value / 100) * playerVideo.duration;
  }
});

// Episode picker
btnEpisodes.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = !epPanel.classList.contains("hidden");
  if (isOpen) { epPanel.classList.add("hidden"); return; }
  renderEpPanel();
  epPanel.classList.remove("hidden");
  showPlayerUI();
});

epPanelClose.addEventListener("click", () => epPanel.classList.add("hidden"));

function renderEpPanel() {
  epPanelGrid.innerHTML = "";
  currentStations.forEach((station, i) => {
    const card = document.createElement("div");
    card.className = "ep-card" + (i === currentIndex ? " active" : "");

    const thumbEl = station.image
      ? `<img class="ep-card-thumb" src="${esc(station.image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=ep-card-thumb-ph>▶</div>'">`
      : `<div class="ep-card-thumb-ph">▶</div>`;

    const label = station.name || `ตอนที่ ${i + 1}`;
    const playingBadge = i === currentIndex ? `<span class="ep-card-playing">▶ กำลังเล่น</span>` : "";

    card.innerHTML = `${thumbEl}${playingBadge}<div class="ep-card-label">${esc(label)}</div>`;

    card.addEventListener("click", () => {
      playEpisode(i, inheritedRefererCache);
      renderEpPanel();  // refresh active state
    });

    epPanelGrid.appendChild(card);
  });

  // scroll active card into view
  setTimeout(() => {
    epPanelGrid.querySelector(".ep-card.active")?.scrollIntoView({ block: "nearest" });
  }, 50);
}

// Close panel when clicking outside
playerOverlay.addEventListener("click", (e) => {
  if (!epPanel.contains(e.target) && e.target !== btnEpisodes) {
    epPanel.classList.add("hidden");
  }
  const menu = document.getElementById("track-menu");
  if (menu && !menu.contains(e.target) && e.target !== btnTrack) {
    menu.remove();
  }
});

// Track (language) switcher
btnTrack.addEventListener("click", (e) => {
  e.stopPropagation();
  const existing = document.getElementById("track-menu");
  if (existing) { existing.remove(); return; }
  if (!currentTracks) return;

  const menu = document.createElement("div");
  menu.id = "track-menu";
  currentTracks.forEach((track, i) => {
    const opt = document.createElement("div");
    opt.className = "track-option" + (i === currentTrackIdx ? " active" : "");
    opt.innerHTML = `<span class="track-dot"></span>${esc(track.name)}`;
    opt.addEventListener("click", () => {
      menu.remove();
      switchTrack(i);
    });
    menu.appendChild(opt);
  });
  playerOverlay.appendChild(menu);
  showPlayerUI();
});

const TRACK_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <line x1="2" y1="12" x2="22" y2="12"/>
  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
</svg>`;

function updateTrackButton() {
  if (!currentTracks || currentTracks.length <= 1) {
    btnTrack.classList.add("hidden");
    return;
  }
  btnTrack.classList.remove("hidden");
  const name = currentTracks[currentTrackIdx]?.name || "ภาษา";
  btnTrack.innerHTML = `${TRACK_ICON} ${esc(name)}`;
}

function switchTrack(idx) {
  const track = currentTracks[idx];
  currentTrackIdx = idx;
  currentStations = track.stations;
  const targetIndex = Math.min(currentIndex, currentStations.length - 1);
  updateTrackButton();
  playEpisode(targetIndex, track.referer || inheritedRefererCache);
  if (!epPanel.classList.contains("hidden")) renderEpPanel();
}

// Mute toggle
btnMute.addEventListener("click", () => {
  playerVideo.muted = !playerVideo.muted;
  updateVolumeUI();
});

// Volume slider
volumeSlider.addEventListener("input", () => {
  playerVideo.volume = volumeSlider.value;
  playerVideo.muted = playerVideo.volume === 0;
  updateVolumeUI();
});

const VOL_ICONS = {
  mute: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>`,
  low: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>`,
  high: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>`,
};

function updateVolumeUI() {
  const v = playerVideo.muted ? 0 : playerVideo.volume;
  volumeSlider.value = playerVideo.muted ? 0 : playerVideo.volume;
  const pct = v * 100;
  volumeSlider.style.background = `linear-gradient(to right, rgba(255,255,255,.9) ${pct}%, rgba(255,255,255,.3) ${pct}%)`;
  btnMute.innerHTML = v === 0 ? VOL_ICONS.mute : v < 0.5 ? VOL_ICONS.low : VOL_ICONS.high;
}

// Fullscreen
btnFullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    playerOverlay.requestFullscreen?.();
    btnFullscreen.textContent = "⊠";
  } else {
    document.exitFullscreen?.();
    btnFullscreen.textContent = "⛶";
  }
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) btnFullscreen.textContent = "⛶";
});

/* ===== Auto-hide UI ===== */
let idleTimer = null;

function showPlayerUI() {
  playerOverlay.classList.add("show-ui");
  clearTimeout(idleTimer);
  if (!playerVideo.paused) {
    idleTimer = setTimeout(() => playerOverlay.classList.remove("show-ui"), 3000);
  }
}

playerOverlay.addEventListener("mousemove", showPlayerUI);
playerOverlay.addEventListener("touchstart", showPlayerUI);

// Click on video toggles play/pause
playerVideo.addEventListener("click", togglePlayPause);

function resetProgress() {
  playerSeek.value = 0;
  playerSeek.style.background = `linear-gradient(to right, var(--accent) 0%, rgba(255,255,255,.3) 0%)`;
  playerTime.textContent = "0:00 / 0:00";
}

function formatTime(secs) {
  if (!isFinite(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/* ===== Auto-next (Up Next toast) ===== */
function scheduleNext(inheritedReferer) {
  const nextIndex = currentIndex + 1;
  if (nextIndex >= currentStations.length || upnextCancelled) {
    closePlayer();
    return;
  }

  const next = currentStations[nextIndex];
  upnextThumb.src = next.image || "";
  upnextTitle.textContent = next.name || `ตอนที่ ${nextIndex + 1}`;
  upnextToast.classList.remove("hidden");

  let secs = 5;
  upnextCountEl.textContent = secs;
  upnextBar.style.transition = "none";
  upnextBar.style.transform = "scaleX(1)";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      upnextBar.style.transition = `transform ${secs}s linear`;
      upnextBar.style.transform = "scaleX(0)";
    });
  });

  upnextCountdown = setInterval(() => {
    secs--;
    upnextCountEl.textContent = secs;
    if (secs <= 0) {
      clearInterval(upnextCountdown);
      upnextToast.classList.add("hidden");
      playEpisode(nextIndex, inheritedReferer);
    }
  }, 1000);

  upnextPlayBtn.onclick = () => { cancelUpnext(); playEpisode(nextIndex, inheritedReferer); };
  upnextCancelBtn.onclick = () => { upnextCancelled = true; cancelUpnext(); };
}

function cancelUpnext() {
  clearInterval(upnextCountdown);
  upnextToast.classList.add("hidden");
}

function closePlayer() {
  cancelUpnext();
  destroyHls();
  playerVideo.pause();
  playerVideo.src = "";
  playerVideo.onended = null;
  playerOverlay.classList.add("hidden");
  playerOverlay.classList.remove("show-ui");
  clearTimeout(idleTimer);
  document.body.style.overflow = "";
}

function destroyHls() {
  if (hls) { hls.destroy(); hls = null; }
}

playerBack.addEventListener("click", closePlayer);

/* ===== UI state helpers ===== */
function showLoading() {
  loading.classList.remove("hidden");
  errorView.classList.add("hidden");
  gridView.classList.add("hidden");
}

function showGrid() {
  loading.classList.add("hidden");
  errorView.classList.add("hidden");
  gridView.classList.remove("hidden");
}

function showError(msg) {
  loading.classList.add("hidden");
  gridView.classList.add("hidden");
  errorMsg.textContent = msg;
  errorView.classList.remove("hidden");
}

/* ===== Util ===== */
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
