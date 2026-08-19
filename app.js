/* =====================================================================
   APP.JS — router, views, and the shuffle/player engine.
   You should not need to edit this file to add songs — see playlists.js.
===================================================================== */

/* ---------- Data prep ---------- */
const ALL_SONGS = PLAYLISTS.flatMap(pl =>
  pl.songs.map(s => ({ ...s, playlistId: pl.id, playlistName: pl.name }))
);

function thumbOf(song) {
  return `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg`;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Shuffle a song list so playback never repeats until every song has
 *  played once, and (best-effort) doesn't start with the song that was
 *  just playing / last played on a previous visit. */
function buildShuffledQueue(songs, avoidId) {
  if (songs.length <= 1) return [...songs];
  let arr = shuffle(songs);
  if (avoidId && arr[0].id === avoidId) {
    const swapAt = 1 + Math.floor(Math.random() * (arr.length - 1));
    [arr[0], arr[swapAt]] = [arr[swapAt], arr[0]];
  }
  return arr;
}

/* ---------- Player engine ---------- */
const Player = {
  ytPlayer: null,
  ytReady: false,
  queue: [],
  queueIndex: -1,
  history: [],
  currentSong: null,
  source: { type: "all", id: null }, // where "next" should keep pulling from
  isPlaying: false,
  pollTimer: null,

  lastSongId() {
    return localStorage.getItem("py_lastSongId") || null;
  },
  rememberSong(id) {
    localStorage.setItem("py_lastSongId", id);
  },

  init() {
    // Prepare an initial "up next" song so every visit looks different,
    // but do NOT autoplay (browsers block that anyway until a gesture).
    this.source = { type: "all", id: null };
    this.queue = buildShuffledQueue(ALL_SONGS, this.lastSongId());
    this.queueIndex = 0;
    this.currentSong = this.queue[0];
    this.updateBar(false);
  },

  onYTReady(ytPlayer) {
    this.ytPlayer = ytPlayer;
    this.ytReady = true;
    if (this.currentSong) {
      this.ytPlayer.cueVideoById(this.currentSong.id);
    }
  },

  /** Start playing a whole playlist, shuffled, avoiding an immediate repeat. */
  playPlaylistShuffled(playlistId) {
    const pl = PLAYLISTS.find(p => p.id === playlistId);
    if (!pl || !pl.songs.length) return;
    const songs = pl.songs.map(s => ({ ...s, playlistId: pl.id, playlistName: pl.name }));
    this.source = { type: "playlist", id: playlistId };
    this.queue = buildShuffledQueue(songs, this.lastSongId());
    this.queueIndex = 0;
    this.history = [];
    this.playCurrent(true);
  },

  /** Play one specific song now, then continue shuffling through the rest
   *  of whatever pool it belongs to (a single playlist, or all songs). */
  playSongThenShuffleRest(song, poolType) {
    let pool;
    if (poolType === "playlist") {
      const pl = PLAYLISTS.find(p => p.id === song.playlistId);
      pool = pl.songs.map(s => ({ ...s, playlistId: pl.id, playlistName: pl.name }));
      this.source = { type: "playlist", id: song.playlistId };
    } else {
      pool = ALL_SONGS;
      this.source = { type: "all", id: null };
    }
    const rest = pool.filter(s => s.id !== song.id || s.title !== song.title);
    this.queue = [song, ...shuffle(rest)];
    this.queueIndex = 0;
    this.history = [];
    this.playCurrent(true);
  },

  /** Shuffle across every song in every playlist. */
  shuffleAll() {
    this.source = { type: "all", id: null };
    this.queue = buildShuffledQueue(ALL_SONGS, this.lastSongId());
    this.queueIndex = 0;
    this.history = [];
    this.playCurrent(true);
  },

  refillQueue() {
    const avoid = this.currentSong ? this.currentSong.id : this.lastSongId();
    if (this.source.type === "playlist") {
      const pl = PLAYLISTS.find(p => p.id === this.source.id);
      const songs = pl.songs.map(s => ({ ...s, playlistId: pl.id, playlistName: pl.name }));
      this.queue = buildShuffledQueue(songs, avoid);
    } else {
      this.queue = buildShuffledQueue(ALL_SONGS, avoid);
    }
    this.queueIndex = 0;
  },

  next() {
    if (this.currentSong) this.history.push(this.currentSong);
    if (this.history.length > 50) this.history.shift();
    this.queueIndex++;
    if (this.queueIndex >= this.queue.length) this.refillQueue();
    this.playCurrent(true);
  },

  prev() {
    if (this.history.length === 0) {
      if (this.ytPlayer && this.ytReady) this.ytPlayer.seekTo(0, true);
      return;
    }
    const song = this.history.pop();
    this.currentSong = song;
    this.loadIntoPlayer(song, true);
    this.updateBar(true);
  },

  playCurrent(autoplay) {
    const song = this.queue[this.queueIndex];
    if (!song) return;
    this.currentSong = song;
    this.rememberSong(song.id);
    this.loadIntoPlayer(song, autoplay);
    this.updateBar(autoplay);
  },

  loadIntoPlayer(song, autoplay) {
    if (!this.ytPlayer || !this.ytReady) return;
    if (autoplay) this.ytPlayer.loadVideoById(song.id);
    else this.ytPlayer.cueVideoById(song.id);
  },

  togglePlay() {
    if (!this.ytPlayer || !this.ytReady || !this.currentSong) return;
    const state = this.ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      this.ytPlayer.pauseVideo();
    } else {
      // If nothing has actually been loaded/started yet, load+play now.
      if (state === YT.PlayerState.CUED || state === -1) {
        this.ytPlayer.loadVideoById(this.currentSong.id);
      } else {
        this.ytPlayer.playVideo();
      }
    }
  },

  onStateChange(state) {
    if (state === YT.PlayerState.PLAYING) {
      this.isPlaying = true;
      document.body.classList.add("playing");
      this.startPolling();
    } else if (state === YT.PlayerState.PAUSED) {
      this.isPlaying = false;
      document.body.classList.remove("playing");
      this.stopPolling();
    } else if (state === YT.PlayerState.ENDED) {
      this.isPlaying = false;
      document.body.classList.remove("playing");
      this.stopPolling();
      this.next();
    }
    this.updatePlayIcon();
    renderCurrentHighlight();
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.updateSeek(), 500);
  },
  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  updateSeek() {
    if (!this.ytPlayer || !this.ytReady) return;
    const dur = this.ytPlayer.getDuration() || 0;
    const cur = this.ytPlayer.getCurrentTime() || 0;
    const seekEl = document.getElementById("pbSeek");
    const timeEl = document.getElementById("pbTime");
    if (seekEl && dur > 0 && !seekEl.dragging) {
      seekEl.value = Math.floor((cur / dur) * 1000);
    }
    if (timeEl) timeEl.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
  },

  updatePlayIcon() {
    const icon = document.getElementById("pbPlayIcon");
    if (!icon) return;
    icon.innerHTML = this.isPlaying
      ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
  },

  updateBar(playing) {
    const bar = document.getElementById("playerBar");
    if (!bar || !this.currentSong) return;
    bar.hidden = false;
    document.getElementById("pbThumb").src = thumbOf(this.currentSong);
    document.getElementById("pbTitle").textContent = this.currentSong.title;
    document.getElementById("pbSub").textContent =
      `${this.currentSong.artist || ""} · ${this.currentSong.playlistName || ""}`.replace(/^ · /, "");
    this.isPlaying = !!playing;
    document.body.classList.toggle("playing", this.isPlaying);
    this.updatePlayIcon();
  }
};

