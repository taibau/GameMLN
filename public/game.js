const socket = io();

// UI Elements
const screens = {
  setup: document.getElementById('setup-screen'),
  game: document.getElementById('game-screen')
};

let myTeamId = null;
let isHost = false;
let currentGameState = null;
let localQuestions = [];
window.appVersion = "v5";

// Icons mapping
const ICONS = {
  "Bầu": "🏺",
  "Cua": "🦀",
  "Tôm": "🦐",
  "Cá": "🐟",
  "Gà": "🐓",
  "Nai": "🦌"
};

// ----- SOCKET EVENTS -----

socket.on("init_state", (state) => {
  currentGameState = state;
  updateUI();
});

socket.on("init_questions", (qList) => {
  localQuestions = qList;
  if (isHost && document.getElementById("admin-modal").classList.contains("open")) {
    renderAdminQuestions();
  }
});

socket.on("player_answered", (data) => {
  if (isHost && currentGameState.phase === "answering") {
    const statusEl = document.getElementById("host-realtime-status");
    const answeredCount = Object.keys(currentGameState.roundAnswers).length;
    const totalCount = currentGameState.teams.length;
    statusEl.innerHTML = `<span style="background:#27ae60; color:#fff; padding:5px 15px; border-radius:20px; font-weight:bold; font-size:1.2rem;">✅ Đã chốt: ${answeredCount} / ${totalCount} đội</span>`;
  }
});

let oldPhase = null;

socket.on("state_update", (state) => {
  // Reset lựa chọn cược trên điện thoại khi sang vòng đặt cược mới
  if ((oldPhase === "setup" || oldPhase === "round_result") && state.phase === "betting") {
    mobileBets = [];
  }
  oldPhase = state.phase;
  currentGameState = state;
  updateUI();
});

socket.on("error_msg", (msg) => {
  showToast(msg, "error");
});

socket.on("log_added", (log) => {
  addLog(log.msg, log.type);
});

socket.on("dice_rolled", (data) => {
  showRollingDice(data);
});

socket.on("team_kicked", (data) => {
  if (!isHost && data.teamId === socket.id) {
    // Bị host xóa → về màn hình đăng ký
    alert("Bạn đã bị xóa khỏi phòng bởi Host!");
    // Reset về màn hình join
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens.join.classList.add("active");
    document.getElementById("mobile-player-view").classList.remove("active");
    document.getElementById("mobile-player-view").style.display = "none";
  }
});

socket.on("force_reload_if_old", (version) => {
  // Nếu client không có biến JS version mới nhất, lập tức tự tải lại trang
  if (window.appVersion !== version) {
    window.location.reload(true);
  }
});

