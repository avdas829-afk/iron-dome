/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Target, 
  Zap, 
  AlertTriangle, 
  Activity,
  Crosshair,
  RotateCcw
} from 'lucide-react';

// --- Types ---

interface Point {
  x: number;
  y: number;
}

interface GameState {
  health: number;
  score: number;
  isGameOver: boolean;
  level: number;
  missilesIntercepted: number;
}

// --- Constants ---

const CANVAS_WIDTH = 380;
const CANVAS_HEIGHT = 420;
const GROUND_HEIGHT = 40;
const BATTERY_X = CANVAS_WIDTH * 0.5;
const BATTERY_Y = CANVAS_HEIGHT - GROUND_HEIGHT;
const INTERCEPTOR_SPEED = 3.2;
const ENEMY_SPEED_MIN = 0.21;
const ENEMY_SPEED_MAX = 0.6125;
const EXPLOSION_MAX_RADIUS = 35;
const AUTO_FIRE_COOLDOWN = 450; // ms
const MAX_CONCURRENT_ENEMIES = 5;
const RADAR_RANGE = 600; // Large range for detection
const JET_RADAR_RANGE = 100;
const JET_FIRE_COOLDOWN = 1000;
const JET_ALTITUDE = 100;
const JET_SPEED = 1.5;

// --- Sound Manager ---

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private bgOsc: OscillatorNode | null = null;

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.3;
    this.startBackgroundDrone();
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain) {
      this.masterGain.gain.value = mute ? 0 : 0.3;
    }
  }

  private startBackgroundDrone() {
    if (!this.ctx || !this.masterGain) return;
    
    // Low ambient drone
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    
    gain.gain.value = 0.05;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    this.bgOsc = osc;

    // LFO for movement
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = 50;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  playLaunch() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playHit(isHeavy: boolean = false) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isHeavy ? 400 : 800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.5);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isHeavy ? 0.5 : 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  playRadar() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playJetFlyby(x: number) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    // Pan based on x position
    const pan = (x / CANVAS_WIDTH) * 2 - 1;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 100;

    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 1;

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.0);
  }
}

const soundManager = new SoundManager();

// --- Classes ---

class Missile {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  isEnemy: boolean;
  isAuto: boolean; // For interceptors: was it fired by AI?
  isFromJet: boolean;
  isBomber: boolean = false;
  isDetected: boolean = false;
  lockStartTime: number | null = null;
  exploded: boolean = false;
  trail: Point[] = [];
  maxTrailLength = 20;

  constructor(isEnemy: boolean, start: Point, target: Point, speed: number, isAuto: boolean = false, isFromJet: boolean = false, isBomber: boolean = false) {
    this.isEnemy = isEnemy;
    this.isAuto = isAuto;
    this.isFromJet = isFromJet;
    this.isBomber = isBomber;
    this.x = start.x;
    this.y = start.y;
    this.startX = start.x;
    this.startY = start.y;
    this.targetX = target.x;
    this.targetY = target.y;

    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    this.x += this.vx;
    this.y += this.vy;

    // Interceptor reached target
    if (!this.isEnemy) {
      const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);
      if (dist < 5) {
        this.exploded = true;
      }
    }

    // Enemy reached ground
    if (this.isEnemy && this.y >= BATTERY_Y) {
      this.exploded = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw trail
    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.strokeStyle = this.isEnemy ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 211, 238, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw missile body
    const angle = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);

