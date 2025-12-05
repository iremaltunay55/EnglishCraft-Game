import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- Types & Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

interface Entity {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlayerEntity extends Entity {
  speed: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  coins: number;
  dir: number; // 0: down, 1: up, 2: left, 3: right
  moving: boolean;
}

interface EnemyEntity extends Entity {
  spawned: boolean;
  alive: boolean;
  hp: number;
  maxHp: number;
  speed: number;
  floatOffset: number;
}

interface Question {
  q: string;
  a: string;
}

const QUESTIONS: Question[] = [
  { q: "Spell check: (a) recieve (b) receive", a: "receive" },
  { q: "Spell check: (a) definitely (b) definately", a: "definitely" },
  { q: "I ___ happy today. (am/is/are)", a: "am" },
  { q: "He ___ to the store yesterday. (go/went)", a: "went" },
  { q: "Opposite of 'Fast'?", a: "slow" },
  { q: "Plural of 'child'?", a: "children" },
  { q: "Which is a noun? (Blue / Run / Cat)", a: "cat" },
  { q: "Past tense of 'Run'?", a: "ran" },
  { q: "Sun is a ___ (Planet/Star)", a: "star" },
  { q: "We ___ watching TV. (was/were)", a: "were" }
];

const XP_LEVELS = [0, 50, 120, 220, 360];

// --- Main Game Component ---
const Game = () => {
  // -- React State for UI (HUD) --
  const [hudStats, setHudStats] = useState({ hp: 100, maxHp: 100, level: 1, xp: 0, coins: 0 });
  const [questText, setQuestText] = useState("Talk to Echo the Owl.");
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([
    { msg: "You wake up in the Forest of Basics.", type: "normal" },
    { msg: "Use arrow keys to move.", type: "normal" }
  ]);
  const [combatState, setCombatState] = useState<{ active: boolean; question: Question | null }>({ active: false, question: null });
  const [inputValue, setInputValue] = useState("");
  const [gameOver, setGameOver] = useState(false);

  // -- Refs for Game Loop Logic (Mutable state to avoid re-renders during loop) --
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Game World State Refs
  const gameState = useRef({
    state: 'PLAYING', // PLAYING, COMBAT, GAMEOVER
    questState: 0, // 0: Find Echo, 1: Kill Wraith, 2: Done
    cameraShake: 0,
    time: 0
  });

  const playerRef = useRef<PlayerEntity>({
    x: 400, y: 450, w: 32, h: 32,
    speed: 200, hp: 100, maxHp: 100, level: 1, xp: 0, coins: 0,
    dir: 0, moving: false
  });

  const echoRef = useRef<Entity>({ x: 350, y: 350, w: 30, h: 30 });

  const wraithRef = useRef<EnemyEntity>({
    x: 400, y: 200, w: 40, h: 50,
    hp: 60, maxHp: 60, speed: 40, floatOffset: 0,
    spawned: false, alive: false
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});

  // --- Helpers ---
  const addLog = (msg: string, type: string = "normal") => {
    setLogs(prev => [{ msg, type }, ...prev].slice(0, 10));
  };

  const getDistance = (e1: Entity, e2: Entity) => {
    const cx1 = e1.x + e1.w / 2;
    const cy1 = e1.y + e1.h / 2;
    const cx2 = e2.x + e2.w / 2;
    const cy2 = e2.y + e2.h / 2;
    return Math.sqrt(Math.pow(cx2 - cx1, 2) + Math.pow(cy2 - cy1, 2));
  };

  // --- Logic Functions ---
  const talkToEcho = () => {
    const game = gameState.current;
    if (game.questState === 0) {
      addLog("Echo: 'Hoo-hoo! The Silence Storm is here!'", "normal");
      addLog("Echo: 'Defeat the Spelling Wraith to save us!'", "reward");
      game.questState = 1;
      setQuestText("Quest: Defeat the Spelling Wraith.");
      
      const wraith = wraithRef.current;
      wraith.x = 400; wraith.y = 100;
      wraith.spawned = true; wraith.alive = true; wraith.hp = wraith.maxHp;
      addLog("A Spelling Wraith has materialized!", "damage");
    } else if (game.questState === 1) {
      addLog("Echo: 'The Wraith is dangerous. Be careful!'", "normal");
    } else {
      addLog("Echo: 'Great work, hero! The forest is safe.'", "reward");
    }
  };

  const startCombat = () => {
    gameState.current.state = 'COMBAT';
    const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    setCombatState({ active: true, question: q });
    setInputValue("");
  };

  const updateHud = () => {
    const p = playerRef.current;
    setHudStats({ hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp, coins: p.coins });
  };

  const checkLevelUp = () => {
    const p = playerRef.current;
    const nextLvl = XP_LEVELS[p.level];
    if (nextLvl && p.xp >= nextLvl) {
      p.level++;
      p.maxHp += 10;
      p.hp = p.maxHp;
      addLog(`LEVEL UP! You are now level ${p.level}.`, "reward");
    }
  };

  // --- Game Loop Update ---
  const update = (dt: number, time: number) => {
    const game = gameState.current;
    const player = playerRef.current;
    const wraith = wraithRef.current;
    const echo = echoRef.current;

    if (game.state === 'GAMEOVER') return;

    // Movement
    if (game.state === 'PLAYING') {
      player.moving = false;
      let dx = 0; 
      let dy = 0;
      const keys = keysRef.current;

      if (keys['ArrowUp']) { dy -= 1; player.dir = 1; }
      if (keys['ArrowDown']) { dy += 1; player.dir = 0; }
      if (keys['ArrowLeft']) { dx -= 1; player.dir = 2; }
      if (keys['ArrowRight']) { dx += 1; player.dir = 3; }

      if (dx !== 0 || dy !== 0) {
        player.moving = true;
        const len = Math.sqrt(dx*dx + dy*dy);
        dx /= len; dy /= len;
        player.x += dx * player.speed * dt;
        player.y += dy * player.speed * dt;
        
        // Clamp
        player.x = Math.max(10, Math.min(CANVAS_WIDTH - 30, player.x));
        player.y = Math.max(10, Math.min(CANVAS_HEIGHT - 30, player.y));
      }
    }

    // Wraith AI
    if (wraith.alive && game.state === 'PLAYING') {
      const dist = getDistance(player, wraith);
      wraith.floatOffset = Math.sin(time * 2) * 5;

      if (dist < 300 && dist > 50) {
        const angle = Math.atan2(player.y - wraith.y, player.x - wraith.x);
        wraith.x += Math.cos(angle) * wraith.speed * dt;
        wraith.y += Math.sin(angle) * wraith.speed * dt;
      }
    }

    // Camera Shake Decay
    if (game.cameraShake > 0) {
      game.cameraShake -= dt * 10;
      if (game.cameraShake < 0) game.cameraShake = 0;
    }
  };

  // --- Drawing ---
  const draw = (time: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const game = gameState.current;
    const player = playerRef.current;
    const wraith = wraithRef.current;
    const echo = echoRef.current;

    ctx.save();
    
    // Shake transform
    if (game.cameraShake > 0) {
      const dx = (Math.random() - 0.5) * game.cameraShake * 10;
      const dy = (Math.random() - 0.5) * game.cameraShake * 10;
      ctx.translate(dx, dy);
    }

    // 1. Background
    ctx.fillStyle = "#1e3a29";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#152e20"; // Subtle pattern
    for (let i = 0; i < CANVAS_WIDTH; i += 40) {
      for (let j = 0; j < CANVAS_HEIGHT; j += 40) {
        if ((i+j)%80 === 0) ctx.fillRect(i, j, 38, 38);
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Region: Forest of Basics", 10, 25);

    // 2. Draw Echo
    const ex = echo.x + 15;
    const ey = echo.y + 15;
    const ebounce = Math.sin(time * 3) * 2;
    
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(ex, echo.y + 35, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Body
    ctx.fillStyle = "#8d6e63"; 
    ctx.beginPath(); ctx.ellipse(ex, ey + ebounce, 15, 18, 0, 0, Math.PI * 2); ctx.fill();
    // Belly
    ctx.fillStyle = "#d7ccc8";
    ctx.beginPath(); ctx.ellipse(ex, ey + 5 + ebounce, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(ex - 6, ey - 5 + ebounce, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 6, ey - 5 + ebounce, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(ex - 6, ey - 5 + ebounce, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 6, ey - 5 + ebounce, 2, 0, Math.PI * 2); ctx.fill();
    // Beak
    ctx.fillStyle = "#ff9800";
    ctx.beginPath(); ctx.moveTo(ex - 3, ey + ebounce); ctx.lineTo(ex + 3, ey + ebounce); ctx.lineTo(ex, ey + 4 + ebounce); ctx.fill();

    // Echo Hint
    const echoDist = getDistance(player, echo);
    if (echoDist < 60 && game.state === 'PLAYING') {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("[E] Talk", ex, echo.y - 10 + ebounce);
    }

    // 3. Draw Wraith
    if (wraith.alive) {
      const wx = wraith.x; 
      const wy = wraith.y + wraith.floatOffset + wraith.h/2; // Center Y adjusted
      const wcx = wx + wraith.w/2;
      
      ctx.fillStyle = "rgba(80, 20, 80, 0.8)";
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.bezierCurveTo(wx, wy - 30, wx + wraith.w, wy - 30, wx + wraith.w, wy);
      ctx.lineTo(wx + wraith.w, wy + 20);
      for (let i = wx + wraith.w; i >= wx; i -= 5) {
         ctx.lineTo(i, wy + 20 + Math.sin(i * 0.5 + time * 10) * 5);
      }
      ctx.fill();

      // Eyes
      ctx.fillStyle = "#ff3333";
      ctx.shadowBlur = 10; ctx.shadowColor = "red";
      ctx.beginPath(); ctx.arc(wcx - 8, wy - 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(wcx + 8, wy - 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // HP Bar
      const hpPct = wraith.hp / wraith.maxHp;
      ctx.fillStyle = "#000"; ctx.fillRect(wx, wraith.y + wraith.floatOffset - 15, wraith.w, 6);
      ctx.fillStyle = "#d32f2f"; ctx.fillRect(wx+1, wraith.y + wraith.floatOffset - 14, (wraith.w-2)*hpPct, 4);

      // Wraith Hint
      const wraithDist = getDistance(player, wraith);
      if (wraithDist < 80 && game.state === 'PLAYING') {
        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("[SPACE] Attack", wcx, wy + 40);
      }
    }

    // 4. Draw Player
    const px = player.x + player.w/2;
    const py = player.y + player.h/2;
    const bob = player.moving ? Math.sin(time * 15) * 3 : 0;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(px, player.y + player.h + 2, player.w/1.5, 6, 0, 0, Math.PI * 2); ctx.fill();
    
    // Legs
    ctx.fillStyle = "#222";
    if (player.moving) {
      const legOffset = Math.sin(time * 20) * 5;
      ctx.fillRect(px - 8, player.y + player.h - 5, 6, 10 + legOffset);
      ctx.fillRect(px + 2, player.y + player.h - 5, 6, 10 - legOffset);
    } else {
      ctx.fillRect(px - 8, player.y + player.h - 5, 6, 10);
      ctx.fillRect(px + 2, player.y + player.h - 5, 6, 10);
    }
    // Body
    ctx.fillStyle = "#3498db";
    ctx.fillRect(player.x, player.y + 10 + bob, player.w, player.h - 10);
    // Head
    ctx.fillStyle = "#f1c27d";
    ctx.beginPath(); ctx.arc(px, player.y + 8 + bob, 12, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = "#000";
    if (player.dir === 2) ctx.fillRect(px - 8, player.y + 5 + bob, 3, 3);
    else if (player.dir === 3) ctx.fillRect(px + 5, player.y + 5 + bob, 3, 3);
    else { ctx.fillRect(px - 4, player.y + 6 + bob, 3, 3); ctx.fillRect(px + 1, player.y + 6 + bob, 3, 3); }

    // 5. Game Over
    if (game.state === 'GAMEOVER') {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#ff4444";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
    }

    ctx.restore();
  };

  const loop = (time: number) => {
    // Convert to seconds
    const sec = time / 1000;
    if (!gameState.current.time) gameState.current.time = sec;
    const dt = Math.min(sec - gameState.current.time, 0.1);
    gameState.current.time = sec;

    update(dt, sec);
    draw(sec);
    requestRef.current = requestAnimationFrame(loop);
  };

  // --- React Effects ---
  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);

    const onKD = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      const game = gameState.current;

      if (game.state === 'PLAYING') {
        if (e.code === 'KeyE') {
           const dist = getDistance(playerRef.current, echoRef.current);
           if (dist < 60) talkToEcho();
        }
        if (e.code === 'Space') {
          const wraith = wraithRef.current;
          if (wraith.alive && getDistance(playerRef.current, wraith) < 80) {
            startCombat();
          }
        }
      }
    };
    const onKU = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };

    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup', onKU);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('keydown', onKD);
      window.removeEventListener('keyup', onKU);
    };
  }, []);

  useEffect(() => {
    if (combatState.active && inputRef.current) {
      inputRef.current.focus();
    }
  }, [combatState.active]);

  const submitAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!combatState.question) return;

    const val = inputValue.trim().toLowerCase();
    const correct = combatState.question.a.toLowerCase();
    
    setCombatState({ active: false, question: null });
    gameState.current.state = 'PLAYING';

    if (val === correct) {
      // Correct
      const dmg = 20;
      wraithRef.current.hp -= dmg;
      addLog(`Correct! You blast the Wraith for ${dmg} damage.`, "reward");
      
      const p = playerRef.current;
      p.coins += 10;
      p.xp += 20;
      checkLevelUp();
      updateHud();

      if (wraithRef.current.hp <= 0) {
        wraithRef.current.alive = false;
        addLog("The Wraith dissolves into loose vowels!", "reward");
        addLog("Quest Complete! The Forest is safe.", "reward");
        gameState.current.questState = 2;
        setQuestText("Quest Complete: Forest Saved.");
      }
    } else {
      // Wrong
      const dmg = 15;
      playerRef.current.hp -= dmg;
      gameState.current.cameraShake = 5;
      addLog(`Wrong! Answer was '${correct}'.`, "damage");
      addLog(`The Wraith hits you for ${dmg} damage.`, "damage");
      updateHud();

      if (playerRef.current.hp <= 0) {
        playerRef.current.hp = 0;
        gameState.current.state = 'GAMEOVER';
        setGameOver(true);
        addLog("You have fallen. Refresh to try again.", "damage");
      }
    }
  };

  return (
    <>
      <h1 style={{ margin: '0 0 10px 0', color: '#4caf50', textShadow: '2px 2px #000', fontSize: '2rem' }}>EnglishCraft: Forest of Basics</h1>
      <p style={{ color: '#aaa', fontSize: '0.95rem', marginBottom: '15px' }}>
        <span style={{ color: '#fff', fontWeight: 'bold' }}>Arrows</span> to move. 
        <span style={{ color: '#fff', fontWeight: 'bold', marginLeft: '8px' }}>E</span> to talk to Echo. 
        <span style={{ color: '#fff', fontWeight: 'bold', marginLeft: '8px' }}>SPACE</span> to attack the Wraith.
      </p>

      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'flex-start', position: 'relative' }}>
        
