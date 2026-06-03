const io = require("socket.io-client");
const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Connected as", socket.id);
  socket.emit("join_game", { name: "TestTeam", sym: "1", color: "#ff0000" });
  
  setTimeout(() => {
    // Start game as host
    socket.emit("join_as_host", "admin@6868");
    setTimeout(() => {
      socket.emit("start_betting", 3); // 3 seconds
      
      // Update bet
      socket.emit("update_bet", ["Bầu", "Cua"]);
      console.log("Sent bet");
      
      setTimeout(() => {
        socket.emit("roll_dice");
        console.log("Rolled dice");
        
        setTimeout(() => {
          socket.emit("submit_answer", "A");
          console.log("Submitted A");
        }, 6000);
      }, 4000);
    }, 1000);
  }, 1000);
});

socket.on("dice_rolled", (data) => {
  console.log("Dice rolled:", data.results);
  console.log("My stats:", data.allStats[socket.id]);
});

socket.on("round_finished", (data) => {
  console.log("Round finished", data);
  process.exit(0);
});
