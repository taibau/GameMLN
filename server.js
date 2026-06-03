const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware chống Cache: Ép trình duyệt luôn tải file mới nhất
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Expires', '-1');
  res.set('Pragma', 'no-cache');
  next();
});

// Phục vụ các file tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Trạng thái chung của game (Game State)
let gameState = {
  hostId: null,
  teams: [], // { id, name, pos, sym, color }
  phase: "setup", // setup, betting, rolling, answering, round_result, over
  roundBets: {}, // { teamId: ['Bầu', 'Cua'] }
  roundAnswers: {}, // { teamId: 'A' }
  pendingSteps: {}, // { teamId: 2 }
  currentQuestion: null,
  diceResult: [],
  timeLeft: 0,
  logs: []
};
let timerInterval = null;

const fallbackQuestions = [
  { text: "Theo quan điểm của chủ nghĩa Mác - Lênin, nguồn gốc sâu xa của sự xuất hiện Nhà nước là gì?", options: ["A. Sự xuất hiện của chế độ tư hữu và phân chia giai cấp đối kháng.", "B. Nhu cầu quản lý các công trình công cộng và thủy lợi.", "C. Ý chí và thế lực tối cao của một đấng siêu nhiên.", "D. Sự tự nguyện ký kết khế ước xã hội của các thành viên."], ans: "A", exp: "Sự phân hóa xã hội thành các giai cấp đối kháng do tư hữu xuất hiện là nguồn gốc kinh tế - xã hội sâu xa dẫn tới sự ra đời của Nhà nước." },
  { text: "Nhà nước có đặc trưng cơ bản nào phân biệt nó với các tổ chức xã hội khác?", options: ["A. Quản lý dân cư theo lãnh thổ, có bộ máy cưỡng chế chuyên nghiệp và thu thuế.", "B. Được thành lập tự nguyện bởi mọi thành viên trong xã hội.", "C. Không sử dụng bạo lực pháp lý trong việc quản lý xã hội.", "D. Chỉ hoạt động vì lợi ích cá nhân của giai cấp thống trị tối cao."], ans: "A", exp: "Quản lý dân cư theo phân chia lãnh thổ hành chính, thiết lập quyền lực công cộng đặc biệt (quân đội, cảnh sát) và thu thuế là 3 đặc trưng cơ bản." },
  { text: "Theo quan điểm Mác - Lênin, bản chất giai cấp của Nhà nước được hiểu như thế nào?", options: ["A. Nhà nước là công cụ chuyên chính của giai cấp này đối với giai cấp khác.", "B. Nhà nước là tổ chức trung lập điều hòa mọi mâu thuẫn xã hội.", "C. Nhà nước biểu trưng cho lợi ích chung, công bằng xã hội.", "D. Nhà nước là sản phẩm tự nhiên của sự đồng thuận xã hội."], ans: "A", exp: "Bản chất giai cấp của nhà nước biểu hiện ở chỗ nó là công cụ để duy trì sự thống trị và chuyên chính giai cấp." },
  { text: "Theo triết học Mác - Lênin, tương lai của Nhà nước sẽ như thế nào trong xã hội cộng sản?", options: ["A. Nhà nước sẽ tự tiêu vong khi giai cấp và bóc lột biến mất hoàn toàn.", "B. Nhà nước sẽ tồn tại vĩnh viễn cùng loài người.", "C. Nhà nước sẽ bị xóa bỏ bằng bạo lực của thế lực thần thánh.", "D. Nhà nước sẽ ngày càng mạnh lên và quản lý chặt chẽ hơn."], ans: "A", exp: "Mác - Lênin chỉ ra rằng khi xã hội không còn giai cấp, không còn đấu tranh giai cấp thì nhà nước sẽ tự tiêu vong." }
];

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseQuestionsFromMarkdown(content) {
  const normalized = (content || '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n(?=###\s*C[aâ]u\s*\d+)/i);
  const out = [];

  for (const block of blocks) {
    if (!/^###\s*C[aâ]u\s*\d+/i.test(block.trim())) continue;
    const body = block.replace(/^###\s*C[aâ]u\s*\d+\s*\n?/i, '').trim();
    const ansMatch = body.match(/\*\*\s*Đ[aá]p\s*[áa]n\s*:\s*([ABCD])\s*\*\*/i) || body.match(/Đ[aá]p\s*[áa]n\s*:\s*([ABCD])/i);
    const answer = ansMatch ? ansMatch[1].toUpperCase() : '';

    const cleanBody = body
      .replace(/^\s*\*\*\s*Đ[aá]p\s*[áa]n\s*:\s*[ABCD]\s*\*\*\s*$/gim, '')
      .replace(/^\s*Đ[aá]p\s*[áa]n\s*:\s*[ABCD]\s*$/gim, '')
      .trim();

    const optionsMap = { A: '', B: '', C: '', D: '' };
    const optionRegex = /^\s*([ABCD])\.\s*(.+)$/gim;
    let m;
    while ((m = optionRegex.exec(cleanBody)) !== null) {
      optionsMap[m[1].toUpperCase()] = `${m[1].toUpperCase()}. ${m[2].trim()}`;
    }

    const firstOptIndex = cleanBody.search(/^\s*[ABCD]\./m);
    const questionText = (firstOptIndex >= 0 ? cleanBody.slice(0, firstOptIndex) : '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!questionText || !optionsMap.A || !optionsMap.B || !optionsMap.C || !optionsMap.D || !answer) continue;
    out.push({ text: questionText, options: [optionsMap.A, optionsMap.B, optionsMap.C, optionsMap.D], ans: answer, exp: '' });
  }

  return out;
}

function loadQuestionsFromMarkdown() {
  const mdPath = path.join(__dirname, '60_cau_hoi_nha_nuoc_day_du.md');
  if (!fs.existsSync(mdPath)) return null;
  const parsed = parseQuestionsFromMarkdown(fs.readFileSync(mdPath, 'utf8'));
  if (!parsed.length) return null;
  return parsed;
}

let questions = loadQuestionsFromMarkdown() || fallbackQuestions;
let questionQueue = [];

function refillQuestionQueue() {
  questionQueue = shuffleArray(Array.from({ length: questions.length }, (_, i) => i));
}

function getRandomQuestion() {
  if (!questions.length) return null;
  if (!questionQueue.length) refillQuestionQueue();
  const idx = questionQueue.pop();
  return questions[idx];
}

function addLog(msg, type = "log-system") {
  gameState.logs.unshift({ msg, type });
  if (gameState.logs.length > 35) gameState.logs.pop();
  io.emit("log_added", { msg, type });
}

// Logic chính của Socket.io
io.on('connection', (socket) => {
  console.log('Một thiết bị đã kết nối:', socket.id);

  // Gửi trạng thái game ngay khi kết nối
  socket.emit("init_state", gameState);
  socket.emit("init_questions", questions);
  
  // Ép reload nếu trình duyệt đang xài cache cũ
  socket.emit("force_reload_if_old", "v6");

  // --- XỬ LÝ SỰ KIỆN TỪ CLIENT ---

  // 1. Setup phòng (Host hoặc người chơi gửi request join)
  socket.on("join_as_host", (pwd) => {
    if (pwd !== "admin@6868") {
      socket.emit("error_msg", "Sai mật khẩu Host!");
      return;
    }
    gameState.hostId = socket.id;
    io.emit("state_update", gameState);
    addLog("🖥️ Máy chủ đã kết nối và hiển thị màn hình chính.", "log-system");
  });

  socket.on("join_game", (teamData) => {
    if (gameState.phase !== "setup") {
      socket.emit("error_msg", "Trò chơi đã bắt đầu, không thể tham gia lúc này.");
      return;
    }
    if (gameState.teams.length >= 20) {
      socket.emit("error_msg", "Phòng đã đầy (Tối đa 20 đội).");
      return;
    }
    const newTeam = {
      id: socket.id,
      name: teamData.name,
      color: teamData.color,
      sym: (gameState.teams.length + 1).toString(),
      pos: 1,
      extra: 0,
      skip: 0
    };
    gameState.teams.push(newTeam);
    io.emit("state_update", gameState);
  });

  socket.on("remove_team", (teamId) => {
    const idx = gameState.teams.findIndex(t => t.id === teamId);
    if (idx !== -1) {
      const removedName = gameState.teams[idx].name;
      gameState.teams.splice(idx, 1);
      gameState.teams.forEach((t, i) => t.sym = (i + 1).toString());
      // Thông báo cho client bị kick
      io.emit("team_kicked", { teamId });
      io.emit("state_update", gameState);
      addLog(`❌ Đội "${removedName}" đã bị xóa khỏi phòng.`, "log-system");
    }
  });

  socket.on("start_betting", (timeLimit) => {
    if (gameState.teams.length < 1) {
      socket.emit("error_msg", "Chưa có đội nào tham gia!");
      return;
    }
    clearInterval(timerInterval);
    gameState.phase = "betting";
    gameState.roundBets = {};
    gameState.roundAnswers = {};
    gameState.pendingSteps = {};
    gameState.currentQuestion = null;
    gameState.diceResult = [];
    gameState.timeLeft = timeLimit || 30; // 30s default
    
    addLog(`⏳ Đã mở vòng cược (${gameState.timeLeft} giây). Các đội mau chóng chọn linh vật!`, "log-system");
    io.emit("state_update", gameState);

    timerInterval = setInterval(() => {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        clearInterval(timerInterval);
        gameState.phase = "rolling_wait";
        addLog(`🛑 Đã hết giờ cược! Hãy chờ Máy chủ tung xúc xắc.`, "log-system");
        io.emit("state_update", gameState);
      } else {
        io.emit("timer_tick", gameState.timeLeft);
      }
    }, 1000);
  });

  // 2. Nhận cược (Auto gửi khi bấm)
  socket.on("update_bet", (bets) => {
    if (gameState.phase !== "betting" && gameState.phase !== "rolling_wait") return;
    gameState.roundBets[socket.id] = bets;
  });

  // 3. Lắc Bầu Cua
  socket.on("roll_dice", () => {
    if (gameState.phase !== "rolling_wait") return;
    gameState.phase = "rolling"; // Để chặn các hành động khác
    
    const faces = ["Bầu", "Cua", "Tôm", "Cá", "Gà", "Nai"];
    let results = [];
    for (let i=0; i<3; i++) {
      results.push(faces[Math.floor(Math.random() * 6)]);
    }
    gameState.diceResult = results;

    // Tính steps cho từng đội
    gameState.teams.forEach(t => {
      let bets = gameState.roundBets[t.id] || [];
      let matchCount = 0;
      const normBets = bets.map(b => b.normalize("NFC"));
      results.forEach(r => {
        if (normBets.includes(r.normalize("NFC"))) matchCount++;
      });
      let steps = 1;
      if (matchCount === 2) steps = 2;
      if (matchCount === 3) steps = 3;
      gameState.pendingSteps[t.id] = { matchCount, steps };
      console.log(`[ROLL DICE] Team ${t.name} (id:${t.id}) - Bets: [${bets.join(', ')}], Match: ${matchCount}, Steps: ${steps}`);
    });

    addLog(`🎲 Xúc xắc đổ ra: ${results.join(" - ")}.`, "log-move");
    
    io.emit("dice_rolled", {
      results: results,
      allStats: gameState.pendingSteps
    }); 

    setTimeout(() => {
      // Tự động chuyển qua phase trả lời câu hỏi sau pháo bông (4s)
      gameState.phase = "answering";
      gameState.currentQuestion = getRandomQuestion();
      gameState.timeLeft = 20; // 20s
      addLog(`⏰ Bắt đầu 20s trả lời câu hỏi!`, "log-system");
      io.emit("state_update", gameState);

      timerInterval = setInterval(() => {
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
          clearInterval(timerInterval);
          processRoundResults();
        } else {
          io.emit("timer_tick", gameState.timeLeft);
        }
      }, 1000);
    }, 4000);
  });

  // 4. Cập nhật câu trả lời
  socket.on("submit_answer", (answer) => {
    console.log(`[SUBMIT ANSWER] Socket ${socket.id} submitted ${answer}, current phase: ${gameState.phase}`);
    if (gameState.phase !== "answering") return;
    // Chốt đáp án, không cho đổi
    if (!gameState.roundAnswers[socket.id]) {
      gameState.roundAnswers[socket.id] = answer;
      io.emit("player_answered", { teamId: socket.id }); // Báo Host
    }
  });

  function processRoundResults() {
    gameState.phase = "round_result";
    const q = gameState.currentQuestion;
    const correctAns = q.ans;
    const correctFull = q.options.find(o => o.startsWith(correctAns)) || correctAns;
    
    let correctTeams = [];
    let wrongTeams = [];

    gameState.teams.forEach(t => {
      let teamAns = gameState.roundAnswers[t.id];
      console.log(`[PROCESS RESULTS] Team ${t.name} (id:${t.id}) answered: ${teamAns}, Correct: ${correctAns}`);
      if (teamAns === correctAns) {
        let steps = (gameState.pendingSteps[t.id] || {steps:1}).steps;
        t.pos = Math.min(30, t.pos + steps);
        correctTeams.push({ name: t.name, steps: steps });
        if(t.pos >= 30) gameState.phase = "over";
      } else {
        wrongTeams.push(t.name);
      }
    });

    addLog(`✅ Đúng: ${correctTeams.length} đội. ❌ Sai/Không trả lời: ${wrongTeams.length} đội.`, "log-system");
    io.emit("round_finished", { correctTeams, wrongTeams, correctAns: correctFull, isGameOver: gameState.phase === "over" });
    io.emit("state_update", gameState);
    
    if (gameState.phase === "over") {
      clearInterval(timerInterval); // Dừng mọi timer
      setTimeout(() => {
        // Tìm đội chiến thắng (trên ô 30)
        const winner = gameState.teams.find(t => t.pos >= 30);
        const allSorted = [...gameState.teams].sort((a,b) => b.pos - a.pos);
        io.emit("game_over", {
          winner: winner ? { id: winner.id, name: winner.name, color: winner.color } : null,
          leaderboard: allSorted.map(t => ({ name: t.name, color: t.color, sym: t.sym, pos: t.pos }))
        });
      }, 2000); // Chờ 2s để hiển thị kết quả vòng trước
    }
  }

  // Chuyển tới phase setup thủ công
  socket.on("back_to_lobby", () => {
     gameState.phase = "setup";
     io.emit("state_update", gameState);
  });

  // Sự kiện apply_effect giữ nguyên cho Host chỉnh sửa
  socket.on("apply_effect", (data) => {
    // ... data.targetId (thay vì targetIdx)
    const target = gameState.teams.find(t => t.id === data.targetId);
    if(!target) return;
    if (data.kind === "back") target.pos = Math.max(1, target.pos - data.amount);
    else if (data.kind === "move_to") target.pos = data.to;
    io.emit("state_update", gameState);
  });

  // Cập nhật câu hỏi (Admin)
  socket.on("update_questions", (newQList) => {
    questions = newQList;
    questionQueue = [];
    io.emit("init_questions", questions);
  });

  // Reset Game
  socket.on("reset_game", () => {
    gameState.teams = [];
    gameState.phase = "setup";
    gameState.logs = [];
    io.emit("state_update", gameState);
  });

  socket.on('disconnect', () => {
    console.log('Thiết bị ngắt kết nối:', socket.id);
    // Xóa đội khỏi game khi mất kết nối
    const idx = gameState.teams.findIndex(t => t.id === socket.id);
    if (idx !== -1) {
      const removedName = gameState.teams[idx].name;
      gameState.teams.splice(idx, 1);
      gameState.teams.forEach((t, i) => t.sym = (i + 1).toString());
      io.emit("state_update", gameState);
      addLog(`⚠️ Đội "${removedName}" đã ngắt kết nối và bị xóa khỏi phòng.`, "log-system");
    }
    // Xóa Host nếu Host thoát
    if (gameState.hostId === socket.id) {
      gameState.hostId = null;
      console.log("Host đã ngắt kết nối!");
    }
  });
});



const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