    if (this.isBomber) {
      // Stealth Bomber (B-2 Style)
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      
      // Main Wing/Body (Flying Wing Design)
      ctx.fillStyle = '#1e293b'; // slate-800
      ctx.beginPath();
      ctx.moveTo(25, 0); // Nose
      ctx.lineTo(-10, 50); // Left Wing Tip
      ctx.lineTo(-5, 25); // Left outer notch
      ctx.lineTo(-15, 15); // Left inner notch
      ctx.lineTo(-5, 0); // Center rear
      ctx.lineTo(-15, -15); // Right inner notch
      ctx.lineTo(-5, -25); // Right outer notch
      ctx.lineTo(-10, -50); // Right Wing Tip
      ctx.closePath();
      ctx.fill();

      // Highlights/Panel lines
      ctx.strokeStyle = '#334155'; // slate-700
      ctx.lineWidth = 1;
      ctx.stroke();

      // Cockpit Area
      ctx.fillStyle = '#0f172a'; // slate-900
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(10, 6);
      ctx.lineTo(5, 0);
      ctx.lineTo(10, -6);
      ctx.closePath();
      ctx.fill();

      // Engine Intakes (Subtle)
      ctx.fillStyle = '#020617';
      ctx.fillRect(-5, -15, 8, 4);
      ctx.fillRect(-5, 11, 8, 4);

      ctx.shadowBlur = 0;
    } else {
      // Standard Missile Body
      ctx.fillStyle = this.isEnemy ? '#ef4444' : '#e2e8f0';
      ctx.fillRect(-6, -1.5, 12, 3);

      // Nose cone
      ctx.beginPath();
      ctx.moveTo(6, -1.5);
      ctx.lineTo(10, 0);
      ctx.lineTo(6, 1.5);
      ctx.closePath();
      ctx.fillStyle = this.isEnemy ? '#991b1b' : '#94a3b8';
      ctx.fill();

      // Fins
      ctx.fillStyle = this.isEnemy ? '#7f1d1d' : '#475569';
      ctx.fillRect(-6, -3, 2, 6);
    }
    