        {/* Game Canvas */}
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
          style={{ backgroundColor: '#1a472a', border: '4px solid #444', borderRadius: '4px', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}
        />

        {/* Combat Overlay */}
        {combatState.active && combatState.question && (
          <div style={{
            position: 'absolute', top: '50%', left: '400px', transform: 'translate(-50%, -50%)',
            width: '350px', background: 'rgba(30, 30, 30, 0.95)', border: '3px solid #ffd700',
            padding: '20px', borderRadius: '10px', textAlign: 'center', zIndex: 100, boxShadow: '0 0 30px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#ffd700' }}>Word Magic Challenge</h3>
            <div style={{ fontSize: '18px', marginBottom: '15px', color: '#fff' }}>{combatState.question.q}</div>
            <form onSubmit={submitAnswer}>
              <input 
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoComplete="off" 
                placeholder="Type your answer..."
                style={{ width: '80%', padding: '10px', fontSize: '16px', borderRadius: '5px', border: 'none', marginBottom: '10px' }}
              />
              <div style={{ fontSize: '12px', color: '#aaa' }}>Press ENTER to cast spell</div>
            </form>
          </div>
        )}

        {/* HUD */}
        <div style={{ width: '320px', height: '500px', backgroundColor: '#2a2a2a', border: '2px solid #555', display: 'flex', flexDirection: 'column', padding: '15px', boxSizing: 'border-box', textAlign: 'left', borderRadius: '4px' }}>
          
          <div style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #444' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px', color: '#4caf50' }}>Forest of Basics</div>
            <StatRow label="Health" value={`${Math.max(0, hudStats.hp)} / ${hudStats.maxHp}`} />
            <StatRow label="Level" value={hudStats.level} />
            <StatRow label="XP" value={hudStats.xp} />
            <StatRow label="Coins" value={hudStats.coins} />
          </div>

          <div style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #444' }}>
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '5px' }}>CURRENT QUEST</div>
            <div style={{ color: '#ffd700', fontStyle: 'italic', fontSize: '14px' }}>{questText}</div>
          </div>

          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '5px' }}>ADVENTURE LOG</div>
            <div style={{ flexGrow: 1, background: '#111', border: '1px solid #444', padding: '8px', overflowY: 'auto', fontSize: '13px', fontFamily: 'monospace', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
              {logs.map((log, i) => (
                <div key={i} style={{ 
                  marginBottom: '6px', 
                  borderBottom: '1px solid #222', 
                  paddingBottom: '2px',
                  color: log.type === 'damage' ? '#ff6b6b' : log.type === 'reward' ? '#6bff84' : i === 0 ? '#ffffaa' : '#eee',
                  fontWeight: i === 0 ? 'bold' : 'normal'
                }}>
                  {i === 0 ? '> ' : ''}{log.msg}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

const StatRow = ({ label, value }: { label: string, value: string | number }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px' }}>
    <span style={{ color: '#888' }}>{label}</span>
    <span style={{ fontWeight: 'bold', color: '#fff' }}>{value}</span>
  </div>
);

const root = createRoot(document.getElementById('root')!);
root.render(<Game />);