/* ---------- YouTube IFrame API bootstrap ---------- */
function onYouTubeIframeAPIReady() {
  const mount = document.getElementById("yt-mount");
  const ytPlayer = new YT.Player(mount, {
    height: "1", width: "1",
    videoId: Player.currentSong ? Player.currentSong.id : undefined,
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: () => Player.onYTReady(ytPlayer),
      onStateChange: e => Player.onStateChange(e.data)
    }
  });
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

/* ---------- Player bar controls ---------- */
document.addEventListener("DOMContentLoaded", () => {
  Player.init();

  document.getElementById("pbPlay").addEventListener("click", () => Player.togglePlay());
  document.getElementById("pbNext").addEventListener("click", () => Player.next());
  document.getElementById("pbPrev").addEventListener("click", () => Player.prev());

  const seekEl = document.getElementById("pbSeek");
  seekEl.addEventListener("pointerdown", () => { seekEl.dragging = true; });
  seekEl.addEventListener("change", () => {
    if (Player.ytPlayer && Player.ytReady) {
      const dur = Player.ytPlayer.getDuration() || 0;
      Player.ytPlayer.seekTo((seekEl.value / 1000) * dur, true);
    }
    seekEl.dragging = false;
  });

  router();
});
window.addEventListener("hashchange", router);

