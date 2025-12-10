(() => {
  // ----- Configuration -----
  const ANS_WORDS = [
    "ronaldo","messi","neymar","griezmann","vini","raphinha","yamal","courtouis","mbappe","haaland","dias","stones","grealish","vicario","kane",
    "muller","kimmich","neuer","maguire","gundogan","debruyne","osimhen","musiala","bellingham","modric","donnaruma","buffon","jota","romero",
    "barella","mctominay","vandijk","trent","pulisic","zlatan","silva","chiesa","salah","suarez","rodrygo","doue","vitinha","gyokeres","timber",
    "gvardiol","kobel","lukaku","moura","udogie","palhinha","bale","porro","wirtz","allison","hazard","benzema","trossard","pedri","gavi","silva",
    "fernandes","maignan","kante","konate","carvajal","lewandowski","dembele","camavinga","palmer","sterling","tielemans","dimaria","vlahovic",
    "frimpong","saka","solanke","kulusevski","mcallister","estevao","depay","caicedo","richarlison","paqueta","bowen","areola","hojlund",
    "kubo","cancelo","goodman","eriksen","casimiro","coman","kvicha","xhaka","maddison","mbuemo"
  ].map(s => s.toLowerCase());

  const MAX_ATTEMPTS = 6;
  const FLIP_DURATION = 600;            // ms for full flip animation
  const FLIP_HALF = FLIP_DURATION / 2;
  const STAGGER = 300;                  // ms stagger between tiles on reveal

  // ----- State -----
  let solution = "";
  let wordLen = 0;
  let currentRow = 0;
  let currentCol = 0;
  let boardLocked = false;
  let keyColors = {}; // map uppercase letter -> "gray"|"yellow"|"green"

  // ----- DOM references -----
  const boardEl = document.getElementById("gameBoard");
  const playAgainBtn = document.getElementById("playAgainBtn");
  const trueAns = document.getElementById("trueAns");
  const resetBtn = document.getElementById("resetBtn");

  const popupBtn = document.getElementById("wordListBtn");
  const popupOverlay = document.getElementById("popupOverlay");
  const wordPopup = document.getElementById("wordPopup");
  const closePopup = document.getElementById("closePopup");
  const wordListBox = document.getElementById("wordList");
  const lengthFilter = document.getElementById("lengthFilter");
  const keyboardRoot = document.getElementById("keyboard");

  // ----- Helpers -----
  function rndSolution() {
    if (!ANS_WORDS.length) return "apple"; // fallback sample if none provided
    return ANS_WORDS[Math.floor(Math.random() * ANS_WORDS.length)];
  }
  function tileId(r, c) { return `tile-${r}-${c}`; }
  function rowId(r) { return `row-${r}`; }

  // ----- Build grid -----
  function buildGrid() {
    boardEl.innerHTML = "";
    // compute tile size based on word length (responsive)
    const tileSize = Math.min(64, Math.max(36, Math.floor(500 / Math.max(1, wordLen))));

    for (let r = 0; r < MAX_ATTEMPTS; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.id = rowId(r);

      for (let c = 0; c < wordLen; c++) {
        const t = document.createElement("div");
        t.className = "tile";
        t.id = tileId(r, c);
        t.style.width = `${tileSize}px`;
        t.style.height = `${tileSize}px`;
        t.style.fontSize = `${Math.floor(tileSize * 0.45)}px`;
        t.style.lineHeight = `${tileSize}px`;

        const letter = document.createElement("div");
        letter.className = "tileLetter";

        t.appendChild(letter);
        row.appendChild(t);
      }
      boardEl.appendChild(row);
    }
  }

  // ----- Build on-screen keyboard -----
  function buildKeyboard() {
    if (!keyboardRoot) return;
    keyboardRoot.innerHTML = "";

    const rows = [
      "QWERTYUIOP",
      "ASDFGHJKL",
      "ZXCVBNM"
    ];

    rows.forEach((row, idx) => {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";

      // For third row, include ENTER and BACKSPACE
      if (idx === 2) {
        const enter = document.createElement("button");
        enter.className = "key wide";
        enter.textContent = "ENTER";
        enter.dataset.key = "Enter";
        rowEl.appendChild(enter);
        enter.setAttribute("tabindex", "-1");
      }

      for (const ch of row) {
        const key = document.createElement("button");
        key.className = "key";
        key.textContent = ch;
        key.dataset.key = ch; // uppercase letter
        rowEl.appendChild(key);
        key.setAttribute("tabindex", "-1");
      }

      if (idx === 2) {
        const del = document.createElement("button");
        del.className = "key wide";
        del.textContent = "⌫";
        del.dataset.key = "Backspace";
        rowEl.appendChild(del);
        del.setAttribute("tabindex", "-1");
      }

      keyboardRoot.appendChild(rowEl);
    });
  }

  // ----- Keyboard color management -----
  // color priority: gray (1) < yellow (2) < green (3)
  const colorPriority = { gray: 1, yellow: 2, green: 3 };

  function upgradeKeyColor(letterUpper, color) {
    if (!letterUpper || !color) return;
    const cur = keyColors[letterUpper];
    if (!cur || colorPriority[color] > colorPriority[cur]) {
      keyColors[letterUpper] = color;
      const btn = document.querySelector(`.key[data-key="${letterUpper}"]`);
      if (btn) {
        btn.classList.remove("gray", "yellow", "green");
        btn.classList.add(color);
      }
    }
  }

  function resetKeyboardColors() {
    keyColors = {};
    document.querySelectorAll(".key").forEach(k => {
      k.classList.remove("gray", "yellow", "green");
    });
  }

  // ----- Read/Write tiles -----
  function readGuess(row) {
    let s = "";
    for (let c = 0; c < wordLen; c++) {
      const tile = document.getElementById(tileId(row, c));
      const letterEl = tile.querySelector(".tileLetter");
      s += (letterEl.textContent || "").toLowerCase();
    }
    return s;
  }

  function writeLetterAt(row, col, ch) {
    const tile = document.getElementById(tileId(row, col));
    if (!tile) return;
    const letterEl = tile.querySelector(".tileLetter");
    letterEl.textContent = ch.toUpperCase();
  }

  function clearLetterAt(row, col) {
    const tile = document.getElementById(tileId(row, col));
    if (!tile) return;
    const letterEl = tile.querySelector(".tileLetter");
    letterEl.textContent = "";
  }

  // ----- Wordle coloring logic -----
  function computeColorPattern(guess, answer) {
    const pattern = Array(wordLen).fill("gray");
    const a = answer.split("");
    const g = guess.split("");

    // green pass
    for (let i = 0; i < wordLen; i++) {
      if (g[i] === a[i]) {
        pattern[i] = "green";
        a[i] = null;
      }
    }

    // count remaining letters in answer
    const rem = {};
    for (let ch of a) {
      if (!ch) continue;
      rem[ch] = (rem[ch] || 0) + 1;
    }

    // yellow pass
    for (let i = 0; i < wordLen; i++) {
      if (pattern[i] === "green") continue;
      const ch = g[i];
      if (rem[ch] > 0) {
        pattern[i] = "yellow";
        rem[ch]--;
      }
    }

    return pattern;
  }

  // ----- Reveal animation for a row -----
  function revealRow(row, pattern) {
    return new Promise(resolve => {
      boardLocked = true;
      const tasks = [];

      for (let c = 0; c < wordLen; c++) {
        const tile = document.getElementById(tileId(row, c));
        const delay = c * STAGGER;

        const p = new Promise(resTile => {
          setTimeout(() => {
            // Add flip class which runs animation; after half-duration we set final color
            tile.classList.add("flip");

            setTimeout(() => {
              tile.classList.remove("flip");
              tile.classList.remove("green", "yellow", "gray");
              tile.classList.add(pattern[c]);
              tile.classList.add("revealed");

              // pop effect brief
              setTimeout(() => tile.classList.remove("revealed"), 180);
              resTile();
            }, FLIP_HALF);
          }, delay);
        });

        tasks.push(p);
      }

      Promise.all(tasks).then(() => {
        // small delay then unlock
        setTimeout(() => {
          boardLocked = false;
          resolve();
        }, 50);
      });
    });
  }

  // ----- End game -----
  function endGame() {
    currentRow = MAX_ATTEMPTS;
    boardLocked = true;
    playAgainBtn.style.display = "inline-block";
    trueAns.style.display = "inline-block";
    trueAns.textContent = `Correct Answer: ${solution.toUpperCase()}`;
  }

  // ----- Submit guess (called by keyboard enter or physical Enter) -----
  async function handleSubmit() {
    if (boardLocked) return;
    const guess = readGuess(currentRow);

    if (guess.length !== wordLen) {
      // optional visual invalid flash on row
      const rowEl = document.getElementById(rowId(currentRow));
      if (rowEl) {
        rowEl.classList.add("invalid");
        setTimeout(() => rowEl.classList.remove("invalid"), 400);
      }
      return;
    }

    const pattern = computeColorPattern(guess, solution);

    // Reveal row tiles (animation)
    await revealRow(currentRow, pattern);

    // Update keyboard colors according to guess
    for (let i = 0; i < guess.length; i++) {
      upgradeKeyColor(guess[i].toUpperCase(), pattern[i]);
    }

    if (guess === solution) {
      // Win
      setTimeout(() => {
        endGame();
      }, 50);
      return;
    }

    currentRow++;
    currentCol = 0;

    if (currentRow >= MAX_ATTEMPTS) {
      setTimeout(() => {
        endGame();
      }, 50);
    }
  }

  // ----- Popup / word-list logic (preserved from original) -----
  function buildFilterOptions() {
    const lengths = [...new Set(ANS_WORDS.map(w => w.length))].sort((a,b)=>a-b);
    lengthFilter.innerHTML = `<option value="all">All</option>`;
    lengths.forEach(len => {
      const opt = document.createElement("option");
      opt.value = len;
      opt.textContent = `${len} letters`;
      lengthFilter.appendChild(opt);
    });
  }

  function loadWordList() {
    const selected = lengthFilter.value;

    const byLength = {};
    ANS_WORDS.forEach(w => {
      const len = w.length;
      if (!byLength[len]) byLength[len] = [];
      byLength[len].push(w.toUpperCase());
    });

    let lengths = Object.keys(byLength).map(Number).sort((a,b)=>a-b);
    if (selected !== "all") lengths = lengths.filter(x => x == selected);

    let html = "";

    lengths.forEach(len => {
      html += `<h3 style="margin-top:18px; text-align:center;">${len}-Letter Words</h3>`;

      const sorted = byLength[len].sort();
      let curLetter = "";

      sorted.forEach(word => {
        const first = word[0];
        if (first !== curLetter) {
          curLetter = first;
          html += `<h4 style="margin:8px 0 4px; color:#8fd3ff;">${curLetter}</h4>`;
        }
        html += `<div>${word}</div>`;
      });
    });

    wordListBox.innerHTML = html;
  }

  popupBtn.addEventListener("click", () => {
    buildFilterOptions();
    loadWordList();
    popupOverlay.style.display = "block";
    wordPopup.style.display = "block";
  });

  lengthFilter.addEventListener("change", loadWordList);

  function closeWordPopup() {
    popupOverlay.style.display = "none";
    wordPopup.style.display = "none";
  }

  closePopup.addEventListener("click", closeWordPopup);
  popupOverlay.addEventListener("click", closeWordPopup);

  // ----- Handle physical keyboard input -----
  document.addEventListener("keydown", (e) => {
    if (boardLocked) return;
    if (currentRow >= MAX_ATTEMPTS) return;

    const key = (e.key || "").toString();

    // Backspace
    if (key === "Backspace" || key === "Delete") {
      if (currentCol > 0) {
        currentCol--;
        clearLetterAt(currentRow, currentCol);
      }
      return;
    }

    // Enter (allow different casings)
    if (key.toLowerCase() === "enter") {
      if (currentCol === wordLen) handleSubmit();
      return;
    }

    // Letters
    if (/^[a-zA-Z]$/.test(key)) {
      if (currentCol < wordLen) {
        writeLetterAt(currentRow, currentCol, key.toUpperCase());
        currentCol++;
      }
    }
  });

  // ----- Handle on-screen keyboard clicks/taps directly (avoid synthetic-keydown issues) -----
  if (keyboardRoot) {
    keyboardRoot.addEventListener("click", (ev) => {
  // --- FIX: prevent Enter activating previous key ---
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  // --------------------------------------------------

  const btn = ev.target.closest(".key");
  if (!btn) return;

      const datasetKey = btn.dataset.key;
      if (!datasetKey) return;

      // Handle special keys
      if (datasetKey === "Enter") {
        if (currentCol === wordLen) handleSubmit();
        return;
      }
      if (datasetKey === "Backspace") {
        if (currentCol > 0) {
          currentCol--;
          clearLetterAt(currentRow, currentCol);
        }
        return;
      }

      // Letter
      const letter = datasetKey.toString();
      if (/^[A-Z]$/.test(letter)) {
        if (currentCol < wordLen) {
          writeLetterAt(currentRow, currentCol, letter);
          currentCol++;
        }
      }
    });
  }

  // Also support touchstart to give immediate visual response (optional)
  // We won't add extra synthetic events; clicks are sufficient for taps.

  // ----- Start / Reset game -----
  function startGame() {
    solution = rndSolution();
    wordLen = solution.length;
    currentRow = 0;
    currentCol = 0;
    boardLocked = false;

    playAgainBtn.style.display = "none";
    trueAns.style.display = "none";

    buildGrid();
    buildKeyboard();
    resetKeyboardColors();
  }

  // Expose to global for your Play Again button
  window.startGame = startGame;

  // Wire reset button
  resetBtn.addEventListener("click", startGame);

  // Initialize on load
  startGame();
})();