socket.on("game_over", (data) => {
  if (typeof stopSuspenseSound === "function") stopSuspenseSound();

  // Đóng tất cả modal cũ trước
  ["round-result-modal", "question-modal", "admin-modal"].forEach(id => closeModal(id));

  const winner = data.winner;
  const leaderboard = data.leaderboard || [];

  // Ch\u1ec9 hi\u1ec3n th\u1ecb cho: Host, ho\u1eb7c \u0111\u1ed9i chi\u1ebfn th\u1eafng, ho\u1eb7c t\u1ea5t c\u1ea3 (host ph\u1ea3i th\u1ea5y b\u1ea3ng x\u1ebfp h\u1ea1ng)
  const isWinner = winner && socket.id === winner.id;
  const shouldShow = isHost || isWinner || true; // M\u1ecdi ng\u01b0\u1eddi \u0111\u1ec1u th\u1ea5y

  if (!shouldShow) return;

  // \u0110i\u1ec1n th\u00f4ng tin
  const nameEl = document.getElementById("winner-name");
  const subtitleEl = document.getElementById("winner-subtitle");

  if (isWinner) {
    nameEl.textContent = `🎉 ${winner.name} 🎉`;
    subtitleEl.textContent = "🏆 BẠN ĐÃ VÔ ĐỊCH! 🏆";
    nameEl.style.fontSize = "clamp(3rem,10vw,7rem)";
  } else if (winner) {
    nameEl.textContent = winner.name;
    subtitleEl.textContent = "🏆 VÔ ĐỊCH! CHÚC MỪNG! 🏆";
  } else {
    nameEl.textContent = "VÔ ĐỊCH";
    subtitleEl.textContent = "";
  }

  // B\u1ea3ng x\u1ebfp h\u1ea1ng
  const lb = document.getElementById("final-leaderboard");
  lb.innerHTML = `<h3 style="color:#f1c40f;margin-bottom:12px;font-size:1.3rem;">🏅 BXH CUỐI GAME</h3>` +
    leaderboard.map((t, i) => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;
           background:${i === 0 ? 'rgba(241,196,15,0.2)' : 'rgba(255,255,255,0.07)'};
           border:${i === 0 ? '1px solid #f1c40f' : '1px solid rgba(255,255,255,0.1)'};
           border-radius:12px;padding:8px 14px;">
        <span style="font-size:1.8rem;min-width:2rem;">${['🥇', '🥈', '🥉'][i] || `${i + 1}`}</span>
        <div style="width:32px;height:32px;border-radius:50%;background:${t.color};
             display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;font-size:0.9rem;">${t.sym}</div>
        <span style="flex:1;color:#fff;font-weight:bold;font-size:1.1rem;text-align:left;">${t.name}</span>
        <span style="color:#f1c40f;font-weight:bold;">Ô ${t.pos}/30</span>
      </div>
    `).join("");

  // M\u1edf modal
  const modal = document.getElementById("game-over-modal");
  modal.classList.add("active");

  // Phát nhạc Come My Way - Sơn Tùng M-TP
  const iframe = document.getElementById("my-way-audio");
  iframe.src = "https://www.youtube.com/embed/bx-6ESHmOHo?autoplay=1&start=0";
  iframe.style.display = "none";

  // Pháo hoa
  launchFireworks(winner ? winner.color : "#f1c40f");
});

function closeGameOverModal() {
  const modal = document.getElementById("game-over-modal");
  modal.classList.remove("active");
  // D\u1eebng nh\u1ea1c
  const iframe = document.getElementById("my-way-audio");
  iframe.src = "about:blank";
}

function launchFireworks(accentColor) {
  const canvas = document.getElementById("fireworks-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  function randomColor() {
    const colors = ["#f1c40f", "#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#e67e22", "#fff", accentColor || "#f1c40f"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function spawnFirework() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height * 0.65;
    const color = randomColor();
    const count = 70;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const speed = 3 + Math.random() * 5;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1, color, alpha: 1, size: 2.5 + Math.random() * 2.5, trail: [] });
    }
  }

  let frame = 0;
  function animate() {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (frame % 25 === 0) spawnFirework();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.vx *= 0.99;
      p.alpha -= 0.013;
      if (p.alpha <= 0) { particles.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 6; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill(); ctx.restore();
    }
    frame++;
    if (frame < 900) requestAnimationFrame(animate);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  animate();
}


socket.on("timer_tick", (timeLeft) => {
  const globalTimer = document.getElementById("global-timer-display");
  if (globalTimer) globalTimer.textContent = timeLeft + "s";
  const qTimer = document.getElementById("q-timer");
  if (qTimer) qTimer.textContent = timeLeft;
});

socket.on("round_finished", (data) => {
  if (isHost && !data.isGameOver) {
    stopSuspenseSound();
    playBellSound();
    closeModal("question-modal");
    const { correctTeams, wrongTeams, correctAns } = data;
    document.getElementById("rr-ans").textContent = correctAns;
    document.getElementById("rr-ans").style.fontSize = "1.5rem";
    document.getElementById("rr-correct").innerHTML = correctTeams.map(t => `<b>${t.name}</b> (+${t.steps} bước)`).join("<br>");
    document.getElementById("rr-wrong").innerHTML = wrongTeams.map(t => `<b>${t}</b>`).join("<br>");
    openModal("round-result-modal");
  } else if (data.isGameOver && isHost) {
    // Game kết thúc - chỉ phát âm thanh, không mở bảng kết quả vòng
    stopSuspenseSound();
    closeModal("question-modal");
  }

  // reset mobile buttons
  document.querySelectorAll(".btn-ans-mobile").forEach(b => {
    b.disabled = false;
    b.style.opacity = "1";
    b.style.border = "none";
    b.style.display = "block";
    b.style.position = "static";
    b.style.top = "auto";
    b.style.left = "auto";
    b.style.transform = "none";
    b.style.width = "auto";
    b.style.height = "auto";
    b.style.zIndex = "auto";
    b.style.fontSize = "3rem";
  });
});

socket.on("move_piece", (data) => {
  renderPieces();
});

// ----- UI UPDATES -----

function updateUI() {
  if (!currentGameState) return;

  // Switch screens
  if (currentGameState.phase === "setup") {
    screens.setup.classList.add("active");
    screens.game.classList.remove("active");
    document.getElementById("mobile-player-view").classList.remove("active");
    document.body.classList.remove("host-bg", "player-bg");
    renderLobby();
  } else {
    screens.setup.classList.remove("active");

    if (isHost) {
      document.body.classList.add("host-bg");
      document.body.classList.remove("player-bg");
      screens.game.classList.add("active");
      document.getElementById("mobile-player-view").classList.remove("active");
      document.getElementById("mobile-player-view").style.display = "none";

      const statusEl = document.getElementById("host-realtime-status");
      if (currentGameState.phase !== "answering") {
        statusEl.innerHTML = "";
      }

      if (document.getElementById('board').children.length === 0) {
        buildBoard();
      }
      document.getElementById("btn-admin-ingame").style.display = "block";
      renderGameSidebar();
      renderPieces();

      // Nếu vào vòng mới, tự đóng bảng kết quả cũ
      if (currentGameState.phase === "betting") {
        closeModal("round-result-modal");
      }

      // Mở modal câu hỏi trên màn hình host nếu tới phase trả lời
      if (currentGameState.phase === "answering" && currentGameState.currentQuestion) {
        closeModal("fireworks-modal"); // Phải đóng pháo bông trước khi show câu hỏi
        showQuestionModalHost();
      } else {
        closeModal("question-modal");
      }
    } else {
      document.body.classList.add("player-bg");
      document.body.classList.remove("host-bg");
      screens.game.classList.remove("active");
      document.getElementById("mobile-player-view").classList.add("active");
      document.getElementById("mobile-player-view").style.display = "block";
      renderMobilePlayerView();
    }
  }
}

function renderLobby() {
  const teams = currentGameState.teams;
  document.getElementById('team-count').textContent = teams.length;

  const list = document.getElementById("lobby-teams");
  list.innerHTML = "";
  teams.forEach(t => {
    const d = document.createElement("div");
    d.className = "team-card";
    d.style.position = "relative";
    d.innerHTML = `
      <div class="team-sym" style="background: ${t.color}">${t.sym}</div>
      <div style="font-weight: bold; margin-top: 10px;">${t.name}</div>
      ${isHost ? `<button onclick="kickTeam('${t.id}')" style="position:absolute; top:5px; right:5px; background:#e74c3c; color:#fff; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; font-weight:bold; font-size:14px;" title="Xóa khỏi phòng">×</button>` : ''}
    `;
    list.appendChild(d);
  });

  if (isHost) {
    document.getElementById('host-setup-controls').style.display = "block";
  } else {
    document.getElementById('host-setup-controls').style.display = "none";
  }
}

function kickTeam(teamId) {
  if (confirm("Xóa đội này khỏi phòng?")) {
    socket.emit("remove_team", teamId);
  }
}

function renderGameSidebar() {
  const teams = currentGameState.teams;

  // Danh sách đội
  const list = document.getElementById("game-teams-list");
  list.innerHTML = "";
  // Sắp xếp theo số ô từ cao xuống thấp
  const sortedTeams = [...teams].sort((a, b) => b.pos - a.pos);
  sortedTeams.forEach((t) => {
    const row = document.createElement("div");
    row.className = "team-row";
    row.innerHTML = `
      <div class="team-sym" style="background:${t.color}">${t.sym}</div>
      <div class="team-name">${t.name}</div>
      <div class="team-pos">Ô ${t.pos}</div>
      ${isHost ? `<button onclick="kickTeam('${t.id}')" style="background:#e74c3c; color:#fff; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:0.9rem; margin-left:5px;">❌</button>` : ''}
    `;
    list.appendChild(row);
  });

  // Action Buttons cho Host
  const controls = document.getElementById("action-controls");
  controls.innerHTML = "";

  if (currentGameState.phase === "betting") {
    controls.innerHTML = "<p style='font-size:1.2rem; text-align:center;'>Đang chờ các đội đặt cược...</p>";
  } else if (currentGameState.phase === "rolling_wait") {
    controls.innerHTML = `<button class="btn-action" style="font-size:1.5rem; padding: 20px;" onclick="socket.emit('roll_dice')">🎲 TUNG XÚC XẮC</button>`;
  } else if (currentGameState.phase === "rolling") {
    controls.innerHTML = "<p style='font-size:1.2rem; text-align:center;'>Đang tung xúc xắc...</p>";
  } else if (currentGameState.phase === "answering") {
    controls.innerHTML = "<p style='font-size:1.2rem; text-align:center;'>Các đội đang trả lời câu hỏi...</p>";
  } else if (currentGameState.phase === "round_result") {
    controls.innerHTML = "<p style='font-size:1.2rem; text-align:center;'>Đang hiển thị bảng kết quả vòng.</p>";
  } else if (currentGameState.phase === "over") {
    controls.innerHTML = "<h2>🎉 TRÒ CHƠI KẾT THÚC 🎉</h2>";
  }
}

// Biến lưu cược trên mobile
let mobileBets = [];

function renderMobilePlayerView() {
  const statusEl = document.getElementById("mobile-status");
  const controls = document.getElementById("mobile-action-controls");
  const betArea = document.getElementById("mobile-betting-area");
  const ansArea = document.getElementById("mobile-answer-area");
  const resultDisplay = document.getElementById("mobile-result-display");

  controls.innerHTML = "";
  betArea.style.display = "none";
  ansArea.style.display = "none";

  if (currentGameState.phase === "over") {
    statusEl.textContent = "🎉 TRÒ CHƠI KẾT THÚC 🎉";
    return;
  }

  if (currentGameState.phase === "betting") {
    statusEl.textContent = "ĐANG ĐẶT CƯỢC...";
    betArea.style.display = "block";
    document.querySelector("#mobile-betting-area h3").textContent = "CHỌN 3 LINH VẬT";
    document.querySelector(".baucua-grid").style.display = "grid";
    renderMobileSelectedBets();
    resultDisplay.innerHTML = ""; // Xóa pháo bông cũ
  } else if (currentGameState.phase === "rolling_wait") {
    statusEl.textContent = "CHỜ MÁY CHỦ TUNG XÚC XẮC";
    betArea.style.display = "block";
    document.querySelector(".baucua-grid").style.display = "none";
  } else if (currentGameState.phase === "rolling") {
    statusEl.textContent = "ĐANG TUNG XÚC XẮC...";
    betArea.style.display = "block";
    document.querySelector(".baucua-grid").style.display = "none";
  } else if (currentGameState.phase === "answering") {
    statusEl.textContent = "THỬ THÁCH TRÍ TUỆ!";
    ansArea.style.display = "block";
    resultDisplay.innerHTML = ""; // Ẩn pháo bông
  } else if (currentGameState.phase === "round_result") {
    statusEl.textContent = "KẾT QUẢ VÒNG CHƠI (Xem màn chiếu)";
  }
}

function addBet(icon) {
  // Nếu đã chọn rồi thì ấn lại sẽ là bỏ chọn (Toggle)
  if (mobileBets.includes(icon)) {
    mobileBets = mobileBets.filter(b => b !== icon);
    renderMobileSelectedBets();
    socket.emit("update_bet", mobileBets);
    return;
  }

  if (mobileBets.length < 3) {
    mobileBets.push(icon);
    renderMobileSelectedBets();
    socket.emit("update_bet", mobileBets);
  } else {
    showToast("Bạn đã chọn đủ 3 linh vật! Hãy ấn vào linh vật đã chọn ở trên để bỏ bớt.", "info");
  }
}

function renderMobileSelectedBets() {
  const container = document.getElementById("mobile-selected-bets");
  container.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const box = document.createElement("div");
    box.style.width = "50px";
    box.style.height = "50px";
    box.style.border = "2px dashed #ccc";
    box.style.borderRadius = "8px";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.fontSize = "2rem";

    if (mobileBets[i]) {
      box.textContent = ICONS[mobileBets[i]];
      box.style.border = "2px solid #e74c3c";
      box.style.background = "#fff";
      box.onclick = () => removeBet(i);
    }
    container.appendChild(box);
  }
}

function removeBet(idx) {
  mobileBets.splice(idx, 1);
  renderMobileSelectedBets();
  socket.emit("update_bet", mobileBets);
}

function submitAnswer(idx) {
  if (currentGameState.roundAnswers && currentGameState.roundAnswers[socket.id]) {
    showToast("Bạn đã chốt đáp án rồi!", "info");
    return;
  }
  const ans = ["A", "B", "C", "D"][idx];
  socket.emit("submit_answer", ans);

  // Vô hiệu hóa nút và đưa nút được chọn ra giữa màn hình
  document.querySelectorAll(".btn-ans-mobile").forEach((btn, i) => {
    if (i === idx) {
      btn.style.setProperty("position", "absolute", "important");
      btn.style.setProperty("top", "50%", "important");
      btn.style.setProperty("left", "50%", "important");
      btn.style.setProperty("transform", "translate(-50%, -50%)", "important");
      btn.style.setProperty("width", "90vw", "important");
      btn.style.setProperty("height", "60vh", "important");
      btn.style.setProperty("font-size", "8rem", "important");
      btn.style.setProperty("z-index", "9999", "important");
      btn.style.setProperty("border", "5px solid #fff", "important");
    } else {
      btn.style.setProperty("display", "none", "important");
    }
  });
}


// ----- BOARD (BẢN ĐỒ HÀNH TRÌNH) -----

// C\u1ea5u h\u00ecnh \u00f4 \u0111\u1eb7c bi\u1ec7t
const CELL_CONFIG = {
  1: { icon: '🚀', label: 'START', cls: 'start-cell' },
  5: { icon: '🌿', label: 'Rừng', cls: 'milestone-1' },
  10: { icon: '⚡', label: 'Bão', cls: 'milestone-2' },
  15: { icon: '🌟', label: 'Sao', cls: 'milestone-2' },
  20: { icon: '💎', label: 'Kho', cls: 'milestone-3' },
  25: { icon: '🔥', label: 'Núi', cls: 'milestone-3' },
  30: { icon: '🏆', label: 'ĐÍCH', cls: 'finish-cell' },
};

function buildBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  // T\u1ea1o 30 \u00f4 theo d\u1ea1ng zig-zag (h\u00e0ng l\u1ebb: tr\u00e1i→ph\u1ea3i, h\u00e0ng ch\u1eb5n: ph\u1ea3i→tr\u00e1i)
  let order = [];
  for (let r = 0; r < 5; r++) {
    let row = [];
    for (let c = 1; c <= 6; c++) row.push(r * 6 + c);
    if (r % 2 === 1) row.reverse();
    order.push(...row);
  }

  order.forEach((n, idx) => {
    const cfg = CELL_CONFIG[n] || {};
    const cell = document.createElement("div");
    cell.className = "cell " + (cfg.cls || "");
    cell.id = "cell-" + n;

    // X\u00e1c \u0111\u1ecbnh v\u00f9ng m\u00e0u n\u1ebfu kh\u00f4ng c\u00f3 class ri\u00eang
    if (!cfg.cls) {
      if (n <= 10) cell.style.background = "linear-gradient(145deg, #1a5c38, #0f3d25)";
      else if (n <= 20) cell.style.background = "linear-gradient(145deg, #1a3a6b, #0d2447)";
      else cell.style.background = "linear-gradient(145deg, #6b1a2a, #47101b)";
    }

    cell.innerHTML = `
      <div class="cell-num">${n}</div>
      <div class="cell-content">${cfg.icon || getCellDecorIcon(n)}</div>
      ${cfg.label ? `<div class="cell-label">${cfg.label}</div>` : ''}
      <div class="cell-pieces"></div>
    `;
    board.appendChild(cell);
  });
}

// Bi\u1ec3u t\u01b0\u1ee3ng trang tr\u00ed ng\u1eabu nhi\u00ean cho c\u00e1c \u00f4 th\u01b0\u1eddng
const DECO_ICONS = ['🌱', '🍃', '🌾', '🌸', '🌻', '🦋', '🐛', '⛺', '🗺️', '🧭', '💫', '✨', '🎋', '🍀'];
function getCellDecorIcon(n) {
  return DECO_ICONS[n % DECO_ICONS.length];
}

function renderPieces() {
  // X\u00f3a class has-piece kh\u1ecfi t\u1ea5t c\u1ea3 \u00f4
  document.querySelectorAll(".cell").forEach(c => c.classList.remove("has-piece"));
  document.querySelectorAll(".cell-pieces").forEach(e => e.innerHTML = "");

  currentGameState.teams.forEach(t => {
    const cell = document.getElementById("cell-" + t.pos);
    if (cell) {
      const p = document.createElement("div");
      p.className = "piece";
      p.style.background = t.color;
      p.title = t.name;
      p.textContent = t.sym;
      cell.querySelector(".cell-pieces").appendChild(p);
      cell.classList.add("has-piece");
    }
  });
}


// ----- MODALS & ACTIONS -----
function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}



function showQuestionModalHost() {
  const q = currentGameState.currentQuestion;
  if (!q) return;

  // Bật nhạc hồi hộp cho Host
  startSuspenseSound();

  document.getElementById("q-text").textContent = q.text;
  document.getElementById("q-result").textContent = "";
  document.getElementById("host-realtime-status").innerHTML = "";

  const opts = document.getElementById("q-options");
  opts.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "btn-option";
    // Tách nhãn A, B, C, D
    const label = opt.substring(0, 2);
    const content = opt.substring(2);
    btn.innerHTML = `<span class="opt-label">${label}</span> ${content}`;
    // Không cho bấm trên màn hình máy chiếu
    opts.appendChild(btn);
  });

  openModal("question-modal");
}

const facesMap = {
  "Bầu": "rotateX(0deg) rotateY(0deg)",    // front
  "Cua": "rotateX(0deg) rotateY(180deg)",  // back
  "Tôm": "rotateX(0deg) rotateY(-90deg)",  // right
  "Cá": "rotateX(0deg) rotateY(90deg)",    // left
  "Gà": "rotateX(-90deg) rotateY(0deg)",   // top
  "Nai": "rotateX(90deg) rotateY(0deg)"    // bottom
};

function showRollingDice(data) {
  const hostDisplay = document.getElementById("dice-result-display");
  const mobileDisplay = document.getElementById("mobile-result-display");

  const cubeHTML = `
    <div class="cube-container">
      <div class="cube spinning">
        <div class="cube-face front">🏺</div>
        <div class="cube-face back">🦀</div>
        <div class="cube-face right">🦐</div>
        <div class="cube-face left">🐟</div>
        <div class="cube-face top">🐓</div>
        <div class="cube-face bottom">🦌</div>
      </div>
    </div>
  `;

  hostDisplay.innerHTML = cubeHTML + cubeHTML + cubeHTML;
  mobileDisplay.innerHTML = cubeHTML + cubeHTML + cubeHTML;

  setTimeout(() => {
    [hostDisplay, mobileDisplay].forEach(display => {
      if (!display) return;
      const cubes = display.querySelectorAll('.cube');
      cubes.forEach((cube, i) => {
        cube.classList.remove('spinning');
        cube.style.transform = facesMap[data.results[i]];
      });
    });

    if (isHost) {
      setTimeout(() => {
        openModal("fireworks-modal");
      }, 800);
    } else {
      const myStats = data.allStats[socket.id];
      if (myStats) {
        setTimeout(() => {
          mobileDisplay.innerHTML = `
            <div class="fade-in-up" style="background: rgba(0,0,0,0.7); padding: 20px; border-radius: 12px; text-align:center;">
              <h2 style="font-size:2.5rem; color:#f1c40f;">🎉 TRÚNG ${myStats.matchCount} LINH VẬT 🎉</h2>
              <p style="color:#fff; font-size:1.5rem; margin-top:10px;">Nhận ${myStats.steps} bước (Nếu trả lời ĐÚNG)</p>
            </div>
          `;
        }, 800);
      }
    }
  }, 2000);
}

// ----- ADMIN LOGIC -----
document.getElementById("btn-admin").onclick = () => {
  openModal("admin-modal");
  renderAdminQuestions();
};

document.getElementById("btn-admin-ingame").onclick = () => {
  openModal("admin-modal");
  renderAdminQuestions();
};

function renderAdminQuestions() {
  const container = document.getElementById("admin-q-list");
  container.innerHTML = "";

  localQuestions.forEach((q, idx) => {
    addQuestionForm(q, idx);
  });
}

function addQuestionForm(q = null, idx = null) {
  const container = document.getElementById("admin-q-list");
  const isNew = !q;
  const qId = isNew ? "new_" + Date.now() : idx;

  if (isNew) {
    q = { text: "", options: ["", "", "", ""], ans: "A", exp: "" };
  }

  const div = document.createElement("div");
  div.className = "q-form-item";
  div.id = `qform_${qId}`;

  div.innerHTML = `
    <button class="btn-delete-q" onclick="document.getElementById('qform_${qId}').remove()">Xóa</button>
    <label><strong>Câu hỏi:</strong></label>
    <input type="text" class="inp-q-text" value="${q.text.replace(/"/g, '&quot;')}" placeholder="Nhập nội dung câu hỏi...">
    
    <label><strong>Đáp án:</strong></label>
    <div class="q-form-options">
      <div class="q-form-option-row">
        <input type="radio" name="ans_${qId}" value="A" ${q.ans === "A" ? "checked" : ""}> 
        <input type="text" class="inp-q-optA" value="${(q.options[0] || "").replace(/"/g, '&quot;')}" placeholder="Đáp án A">
      </div>
      <div class="q-form-option-row">
        <input type="radio" name="ans_${qId}" value="B" ${q.ans === "B" ? "checked" : ""}> 
        <input type="text" class="inp-q-optB" value="${(q.options[1] || "").replace(/"/g, '&quot;')}" placeholder="Đáp án B">
      </div>
      <div class="q-form-option-row">
        <input type="radio" name="ans_${qId}" value="C" ${q.ans === "C" ? "checked" : ""}> 
        <input type="text" class="inp-q-optC" value="${(q.options[2] || "").replace(/"/g, '&quot;')}" placeholder="Đáp án C">
      </div>
      <div class="q-form-option-row">
        <input type="radio" name="ans_${qId}" value="D" ${q.ans === "D" ? "checked" : ""}> 
        <input type="text" class="inp-q-optD" value="${(q.options[3] || "").replace(/"/g, '&quot;')}" placeholder="Đáp án D">
      </div>
    </div>
    
    <label style="display:block; margin-top:10px;"><strong>Giải thích (hiện ra sau khi trả lời):</strong></label>
    <textarea class="inp-q-exp" placeholder="Nhập lời giải thích...">${q.exp}</textarea>
  `;
  container.appendChild(div);
}

document.getElementById("btn-add-q").onclick = () => {
  addQuestionForm();
  const list = document.getElementById("admin-q-list");
  list.scrollTop = list.scrollHeight;
};

document.getElementById("btn-save-q").onclick = () => {
  const newQuestions = [];
  const forms = document.querySelectorAll(".q-form-item");

  let isValid = true;
  forms.forEach(form => {
    const text = form.querySelector(".inp-q-text").value.trim();
    const optA = form.querySelector(".inp-q-optA").value.trim();
    const optB = form.querySelector(".inp-q-optB").value.trim();
    const optC = form.querySelector(".inp-q-optC").value.trim();
    const optD = form.querySelector(".inp-q-optD").value.trim();
    const exp = form.querySelector(".inp-q-exp").value.trim();
    const checkedRadio = form.querySelector('input[type="radio"]:checked');

    if (!text || !optA || !optB || !optC || !optD || !checkedRadio) {
      isValid = false;
    } else {
      newQuestions.push({
        text,
        options: [optA, optB, optC, optD],
        ans: checkedRadio.value,
        exp
      });
    }
  });

  if (!isValid) {
    showToast("Vui lòng điền đầy đủ nội dung và chọn đáp án đúng cho TẤT CẢ câu hỏi!", "error");
    return;
  }

  if (newQuestions.length < 3) {
    showToast("Cần tối thiểu 3 câu hỏi để vận hành game!", "error");
    return;
  }

  socket.emit("update_questions", newQuestions);
  showToast("💾 Đã lưu Ngân hàng câu hỏi thành công!", "success");
  closeModal("admin-modal");
};

// ----- SETUP LOGIC -----
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
if (mode === "host") {
  document.getElementById("btn-be-player").style.display = "none";
} else if (mode === "player") {
  document.getElementById("btn-be-host").style.display = "none";
}

document.getElementById("btn-be-host").onclick = () => {
  const pwd = prompt("Nhập mật khẩu Máy Chủ (Host):");
  if (pwd !== "admin@6868") {
    alert("Sai mật khẩu!");
    return;
  }
  isHost = true;
  socket.emit("join_as_host", pwd);
  document.getElementById("role-selection").style.display = "none";
  document.getElementById("lobby-info-section").style.display = "block";
  document.getElementById("btn-admin").style.display = "block";
};

document.getElementById("btn-be-player").onclick = () => {
  isHost = false;
  document.getElementById("role-selection").style.display = "none";
  document.getElementById("join-form").style.display = "flex";
  document.getElementById("lobby-info-section").style.display = "block";
};

let selectedColor = "#e74c3c";
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.onclick = () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
    selectedColor = dot.getAttribute('data-color');
  }
});

document.getElementById("btn-join").onclick = () => {
  const name = document.getElementById("team-name").value.trim();
  if (!name) return showToast("Vui lòng nhập tên đội!", "error");
  socket.emit("join_game", { name, color: selectedColor });
  document.getElementById("join-form").style.display = "none";
  myTeamId = socket.id;
};

document.getElementById("btn-start").onclick = () => {
  const time = parseInt(document.getElementById("bet-time-input").value) || 30;
  socket.emit("start_betting", time);
};

// ----- UTILS -----

// ÂM THANH HOST (WEB AUDIO API)
let audioCtx = null;
let suspenseOsc = null;
let suspenseLfo = null;
let suspenseGain = null;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function startSuspenseSound() {
  try {
    initAudioContext();
    if (suspenseOsc) stopSuspenseSound();

    suspenseOsc = audioCtx.createOscillator();
    suspenseGain = audioCtx.createGain();

    // Tần số thấp tạo cảm giác hồi hộp (Tim đập / căng thẳng)
    suspenseOsc.type = "triangle";
    suspenseOsc.frequency.setValueAtTime(100, audioCtx.currentTime);

    // Thêm LFO tạo hiệu ứng ngân (vibrato)
    suspenseLfo = audioCtx.createOscillator();
    suspenseLfo.type = "sine";
    suspenseLfo.frequency.value = 6;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 5;

    suspenseLfo.connect(lfoGain);
    lfoGain.connect(suspenseOsc.frequency);
    suspenseLfo.start();

    // Volume fade-in
    suspenseGain.gain.setValueAtTime(0, audioCtx.currentTime);
    suspenseGain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 2);

    suspenseOsc.connect(suspenseGain);
    suspenseGain.connect(audioCtx.destination);

    suspenseOsc.start();
  } catch (e) { }
}

function stopSuspenseSound() {
  try {
    if (suspenseOsc) {
      // Fade out
      suspenseGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
      suspenseOsc.stop(audioCtx.currentTime + 0.5);
      if (suspenseLfo) suspenseLfo.stop(audioCtx.currentTime + 0.5);

      suspenseOsc = null;
      suspenseLfo = null;
      suspenseGain = null;
    }
  } catch (e) { }
}

function playBellSound() {
  try {
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Chuông reng reng báo hết giờ
    osc.type = "square";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 1.5);

    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
  } catch (e) { }
}

function showToast(msg, type = "info") {
  const c = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function addLog(msg, type) {
  const c = document.getElementById("logs-container");
  const d = document.createElement("div");
  d.className = `log-entry ${type}`;
  d.textContent = msg;
  c.insertBefore(d, c.firstChild);
}