/* ---------- Views / router ---------- */
function router() {
  const path = (location.hash.replace(/^#/, "") || "/");
  const parts = path.split("/").filter(Boolean);
  const root = document.getElementById("view-root");

  document.querySelectorAll("#navLinks a").forEach(a => a.classList.remove("active"));

  if (parts.length === 0) {
    setActiveNav("/");
    root.innerHTML = viewHome();
  } else if (parts[0] === "playlists") {
    setActiveNav("/playlists");
    root.innerHTML = viewPlaylists();
  } else if (parts[0] === "playlist" && parts[1]) {
    root.innerHTML = viewPlaylistDetail(parts[1]);
  } else if (parts[0] === "songs") {
    setActiveNav("/songs");
    root.innerHTML = viewSongs();
    wireSongSearch();
  } else {
    setActiveNav("/");
    root.innerHTML = viewHome();
  }

  wirePlaylistButtons();
  wireSongRows();
  renderCurrentHighlight();
  window.scrollTo(0, 0);
}
function setActiveNav(route) {
  const a = document.querySelector(`#navLinks a[data-route="${route}"]`);
  if (a) a.classList.add("active");
}

function playlistCard(pl) {
  const cover = pl.songs[0] ? thumbOf(pl.songs[0]) : "";
  return `
  <a class="playlist-card" href="#/playlist/${pl.id}">
    <img src="${cover}" alt="" loading="lazy" />
    <div class="body">
      <h3>${escapeHtml(pl.name)}</h3>
      <p>${escapeHtml(pl.description || "")}</p>
      <span class="count">${pl.songs.length} song${pl.songs.length === 1 ? "" : "s"}</span>
    </div>
  </a>`;
}

function viewHome() {
  return `
  <section class="hero">
    <div class="gramophone">
      <svg class="vinyl-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="100" cy="100" r="96" fill="#0c0607" stroke="#8a6a3a" stroke-width="3"/>
        <circle cx="100" cy="100" r="80" fill="none" stroke="#241415" stroke-width="1.5"/>
        <circle cx="100" cy="100" r="68" fill="none" stroke="#241415" stroke-width="1.5"/>
        <circle cx="100" cy="100" r="56" fill="none" stroke="#241415" stroke-width="1.5"/>
        <circle cx="100" cy="100" r="44" fill="#33191c" stroke="#8a6a3a" stroke-width="2.5"/>
        <circle cx="100" cy="100" r="13" fill="#c9974d"/>
        <circle cx="100" cy="100" r="4" fill="#120a09"/>
      </svg>
      <svg class="tonearm-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="176" cy="22" r="11" fill="#ecce93"/>
        <circle cx="176" cy="22" r="11" fill="none" stroke="#120a09" stroke-width="1.5"/>
        <line x1="176" y1="22" x2="108" y2="58" stroke="#ecce93" stroke-width="5" stroke-linecap="round"/>
        <line x1="176" y1="22" x2="108" y2="58" stroke="#8a6a3a" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="108" cy="58" r="4" fill="#120a09"/>
      </svg>
    </div>
    <h1>महफ़िल रेडियो</h1>
    <p>An always-on radio of old Hindi songs. Pick a playlist, or just let it shuffle through everything — it never plays the same song twice in a row, and it starts somewhere new every time you visit.</p>
    <button class="btn btn-primary" id="shuffleAllBtn">🔀 Shuffle All Songs</button>
  </section>

  <div class="section-head">
    <h2>Playlists</h2>
    <span>${PLAYLISTS.length} total</span>
  </div>
  <div class="playlist-grid">
    ${PLAYLISTS.map(playlistCard).join("")}
  </div>

  <footer class="footer-note">
    Audio plays through YouTube's embedded player. Nothing is hosted on this site.
  </footer>`;
}

function viewPlaylists() {
  return `
  <div class="section-head">
    <h2>All Playlists</h2>
    <span>${PLAYLISTS.length} total</span>
  </div>
  <div class="playlist-grid">
    ${PLAYLISTS.map(playlistCard).join("")}
  </div>`;
}

function viewPlaylistDetail(id) {
  const pl = PLAYLISTS.find(p => p.id === id);
  if (!pl) {
    return `<p class="empty-note">Playlist not found. <a class="back-link" href="#/playlists">← Back to playlists</a></p>`;
  }
  const cover = pl.songs[0] ? thumbOf(pl.songs[0]) : "";
  return `
  <a class="back-link" href="#/playlists">← All playlists</a>
  <div class="playlist-header">
    <img src="${cover}" alt="" />
    <div>
      <h1>${escapeHtml(pl.name)}</h1>
      <p>${escapeHtml(pl.description || "")} · ${pl.songs.length} songs</p>
    </div>
  </div>
  <button class="btn btn-primary" data-shuffle-playlist="${pl.id}" style="margin: 14px 0 22px;">🔀 Shuffle Play This Playlist</button>
  <div class="song-list">
    ${pl.songs.map((s, i) => songRow({ ...s, playlistId: pl.id, playlistName: pl.name }, i + 1, "playlist")).join("")}
  </div>`;
}

function viewSongs() {
  return `
  <div class="section-head">
    <h2>All Songs</h2>
    <span>${ALL_SONGS.length} total</span>
  </div>
  <input class="search-input" id="songSearch" type="text" placeholder="Search by song or artist…" />
  <div class="song-list" id="songListRoot">
    ${ALL_SONGS.map((s, i) => songRow(s, i + 1, "all")).join("")}
  </div>`;
}

function songRow(song, idx, poolType) {
  return `
  <button class="song-row" data-song-id="${song.id}" data-song-title="${escapeHtml(song.title)}" data-pool="${poolType}" data-playlist-id="${song.playlistId}">
    <span class="idx">${idx}</span>
    <img src="${thumbOf(song)}" alt="" loading="lazy" />
    <span class="meta">
      <span class="title">${escapeHtml(song.title)}</span>
      <span class="artist">${escapeHtml(song.artist || "")}${poolType === "all" ? " · " + escapeHtml(song.playlistName) : ""}</span>
    </span>
    <span class="playing-dot"></span>
  </button>`;
}

function wirePlaylistButtons() {
  const shuffleAllBtn = document.getElementById("shuffleAllBtn");
  if (shuffleAllBtn) shuffleAllBtn.addEventListener("click", () => Player.shuffleAll());

  document.querySelectorAll("[data-shuffle-playlist]").forEach(btn => {
    btn.addEventListener("click", () => Player.playPlaylistShuffled(btn.dataset.shufflePlaylist));
  });
}

function wireSongRows() {
  document.querySelectorAll(".song-row").forEach(row => {
    row.addEventListener("click", () => {
      const poolType = row.dataset.pool;
      const songId = row.dataset.songId;
      const title = row.dataset.songTitle;
      let song;
      if (poolType === "playlist") {
        const pl = PLAYLISTS.find(p => p.id === row.dataset.playlistId);
        song = pl.songs.map(s => ({ ...s, playlistId: pl.id, playlistName: pl.name })).find(s => s.id === songId && s.title === title);
      } else {
        song = ALL_SONGS.find(s => s.id === songId && s.title === title);
      }
      if (song) Player.playSongThenShuffleRest(song, poolType);
    });
  });
}

function wireSongSearch() {
  const input = document.getElementById("songSearch");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const filtered = ALL_SONGS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.artist || "").toLowerCase().includes(q) ||
      s.playlistName.toLowerCase().includes(q)
    );
    document.getElementById("songListRoot").innerHTML =
      filtered.map((s, i) => songRow(s, i + 1, "all")).join("");
    wireSongRows();
    renderCurrentHighlight();
  });
}

function renderCurrentHighlight() {
  document.querySelectorAll(".song-row").forEach(row => {
    const isCurrent = Player.currentSong &&
      row.dataset.songId === Player.currentSong.id &&
      row.dataset.songTitle === Player.currentSong.title;
    row.classList.toggle("is-current", !!isCurrent);
  });
}