    // Engine glow
    if (!this.isEnemy) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#22d3ee';
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(-7, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#f97316';
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(-7, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // Draw Lock Cursor for detected enemies
    if (this.isEnemy && this.isDetected) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      const size = 10;
      ctx.strokeRect(this.x - size/2, this.y - size/2, size, size);
      
      // Corner accents
      ctx.beginPath();
      ctx.moveTo(this.x - size/2 - 2, this.y - size/2);
      ctx.lineTo(this.x - size/2 + 2, this.y - size/2);
      ctx.moveTo(this.x + size/2 - 2, this.y + size/2);
      ctx.lineTo(this.x + size/2 + 2, this.y + size/2);
      ctx.stroke();
      
      // "LOCKED" text
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('LOCK', this.x + size, this.y - size);
    }

    // Draw target marker for interceptors
    if (!this.isEnemy) {
      ctx.beginPath();
      ctx.arc(this.targetX, this.targetY, 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

class Explosion {
  x: number;
  y: number;
  radius: number = 0;
  maxRadius: number;
  life: number = 1.0;
  isEnemyImpact: boolean;
  isAuto: boolean;

  constructor(x: number, y: number, maxRadius: number, isEnemyImpact: boolean = false, isAuto: boolean = false) {
    this.x = x;
    this.y = y;
    this.maxRadius = maxRadius;
    this.isEnemyImpact = isEnemyImpact;
    this.isAuto = isAuto;
  }

  update() {
    if (this.radius < this.maxRadius) {
      this.radius += 2.5;
    } else {
      this.life -= 0.025;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    if (this.isEnemyImpact) {
      gradient.addColorStop(0, `rgba(239, 68, 68, ${this.life})`);
      gradient.addColorStop(1, `rgba(239, 68, 68, 0)`);
    } else {
      gradient.addColorStop(0, `rgba(251, 146, 60, ${this.life})`);
      gradient.addColorStop(0.7, `rgba(251, 146, 60, ${this.life * 0.5})`);
      gradient.addColorStop(1, `rgba(251, 146, 60, 0)`);
    }
    
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}

class FighterJet {
  x: number;
  y: number;
  vx: number = 0;
  vy: number = 0;
  angle: number = 0;
  lastFireTime: number = 0;
  
  // AI State
  targetX: number;
  targetY: number;
  state: 'patrol' | 'intercept' = 'patrol';
  maxSpeed: number = 2.5;
  turnSpeed: number = 0.1;
  lastFlybyTime: number = 0;

  constructor() {
    this.x = Math.random() * CANVAS_WIDTH;
    this.y = Math.random() * (BATTERY_Y - 40);
    this.targetX = Math.random() * CANVAS_WIDTH;
    this.targetY = Math.random() * (BATTERY_Y - 40);
  }

  update(enemies: Missile[]) {
    // AI Brain: Decision Making
    let closestLockedBomber: Missile | null = null;
    let minDist = Infinity;

    enemies.forEach(e => {
      if (e.isBomber && e.isDetected) {
        const dist = Math.hypot(e.x - this.x, e.y - this.y);
        if (dist < minDist) {
          minDist = dist;
          closestLockedBomber = e;
        }
      }
    });

    if (closestLockedBomber) {
      this.state = 'intercept';
      this.targetX = closestLockedBomber.x;
      this.targetY = closestLockedBomber.y;
    } else {
      this.state = 'patrol';
      // If reached patrol target, pick a new one
      const distToTarget = Math.hypot(this.targetX - this.x, this.targetY - this.y);
      if (distToTarget < 20) {
        this.targetX = Math.random() * CANVAS_WIDTH;
        this.targetY = Math.random() * (BATTERY_Y - 40);
      }
    }

    // Steering Logic
    const angleToTarget = Math.atan2(this.targetY - this.y, this.targetX - this.x);
    const targetVx = Math.cos(angleToTarget) * this.maxSpeed;
    const targetVy = Math.sin(angleToTarget) * this.maxSpeed;

    // Smoothly interpolate velocity
    this.vx += (targetVx - this.vx) * this.turnSpeed;
    this.vy += (targetVy - this.vy) * this.turnSpeed;

    const prevX = this.x;
    const prevY = this.y;
    this.x += this.vx;
    this.y += this.vy;

    // Bounds
    if (this.x < 0) this.x = 0;
    if (this.x > CANVAS_WIDTH) this.x = CANVAS_WIDTH;
    if (this.y < 20) this.y = 20;
    if (this.y > BATTERY_Y - 20) this.y = BATTERY_Y - 20;

    // Calculate rotation angle based on velocity
    this.angle = Math.atan2(this.y - prevY, this.x - prevX);

    // Play flyby sound periodically
    const now = Date.now();
    if (now - this.lastFlybyTime > 5000 + Math.random() * 5000) {
      soundManager.playJetFlyby(this.x);
      this.lastFlybyTime = now;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    
    // Main Wings
    ctx.fillStyle = '#64748b'; // slate-500
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(-12, -22);
    ctx.lineTo(-18, -22);
    ctx.lineTo(-8, -4);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(-12, 22);
    ctx.lineTo(-18, 22);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();

    // Jet body
    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.beginPath();
    ctx.moveTo(20, 0); // Nose
    ctx.lineTo(-5, -6);
    ctx.lineTo(-25, -6);
    ctx.lineTo(-30, 0);
    ctx.lineTo(-25, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    // Tail Fins
    ctx.fillStyle = '#475569'; // slate-600
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.lineTo(-28, -12);
    ctx.lineTo(-32, -12);
    ctx.lineTo(-28, -4);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-20, 4);
    ctx.lineTo(-28, 12);
    ctx.lineTo(-32, 12);
    ctx.lineTo(-28, 4);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.ellipse(8, 0, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#f97316';
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(-32, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    health: 100,
    score: 0,
    isGameOver: false,
    level: 1,
    missilesIntercepted: 0
  });
  
  const [shake, setShake] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const gameLoopRef = useRef<number>(null);
  const enemiesRef = useRef<Missile[]>([]);
  const interceptorsRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const jetRef = useRef<FighterJet>(new FighterJet());
  const lastAutoFireRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  const spawnEnemy = useCallback(() => {
    if (enemiesRef.current.length >= MAX_CONCURRENT_ENEMIES) return;

    const spawnRate = 0.01 + (gameState.level * 0.005);
    if (Math.random() < spawnRate) {
      const startX = Math.random() * CANVAS_WIDTH;
      const targetX = (CANVAS_WIDTH * 0.1) + (Math.random() * CANVAS_WIDTH * 0.8);
      const isBomber = Math.random() < 0.25; // 25% chance to be a bomber
      
      let speed = ENEMY_SPEED_MIN + (Math.random() * (ENEMY_SPEED_MAX - ENEMY_SPEED_MIN)) + (gameState.level * 0.005);
      if (isBomber) speed *= 0.6; // Bombers are slower but more dangerous visually

      enemiesRef.current.push(new Missile(
        true, 
        { x: startX, y: -20 }, 
        { x: targetX, y: BATTERY_Y }, 
        speed,
        false,
        false,
        isBomber
      ));
    }
  }, [gameState.level]);

  const fireInterceptor = useCallback((targetX: number, targetY: number, sourceX: number, sourceY: number = BATTERY_Y, isAuto: boolean = false, isFromJet: boolean = false) => {
    // Limit ground battery (Iron Dome) to 1 active projectile in flight
    if (sourceY === BATTERY_Y) {
      const activeGroundInterceptors = interceptorsRef.current.filter(m => m.startY === BATTERY_Y);
      if (activeGroundInterceptors.length >= 1) return;
    }

    interceptorsRef.current.push(new Missile(
      false,
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      INTERCEPTOR_SPEED,
      isAuto,
      isFromJet
    ));

    if (!isFromJet) {
      soundManager.playLaunch();
    }
  }, []);

  const runAI = useCallback(() => {
    const now = Date.now();
    
    // Jet AI
    const jet = jetRef.current;
    if (now - jet.lastFireTime > JET_FIRE_COOLDOWN) {
      let target: Missile | null = null;
      let minDist = Infinity;

      // Jet can ONLY target Bomber Planes (Enemy Jets) that are LOCKED
      enemiesRef.current.forEach(e => {
        if (!e.isBomber || !e.isDetected) return;

        const dist = Math.hypot(e.x - jet.x, e.y - jet.y);
        if (dist < 300) {
          if (dist < minDist) {
            minDist = dist;
            target = e;
          }
        }
      });

      if (target) {
        fireInterceptor(target.x, target.y, jet.x, jet.y, true, true);
        jet.lastFireTime = now;
      }
    }

    // Iron Dome Auto-Defense (Locked Missiles only, 3s delay)
    enemiesRef.current.forEach(e => {
      if (!e.isBomber && e.isDetected && e.lockStartTime && !e.exploded) {
        const lockDuration = now - e.lockStartTime;
        if (lockDuration >= 3000) {
          // Check if an auto-interceptor is already targeting this specific missile
          const alreadyTargeted = interceptorsRef.current.some(m => 
            m.isAuto && !m.isFromJet && m.targetX === e.x && m.targetY === e.y
          );

          if (!alreadyTargeted) {
            // Predict position
            const distToTarget = Math.hypot(e.x - BATTERY_X, e.y - BATTERY_Y);
            const travelTime = distToTarget / INTERCEPTOR_SPEED;
            const predictedX = e.x + (e.vx * travelTime);
            const predictedY = e.y + (e.vy * travelTime);
            fireInterceptor(predictedX, predictedY, BATTERY_X, BATTERY_Y, true);
          }
        }
      }
    });
  }, [fireInterceptor]);

  const update = useCallback(() => {
    if (gameState.isGameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    frameCountRef.current++;

    // Clear canvas
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)'; // slate-800
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Draw Ground
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, BATTERY_Y, CANVAS_WIDTH, GROUND_HEIGHT);
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 2;
    ctx.strokeRect(0, BATTERY_Y, CANVAS_WIDTH, GROUND_HEIGHT);

    // Draw Battery
    ctx.fillStyle = '#10b981'; // emerald-500
    ctx.beginPath();
    ctx.moveTo(BATTERY_X - 20, BATTERY_Y);
    ctx.lineTo(BATTERY_X + 20, BATTERY_Y);
    ctx.lineTo(BATTERY_X + 10, BATTERY_Y - 15);
    ctx.lineTo(BATTERY_X - 10, BATTERY_Y - 15);
    ctx.closePath();
    ctx.fill();

    spawnEnemy();
    
    // Update & Draw Jet
    const jet = jetRef.current;
    jet.update(enemiesRef.current);
    jet.draw(ctx);

    // Draw Radar Sweeps
    const sweepAngle = (frameCountRef.current * 0.002) % (Math.PI * 2);
    
    // Sweep
    ctx.beginPath();
    ctx.moveTo(BATTERY_X, BATTERY_Y);
    ctx.arc(BATTERY_X, BATTERY_Y, 600, sweepAngle, sweepAngle + 0.2);
    ctx.lineTo(BATTERY_X, BATTERY_Y);
    const radarGrad = ctx.createRadialGradient(BATTERY_X, BATTERY_Y, 0, BATTERY_X, BATTERY_Y, 600);
    radarGrad.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
    radarGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = radarGrad;
    ctx.fill();

    runAI();

    // Update & Draw Enemies
    enemiesRef.current.forEach((m, index) => {
      // Radar Detection Logic: Only lock when radar beam touches it
      const distToB = Math.hypot(m.x - BATTERY_X, m.y - BATTERY_Y);
      const angleToM = Math.atan2(m.y - BATTERY_Y, m.x - BATTERY_X);
      
      // Normalize angle to [0, 2PI]
      let normAngle = angleToM;
      while (normAngle < 0) normAngle += Math.PI * 2;
      
      const sweepEnd = (sweepAngle + 0.2) % (Math.PI * 2);
      
      let inSweep = false;
      if (sweepAngle < sweepEnd) {
        inSweep = normAngle >= sweepAngle && normAngle <= sweepEnd;
      } else {
        // Wrap around
        inSweep = normAngle >= sweepAngle || normAngle <= sweepEnd;
      }
      
      if (distToB < RADAR_RANGE && inSweep) {
        if (!m.isDetected) {
          m.isDetected = true;
          m.lockStartTime = Date.now();
          soundManager.playRadar();
        }
      }

      m.update();
      m.draw(ctx);

      if (m.exploded) {
        if (m.y >= BATTERY_Y) {
          explosionsRef.current.push(new Explosion(m.x, m.y, 60, true));
          setGameState(prev => ({ ...prev, health: Math.max(0, prev.health - 10) }));
          setShake(10);
          soundManager.playHit(true);
        }
        enemiesRef.current.splice(index, 1);
      }
    });

    // Update & Draw Interceptors
    interceptorsRef.current.forEach((m, index) => {
      m.update();

      // Collision Detection: Precise missile-to-missile contact
      enemiesRef.current.forEach((en) => {
        const dist = Math.hypot(en.x - m.x, en.y - m.y);
        const hitThreshold = en.isBomber ? 20 : 12; // Larger hit box for bombers

        if (dist < hitThreshold) { // Precise touch threshold
          // Jet shots can ONLY hit Bomber Planes
          if (m.isFromJet && !en.isBomber) return;
          
          // Ground shots (Iron Dome) can NOT hit Bomber Planes
          if (!m.isFromJet && en.isBomber) return;

          en.exploded = true;
          m.exploded = true;
          soundManager.playHit(en.isBomber);
          setGameState(prev => ({ 
            ...prev, 
            score: prev.score + 100,
            missilesIntercepted: prev.missilesIntercepted + 1
          }));
        }
      });

      m.draw(ctx);

      if (m.exploded) {
        explosionsRef.current.push(new Explosion(m.x, m.y, EXPLOSION_MAX_RADIUS, false, m.isAuto));
        interceptorsRef.current.splice(index, 1);
      }
    });

    // Update & Draw Explosions
    explosionsRef.current.forEach((e, index) => {
      e.update();
      e.draw(ctx);

      if (e.life <= 0) {
        explosionsRef.current.splice(index, 1);
      }
    });

    // Level up logic
    if (gameState.missilesIntercepted > 0 && gameState.missilesIntercepted % 10 === 0) {
      setGameState(prev => ({ 
        ...prev, 
        level: Math.floor(prev.missilesIntercepted / 10) + 1,
        missilesIntercepted: prev.missilesIntercepted + 1 
      }));
    }

    // Game Over check
    if (gameState.health <= 0 && !gameState.isGameOver) {
      setGameState(prev => ({ ...prev, isGameOver: true }));
    }

    gameLoopRef.current = requestAnimationFrame(update);
  }, [gameState.isGameOver, gameState.health, gameState.level, gameState.missilesIntercepted, spawnEnemy, runAI]);

  useEffect(() => {
    gameLoopRef.current = requestAnimationFrame(update);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [update]);

  useEffect(() => {
    if (shake > 0) {
      const timer = setTimeout(() => setShake(0), 100);
      return () => clearTimeout(timer);
    }
  }, [shake]);

  useEffect(() => {
    soundManager.setMute(isMuted);
  }, [isMuted]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (gameState.isGameOver) return;
    
    // Initialize sound on first click
    soundManager.init();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    
    // Fire from battery
    fireInterceptor(x, y, BATTERY_X, BATTERY_Y);
  };

  const resetGame = () => {
    setGameState({
      health: 100,
      score: 0,
      isGameOver: false,
      level: 1,
      missilesIntercepted: 0
    });
    enemiesRef.current = [];
    interceptorsRef.current = [];
    explosionsRef.current = [];
    frameCountRef.current = 0;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-mono overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Header HUD */}
      <div className="w-full max-w-[380px] flex flex-col gap-1 mb-3 px-1">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-emerald-500">
              <Shield className="w-4 h-4" />
              <span className="text-2xl font-black tracking-tighter">{gameState.health}%</span>
            </div>
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors"
            >
              {isMuted ? (
                <Zap className="w-4 h-4 text-slate-500" />
              ) : (
                <Zap className="w-4 h-4 text-emerald-500 fill-current" />
              )}
            </button>
          </div>
          <div className="text-2xl font-black text-white tabular-nums tracking-tight">
            {gameState.score.toLocaleString()}
          </div>
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
          <span>Threat Level {gameState.level}</span>
          <span>Interceptions {gameState.missilesIntercepted}</span>
        </div>
      </div>

      {/* Game Stage */}
      <div 
        className="relative border-2 border-slate-800 rounded-lg overflow-hidden shadow-2xl shadow-emerald-500/5 cursor-crosshair"
        style={{ 
          transform: `translate(${Math.random() * shake - shake/2}px, ${Math.random() * shake - shake/2}px)`,
          width: '380px',
          height: '420px'
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleCanvasClick}
          className="w-full h-full block"
        />

        {/* Game Over Overlay */}
        <AnimatePresence>
          {gameState.isGameOver && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-8"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="max-w-md"
              >
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-6" />
                <h2 className="text-5xl font-black text-white mb-2 tracking-tighter uppercase italic">City Fallen</h2>
                <p className="text-slate-400 mb-8 leading-relaxed">
                  The defensive perimeter has been breached. Strategic assets lost. 
                  Final Score: <span className="text-white font-bold">{gameState.score}</span>
                </p>
                <button 
                  onClick={resetGame}
                  className="group flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-8 py-4 rounded font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
                >
                  <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                  Re-Initialize System
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls Footer */}
      <div className="w-full max-w-[380px] mt-6 flex flex-col gap-3 px-1">
        <div className="flex justify-between items-center px-1 text-[9px] text-slate-500 uppercase tracking-widest font-bold">
          <div className="flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5" />
            Manual Control
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            System Ready
          </div>
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-emerald-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-cyan-500/20 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
