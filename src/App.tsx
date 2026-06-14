/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  RotateCcw,
  Volume2,
  VolumeX,
  RefreshCw
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

interface MapMarker {
  x: number;
  y: number;
  label: string;
  type: 'church' | 'mall' | 'mosque' | 'ruins' | 'market' | 'hospital' | 'hotel' | 'generic';
}

interface MapRoad {
  type: 'major' | 'minor';
  points: Point[];
  name?: string;
  trafficIntensity?: 'low' | 'medium' | 'high';
}

interface MapBuilding {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  roofDetail: 'H' | 'cross' | 'solar' | 'hatch' | 'none';
  label?: string;
  isHighValue?: boolean;
  hasPool?: boolean;
  poolX?: number;
  poolY?: number;
  poolW?: number;
  poolH?: number;
  carColor?: string;
  rotation?: number;
}

interface MapGreenZone {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'park' | 'water' | 'farmland_crops' | 'farmland_plowed' | 'desert_sand';
}

// --- Dynamic Dimensions (Responsive to Portables and Display Aspect Ratios) ---

let CANVAS_WIDTH = 380;
let CANVAS_HEIGHT = 600;
const GROUND_HEIGHT = 10;
let BATTERY_X = CANVAS_WIDTH * 0.5;
let BATTERY_Y = CANVAS_HEIGHT - GROUND_HEIGHT;
const INTERCEPTOR_SPEED = 3.2;
const ENEMY_SPEED_MIN = 1.0;
const ENEMY_SPEED_MAX = 2.0;
const EXPLOSION_MAX_RADIUS = 35;
const AUTO_FIRE_COOLDOWN = 450; // ms
const MAX_CONCURRENT_ENEMIES = 5;
const RADAR_RANGE = 600; // Large range for detection
const JET_RADAR_RANGE = 100;
const JET_FIRE_COOLDOWN = 1000;
const JET_ALTITUDE = 100;
const JET_SPEED = 1.5;

// --- Procedural Map Generator ---

function generateProceduralMap(width: number, height: number) {
  const greenZones: MapGreenZone[] = [];
  const _roads: MapRoad[] = [];
  const buildings: MapBuilding[] = [];
  const markers: MapMarker[] = [];

  // Helper inside to make Bezier
  const makeBezierCurve = (start: Point, ctrl1: Point, ctrl2: Point, end: Point, steps = 16): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * mt * start.x + 3 * mt * mt * t * ctrl1.x + 3 * mt * t * t * ctrl2.x + t * t * t * end.x;
      const y = mt * mt * mt * start.y + 3 * mt * mt * t * ctrl1.y + 3 * mt * t * t * ctrl2.y + t * t * t * end.y;
      pts.push({ x, y });
    }
    return pts;
  };

  // 1. Random Green Zones: count 5 to 7
  const gzTypes: Array<'park' | 'farmland_crops' | 'farmland_plowed' | 'desert_sand'> = ['park', 'farmland_crops', 'farmland_plowed', 'desert_sand'];
  const numZones = 5 + Math.floor(Math.random() * 3); 
  for (let i = 0; i < numZones; i++) {
    const type = gzTypes[Math.floor(Math.random() * gzTypes.length)];
    const gzW = 120 + Math.floor(Math.random() * 140);
    const gzH = 90 + Math.floor(Math.random() * 100);
    const gzX = Math.random() * (width - 120);
    const gzY = Math.random() * (height - 90);
    greenZones.push({ x: gzX, y: gzY, w: gzW, h: gzH, type });
  }

  // 2. Random curvy & winding roads
  const roadNamesPool = [
    "Olive Valley St", "Star Street", "Shepherds Rd", "Old City Walk",
    "Valley View Lane", "Winding Ridge", "Crestview Dr", "West Hill Pass",
    "Highland Path", "Crest Ridge Lane", "Sunset Way", "Breeze Boulevard",
    "Whispering Palms Road", "Citadel Bypass", "Grand Souk Alley", "Edom Pass",
    "Echo Gorge Rd", "Pine Ridge Trail", "Desert Oasis Way", "Ancient Gate St"
  ];
  const shuffledNames = [...roadNamesPool].sort(() => Math.random() - 0.5);
  
  const roadConfigs = [
    {
      start: { x: -40, y: height * (0.1 + Math.random() * 0.15) },
      ctrl1: { x: width * (0.1 + Math.random() * 0.1), y: height * (0.2 + Math.random() * 0.15) },
      ctrl2: { x: width * (0.2 + Math.random() * 0.15), y: height * (0.4 + Math.random() * 0.15) },
      end: { x: width * (0.45 + Math.random() * 0.15), y: height * (0.4 + Math.random() * 0.1) }
    },
    {
      start: { x: width * (0.42 + Math.random() * 0.1), y: height * (0.38 + Math.random() * 0.1) },
      ctrl1: { x: width * (0.65 + Math.random() * 0.15), y: height * (0.35 + Math.random() * 0.1) },
      ctrl2: { x: width * (0.7 + Math.random() * 0.15), y: height * (0.6 + Math.random() * 0.15) },
      end: { x: width + 40, y: height * (0.65 + Math.random() * 0.15) }
    },
    {
      start: { x: width * (0.2 + Math.random() * 0.2), y: height * (0.5 + Math.random() * 0.15) },
      ctrl1: { x: width * (0.45 + Math.random() * 0.15), y: height * (0.55 + Math.random() * 0.1) },
      ctrl2: { x: width * (0.5 + Math.random() * 0.2), y: height * (0.75 + Math.random() * 0.15) },
      end: { x: width * (0.6 + Math.random() * 0.25), y: height * (0.8 + Math.random() * 0.1) }
    },
    {
      start: { x: width * (0.05 + Math.random() * 0.1), y: -30 },
      ctrl1: { x: width * (0.2 + Math.random() * 0.1), y: height * (0.08 + Math.random() * 0.08) },
      ctrl2: { x: width * (0.7 + Math.random() * 0.1), y: height * (0.05 + Math.random() * 0.08) },
      end: { x: width * (0.85 + Math.random() * 0.1), y: -30 }
    }
  ];

  roadConfigs.forEach((config, idx) => {
    _roads.push({
      type: idx < 2 ? 'major' : 'minor',
      name: shuffledNames[idx % shuffledNames.length],
      trafficIntensity: idx % 2 === 0 ? 'medium' : 'low',
      points: makeBezierCurve(config.start, config.ctrl1, config.ctrl2, config.end)
    });
  });

  // 3. Dense clusters of stone houses
  const generateDenseCluster = (centerX: number, centerY: number, rx: number, ry: number, count: number, baseRot = 0) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()); 
      const bx = centerX + Math.cos(angle) * dist * rx;
      const by = centerY + Math.sin(angle) * dist * ry;

      if (by < 20 || by > height - 40 || bx < 10 || bx > width - 10) continue;

      const w = 9 + Math.floor(Math.random() * 8);
      const h = 8 + Math.floor(Math.random() * 8);

      const colorSeeds = [
        '#eae4d9', 
        '#dfd6c4', 
        '#cca590', 
        '#e5decf', 
        '#bebcb0', 
        '#bc8c72', 
        '#dcd4c5', 
        '#b5af9f'  
      ];
      const color = colorSeeds[Math.floor(Math.random() * colorSeeds.length)];
      const isHighValue = i % 18 === 0;

      const roofStyles: Array<'none' | 'cross' | 'solar' | 'hatch'> = ['none', 'cross', 'solar', 'hatch'];
      const roofDetail = roofStyles[i % roofStyles.length];

      const hasPool = !isHighValue && (i % 25 === 1);
      let poolX, poolY, poolW, poolH;
      if (hasPool) {
        poolW = 4 + (i % 3);
        poolH = 3 + (i % 2);
        poolX = bx + 1;
        poolY = by + h + 1;
      }

      const carColors = ['#f8fafc', '#dc2626', '#2563eb', '#ca8a04', '#475569'];
      const carColor = i % 10 === 0 ? carColors[i % carColors.length] : undefined;
      
      const rotation = baseRot + (Math.random() * 0.25 - 0.125);

      buildings.push({
        x: bx,
        y: by,
        w,
        h,
        color,
        roofDetail: isHighValue ? 'H' : roofDetail,
        isHighValue,
        hasPool,
        poolX,
        poolY,
        poolW,
        poolH,
        carColor,
        rotation
      });
    }
  };

  const numClusters = 4 + Math.floor(Math.random() * 3); 
  for (let c = 0; c < numClusters; c++) {
    const thetaIdx = c / numClusters;
    const regionX = width * (0.15 + 0.7 * (c % 2 === 0 ? 0.2 + 0.6 * Math.random() : 0.8 * Math.random()));
    const regionY = height * (0.12 + 0.68 * thetaIdx + 0.1 * Math.random());
    const rx = width * (0.12 + Math.random() * 0.12);
    const ry = height * (0.08 + Math.random() * 0.08);
    const density = 45 + Math.floor(Math.random() * 30); 
    const randomRotAngle = (Math.random() * 0.4 - 0.2) * Math.PI;
    generateDenseCluster(regionX, regionY, rx, ry, density, randomRotAngle);
  }

  // 4. Random Satellite Landmarks & Pins
  const sampleLandmarks = {
    church: [
      'St. Helena Basilica', 'Hermitage of Peace', 'Sovereign Abbey', 
      'Monastery of the Cross', 'Byzantine Sepulchre', 'Church of the Hills'
    ],
    mosque: [
      'Grand Dome Omar', 'Al-Amin Minaret', 'Peace Arch Masjid', 
      'Old Quarter Sanctuary', 'Khattab Pilgrim Mosque'
    ],
    ruins: [
      'Roman Columns Forum', 'Citadel Stone Ruins', 'Crusader Bastion Lookout',
      'Byzantine Vineyard Arch', 'Aqueduct Remains'
    ],
    market: [
      'Nomadic Craft Souk', 'Quarter Spice Marketplace', 'Bazaar Al-Jadeed',
      'Central Plaza Emporium', 'Grand Carpet Exchange'
    ],
    mall: [
      'Zion Heights Plaza', 'Terrace View Galleria', 'Dunes Retail Center',
      'Caronte Commerce District', 'Grand Oasis Atrium'
    ],
    hospital: [
      'St. Jude Trauma Clinic', 'Crescent Medical Base', 'Red Shield Base'
    ],
    hotel: [
      'Highland Summit Resort', 'Olive Ridge Inn', 'Golden Sands Lodge'
    ]
  };

  const selectedMarkerTypes = ['church', 'mosque', 'ruins', 'market', 'mall', 'hospital', 'hotel'];
  const shuffledTypes = [...selectedMarkerTypes].sort(() => Math.random() - 0.5);

  const activeMarkersCount = 3 + Math.floor(Math.random() * 3); 
  const minimumMarkerDistance = 110;
  
  for (let m = 0; m < activeMarkersCount; m++) {
    const mType = shuffledTypes[m % shuffledTypes.length] as 'church' | 'mosque' | 'ruins' | 'market' | 'mall' | 'hospital' | 'hotel';
    const namesList = sampleLandmarks[mType];
    const pinName = namesList[Math.floor(Math.random() * namesList.length)];
    
    let attempts = 0;
    let rx = 0, ry = 0;
    let coordsValid = false;
    
    while (!coordsValid && attempts < 15) {
      rx = width * (0.15 + Math.random() * 0.7);
      ry = height * (0.16 + Math.random() * 0.65);
      
      coordsValid = true;
      for (const existing of markers) {
        if (Math.hypot(existing.x - rx, existing.y - ry) < minimumMarkerDistance) {
          coordsValid = false;
          break;
        }
      }
      attempts++;
    }
    
    markers.push({
      x: rx,
      y: ry,
      label: pinName,
      type: mType
    });
  }

  return { greenZones, roads: _roads, buildings, markers };
}

// --- Sound Manager ---

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private bgOsc: OscillatorNode | null = null;
  private musicInterval: any = null;
  private musicStep = 0;

  init() {
    if (this.ctx) {
      this.resumeContext();
      return;
    }
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.95; // High, audible master volume
    this.startBackgroundDrone();
    this.startBackgroundMusic();
  }

  private resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain) {
      this.masterGain.gain.value = mute ? 0 : 0.95;
    }
    if (!mute) {
      this.resumeContext();
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
    
    gain.gain.value = 0.12; // Louder, more present ambient rumble

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    this.bgOsc = osc;

    // LFO for movement
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.12;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  private startBackgroundMusic() {
    if (!this.ctx || !this.masterGain) return;

    // A minor pentatonic scale notes (harmony roots)
    const progressions = [
      [110.00, 164.81, 220.00], // Am root chord
      [130.81, 196.00, 261.63], // C major root chord
      [146.83, 220.00, 293.66], // Dm root chord
      [164.81, 246.94, 329.63]  // Em root chord
    ];

    let currentProgIndex = 0;

    this.musicInterval = setInterval(() => {
      if (this.isMuted || !this.ctx) return;
      
      // Auto resume context if browser suspended it during idle
      this.resumeContext();
      if (this.ctx.state === 'suspended') return;

      const currentTime = this.ctx.currentTime;
      this.musicStep++;

      if (this.musicStep % 16 === 0) {
        currentProgIndex = (currentProgIndex + 1) % progressions.length;
      }

      const currentProg = progressions[currentProgIndex];

      // Deep sub bass step on beat - Boosted volume
      if (this.musicStep % 4 === 0) {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        const bassFilter = this.ctx.createBiquadFilter();

        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(currentProg[0] / 2, currentTime);

        bassFilter.type = 'lowpass';
        bassFilter.frequency.setValueAtTime(120, currentTime);

        bassGain.gain.setValueAtTime(0.25, currentTime); // Enhanced sub power
        bassGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.6);

        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(this.masterGain);

        bassOsc.start(currentTime);
        bassOsc.stop(currentTime + 0.6);
      }

      // Arpeggiated synthesizer line - Boosted volume
      const stepModulo = this.musicStep % 8;
      if (stepModulo === 0 || stepModulo === 2 || stepModulo === 4 || stepModulo === 6 || Math.random() < 0.25) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        const chordNote = currentProg[Math.floor(Math.random() * currentProg.length)];
        const octave = Math.random() < 0.35 ? 2 : 1;

        osc.type = Math.random() < 0.6 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(chordNote * octave, currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, currentTime);

        gain.gain.setValueAtTime(0.08, currentTime); // Clearer synth lead
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.35);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(currentTime);
        osc.stop(currentTime + 0.35);
      }

      // Tactical hi-hat/percussive click - Boosted volume
      if (this.musicStep % 2 === 1 && Math.random() < 0.6) {
        const hhBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.015, this.ctx.sampleRate);
        const hhData = hhBuffer.getChannelData(0);
        for (let i = 0; i < hhData.length; i++) {
          hhData[i] = Math.random() * 2 - 1;
        }

        const hhSource = this.ctx.createBufferSource();
        hhSource.buffer = hhBuffer;

        const hhFilter = this.ctx.createBiquadFilter();
        hhFilter.type = 'bandpass';
        hhFilter.frequency.setValueAtTime(7500, currentTime);

        const hhGain = this.ctx.createGain();
        hhGain.gain.setValueAtTime(0.015, currentTime); // Distinct, crisp hi-hat tick
        hhGain.gain.exponentialRampToValueAtTime(0.0001, currentTime + 0.015);

        hhSource.connect(hhFilter);
        hhFilter.connect(hhGain);
        hhGain.connect(this.masterGain);

        hhSource.start(currentTime);
      }
    }, 180);
  }

  playLaunch() {
    this.resumeContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.25);
    
    gain.gain.setValueAtTime(0.38, this.ctx.currentTime); // Highly audible launching swoosh
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playHit(isHeavy: boolean = false) {
    this.resumeContext();
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
    gain.gain.setValueAtTime(isHeavy ? 0.95 : 0.55, this.ctx.currentTime); // Massive responsive explosion feedback
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  playRadar() {
    this.resumeContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(0.28, this.ctx.currentTime); // Direct tactical radar lock feedback
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playJetFlyby(x: number) {
    this.resumeContext();
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
    gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 0.5); // Clear cinematic jet flyby
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
  requiredTaps: number = 0;
  currentTaps: number = 0;
  lockStartTime: number | null = null;
  exploded: boolean = false;
  trail: Point[] = [];
  maxTrailLength = 20;
  targetEnemy: Missile | null = null;
  baseSpeed: number = 0;
  wanderTargetX: number = 0;
  wanderTargetY: number = 0;

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
    this.baseSpeed = speed;

    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    if (this.isBomber) {
      // Slow bomber speed (0.4 to 0.8), tap count is between 3 and 6
      const minS = 0.4;
      const maxS = 0.8;
      const t = 3 + ((speed - minS) / (maxS - minS || 1)) * 3;
      this.requiredTaps = Math.max(3, Math.min(6, Math.round(t)));
      
      // Initialize wandering targets for free aesthetic flight path
      this.wanderTargetX = Math.random() * CANVAS_WIDTH;
      this.wanderTargetY = start.y + 30 + Math.random() * 40;
    }
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    // Dynamic flight behavior for Bomber plane (moves freely like fighter jet)
    if (this.isEnemy && this.isBomber) {
      const distToTarget = Math.hypot(this.wanderTargetX - this.x, this.wanderTargetY - this.y);
      if (distToTarget < 30 || Math.random() < 0.008) {
        this.wanderTargetX = 40 + Math.random() * (CANVAS_WIDTH - 80);
        // Slowly drift downwards as part of their looming assault profile
        const descentProgress = 35 + Math.random() * 25;
        this.wanderTargetY = Math.min(BATTERY_Y + 5, this.wanderTargetY + descentProgress);
      }

      const angleToTarget = Math.atan2(this.wanderTargetY - this.y, this.wanderTargetX - this.x);
      const targetVx = Math.cos(angleToTarget) * this.baseSpeed;
      const targetVy = Math.sin(angleToTarget) * this.baseSpeed;

      // Smooth steering interpolation (exactly identical structure to jet logic)
      const turnSpeed = 0.04;
      this.vx += (targetVx - this.vx) * turnSpeed;
      this.vy += (targetVy - this.vy) * turnSpeed;
    }

    // Dynamic Homing Track behavior for interceptor missiles
    if (!this.isEnemy) {
      if (this.targetEnemy && !this.targetEnemy.exploded && this.targetEnemy.y < BATTERY_Y) {
        this.targetX = this.targetEnemy.x;
        this.targetY = this.targetEnemy.y;
      }
      
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);

      const angle = Math.atan2(dy, dx);
      let speed = this.baseSpeed;

      if (this.targetEnemy) {
        const enemySpeed = Math.hypot(this.targetEnemy.vx, this.targetEnemy.vy);
        // Automatically speed up dynamically to catch fast/difficult targets
        speed = Math.max(this.baseSpeed, enemySpeed * 1.5 + 1.2);
        
        // Boost speed if far away to close the gap rapidly
        if (dist > 150) {
          speed *= 1.35;
        }
      }

      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
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
      ctx.font = 'bold 10px monospace';
      ctx.fillText('LOCKED', this.x + size, this.y - size);
    } else if (this.isBomber && !this.isDetected && this.currentTaps > 0) {
      // Draw tap progress
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`TAP ${this.currentTaps}/${this.requiredTaps}`, this.x + 15, this.y - 15);
      
      // Ring progress
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.arc(this.x, this.y, 15, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * (this.currentTaps / this.requiredTaps)));
      ctx.stroke();
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
    this.x = 40 + Math.random() * (CANVAS_WIDTH - 80);
    this.y = 40 + Math.random() * (BATTERY_Y - 80);
    this.targetX = 40 + Math.random() * (CANVAS_WIDTH - 80);
    this.targetY = 40 + Math.random() * (BATTERY_Y - 80);
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
        this.targetX = 40 + Math.random() * (CANVAS_WIDTH - 80);
        this.targetY = 40 + Math.random() * (BATTERY_Y - 80);
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
  const [dimensions, setDimensions] = useState({ width: 380, height: 600 });
  const mapDataRef = useRef<{
    roads: MapRoad[];
    buildings: MapBuilding[];
    greenZones: MapGreenZone[];
    markers: MapMarker[];
  }>({ roads: [], buildings: [], greenZones: [], markers: [] });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth || 380;
      const h = window.innerHeight || 600;
      const aspect = w / h;
      
      const height = 600;
      const width = Math.round(height * aspect);
      
      CANVAS_WIDTH = width;
      CANVAS_HEIGHT = height;
      BATTERY_X = width * 0.5;
      BATTERY_Y = height - GROUND_HEIGHT;
      
      const { greenZones, roads, buildings, markers } = generateProceduralMap(width, height);
      mapDataRef.current = { greenZones, roads, buildings, markers };
      setDimensions({ width, height });
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const [gameState, setGameState] = useState<GameState>({
    health: 100,
    score: 0,
    isGameOver: false,
    level: 1,
    missilesIntercepted: 0
  });

  const gameStateRef = useRef<GameState>(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  
  const [shake, setShake] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const gameLoopRef = useRef<number>(null);
  const enemiesRef = useRef<Missile[]>([]);
  const interceptorsRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const jetRef = useRef<FighterJet>(new FighterJet());
  const lastAutoFireRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);

  const spawnEnemy = useCallback(() => {
    if (enemiesRef.current.length >= MAX_CONCURRENT_ENEMIES) return;

    const currentLevel = gameStateRef.current.level;
    const spawnRate = 0.01 + (currentLevel * 0.005);
    if (Math.random() < spawnRate) {
      const startX = Math.random() * CANVAS_WIDTH;
      const targetX = (CANVAS_WIDTH * 0.1) + (Math.random() * CANVAS_WIDTH * 0.8);
      const isBomber = Math.random() < 0.25; // 25% chance to be a bomber
      
      let speed;
      if (isBomber) {
        // "now this time slow the speed of bomber"
        speed = 0.4 + Math.random() * 0.4 + (currentLevel * 0.002);
      } else {
        // Regular red missile speed
        speed = ENEMY_SPEED_MIN + (Math.random() * (ENEMY_SPEED_MAX - ENEMY_SPEED_MIN)) + (currentLevel * 0.005);
      }

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
  }, []);

  const fireInterceptor = useCallback((targetX: number, targetY: number, sourceX: number, sourceY: number = BATTERY_Y, isAuto: boolean = false, isFromJet: boolean = false) => {
    // Limit ground battery (Iron Dome) to 1 active projectile in flight
    if (sourceY === BATTERY_Y) {
      const activeGroundInterceptors = interceptorsRef.current.filter(m => m.startY === BATTERY_Y);
      if (activeGroundInterceptors.length >= 1) return;
    }

    const m = new Missile(
      false,
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      INTERCEPTOR_SPEED,
      isAuto,
      isFromJet
    );

    // Dynamic Homing: Find closest active enemy to target coordinates
    let bestEnemy: Missile | null = null;
    let bestDist = Infinity;
    enemiesRef.current.forEach(e => {
      if (!e.exploded && e.y < BATTERY_Y) {
        if (isFromJet && !e.isBomber) return;
        if (!isFromJet && e.isBomber && !e.isDetected) return; // Only lock on detected bombers from ground

        const dist = Math.hypot(e.x - targetX, e.y - targetY);
        // Generous lock matching range
        if (dist < bestDist) {
          bestDist = dist;
          bestEnemy = e;
        }
      }
    });

    if (bestEnemy) {
      m.targetEnemy = bestEnemy;
      m.targetX = bestEnemy!.x;
      m.targetY = bestEnemy!.y;
    }

    interceptorsRef.current.push(m);

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

  const update = useCallback((timestamp: number = performance.now()) => {
    if (gameStateRef.current.isGameOver) return;

    // Throttle loop updates to ~60 FPS standard so game speed is identical
    // across all high-refresh rates (e.g., 60Hz/90Hz/120Hz on Poco X5 Pro 5G)
    const elapsed = timestamp - lastUpdateTimeRef.current;
    if (lastUpdateTimeRef.current !== 0 && elapsed < 16.3) {
      gameLoopRef.current = requestAnimationFrame(update);
      return;
    }
    lastUpdateTimeRef.current = timestamp - (elapsed % 16.67);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    frameCountRef.current++;

    // Clear canvas with beautiful warm satellite desert dirt loam tone
    ctx.fillStyle = '#cac1ab'; // Sun-baked loam beige
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // --- DRAW DETAILED TOP-DOWN SATELLITE MAP BACKGROUND ---
    const map = mapDataRef.current || { greenZones: [], roads: [], buildings: [], markers: [] };

    // Velocity sliding offset based on simulation frames
    const scrollSpeed = 0.95;
    const scrollHeight = 600;
    const scrollOffset = (frameCountRef.current * scrollSpeed) % scrollHeight; 

    // Helper to draw the unified battlefield coordinate system at a specific scrolling Y offset
    const drawBattlefieldLayer = (offsetY: number) => {
      // 1. Draw Green Terraces, Hill Orchards, Farmland & Crops
      map.greenZones.forEach(gz => {
        const gzYScrolled = gz.y + offsetY;
        
        // Skip drawing if outside vertical viewport boundaries (with cushion)
        if (gzYScrolled + gz.h < -40 || gzYScrolled > BATTERY_Y + 120) return;

        if (gz.type === 'park') {
          // Olive grove orchards (typical of landscape)
          ctx.fillStyle = '#617c58'; 
          ctx.fillRect(gz.x, gzYScrolled, gz.w, gz.h);
          
          // Draw individual olive trees as small clustered rings
          ctx.fillStyle = '#395332';
          for (let tx = gz.x + 6; tx < gz.x + gz.w - 4; tx += 10) {
            const shift = (tx * 7) % 5;
            for (let ty = gzYScrolled + 6; ty < gzYScrolled + gz.h - 4; ty += 10) {
              ctx.beginPath();
              ctx.arc(tx + shift, ty + (shift % 3), 3, 0, Math.PI * 2);
              ctx.fill();
              
              // Highlight of tree foliage top
              ctx.fillStyle = '#4c6a44';
              ctx.beginPath();
              ctx.arc(tx + shift - 0.8, ty + (shift % 3) - 0.8, 1.2, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#395332';
            }
          }
        } else if (gz.type === 'farmland_crops') {
          // Cultivated agriculture plots (crop channels)
          ctx.fillStyle = '#7a916a'; 
          ctx.fillRect(gz.x, gzYScrolled, gz.w, gz.h);
          
          ctx.strokeStyle = '#5a734a';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let rx = gz.x + 4; rx < gz.x + gz.w; rx += 8) {
            ctx.moveTo(rx, gzYScrolled);
            ctx.lineTo(rx, gzYScrolled + gz.h);
          }
          ctx.stroke();
        } else if (gz.type === 'farmland_plowed') {
          // Terraced brown plow lines
          ctx.fillStyle = '#ab9382'; 
          ctx.fillRect(gz.x, gzYScrolled, gz.w, gz.h);

          ctx.strokeStyle = '#856f5f';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let ox = -gz.h; ox < gz.w; ox += 9) {
            ctx.moveTo(Math.max(gz.x, gz.x + ox), Math.max(gzYScrolled, gzYScrolled - ox));
            ctx.lineTo(Math.min(gz.x + gz.w, gz.x + gz.w + ox), Math.min(gzYScrolled + gz.h, gzYScrolled + gz.h - ox));
          }
          ctx.stroke();
        } else if (gz.type === 'desert_sand') {
          // Brighter sandy areas
          ctx.fillStyle = '#d9cea9';
          ctx.fillRect(gz.x, gzYScrolled, gz.w, gz.h);
          
          // Soft dune ripples
          ctx.strokeStyle = 'rgba(164, 150, 110, 0.3)';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          for (let dy = gzYScrolled + 10; dy < gzYScrolled + gz.h; dy += 16) {
            ctx.moveTo(gz.x, dy);
            ctx.bezierCurveTo(gz.x + gz.w * 0.3, dy - 6, gz.x + gz.w * 0.6, dy + 6, gz.x + gz.w, dy);
          }
          ctx.stroke();
        }
      });

      // 2. Draw GPS Styled Organic Curved Roads with Labeling
      map.roads.forEach(road => {
        if (road.points.length < 2) return;

        // Draw road casing (dark outline)
        ctx.beginPath();
        let pt0 = road.points[0];
        ctx.moveTo(pt0.x, pt0.y + offsetY);
        for (let i = 1; i < road.points.length; i++) {
          ctx.lineTo(road.points[i].x, road.points[i].y + offsetY);
        }
        ctx.strokeStyle = road.type === 'major' ? 'rgba(50, 52, 58, 0.45)' : 'rgba(75, 78, 85, 0.4)';
        ctx.lineWidth = road.type === 'major' ? 8 : 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Draw inner road surface (concrete / asphalt grey)
        ctx.beginPath();
        ctx.moveTo(pt0.x, pt0.y + offsetY);
        for (let i = 1; i < road.points.length; i++) {
          ctx.lineTo(road.points[i].x, road.points[i].y + offsetY);
        }
        ctx.strokeStyle = road.type === 'major' ? '#bec4cc' : '#dcdde0';
        ctx.lineWidth = road.type === 'major' ? 5 : 3.2;
        ctx.stroke();

        // Traffic flow indicator overlay
        if (road.type === 'major' && road.trafficIntensity) {
          let trafficColor = '#22c55e'; // Green flow
          if (road.trafficIntensity === 'high') {
            trafficColor = '#ef4444'; // Red standstill
          } else if (road.trafficIntensity === 'medium') {
            trafficColor = '#f59e0b'; // Amber
          }
          ctx.beginPath();
          ctx.moveTo(pt0.x, pt0.y + offsetY);
          for (let i = 1; i < road.points.length; i++) {
            ctx.lineTo(road.points[i].x, road.points[i].y + offsetY);
          }
          ctx.strokeStyle = trafficColor;
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }

        // Curved or angled road labels
        if (road.name) {
          const midIdx = Math.floor(road.points.length / 2);
          const p1 = road.points[midIdx];
          const p2 = road.points[Math.min(road.points.length - 1, midIdx + 1)];
          const scrY = p1.y + offsetY;
          
          if (scrY > 40 && scrY < BATTERY_Y - 40) {
            ctx.save();
            ctx.translate(p1.x, scrY);
            
            let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
              angle += Math.PI;
            }
            ctx.rotate(angle);
            
            ctx.fillStyle = '#2d333f'; 
            ctx.font = 'bold 7.5px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // White backing halo
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 2.0;
            ctx.strokeText(road.name, 0, -6);
            ctx.fillText(road.name, 0, -6);
            ctx.restore();
          }
        }
      });

      // 3. Draw Densely Packed Stone Buildings with 3D shadows & rotations
      map.buildings.forEach(b => {
        const bYScrolled = b.y + offsetY;

        // Skip drawing if outside bounds
        if (bYScrolled + b.h < -40 || bYScrolled > BATTERY_Y + 120) return;

        ctx.save();
        ctx.translate(b.x + b.w / 2, bYScrolled + b.h / 2);
        ctx.rotate(b.rotation || 0);

        const halfW = b.w / 2;
        const halfH = b.h / 2;

        // Sun shadow (diagonal afternoon sun)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'; 
        ctx.fillRect(-halfW + 1.8, -halfH + 2.2, b.w, b.h);

        // Swimming Pool structures (nested)
        if (b.hasPool && b.poolX && b.poolY) {
          ctx.fillStyle = '#4a5568';
          ctx.fillRect(halfW + 0.8, -halfH, 5, 7);
          ctx.fillStyle = '#06b6d4'; 
          ctx.fillRect(halfW + 1.3, -halfH + 0.8, 3, 5.4);
        }

        // Building Body
        ctx.fillStyle = b.color;
        ctx.fillRect(-halfW, -halfH, b.w, b.h);

        // Sunlit border highlight edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-halfW, -halfH, b.w, b.h);

        // Rooftop Details
        if (b.roofDetail === 'H' || b.isHighValue) {
          ctx.strokeStyle = b.isHighValue ? '#34d399' : 'rgba(100, 116, 139, 0.4)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(0, 0, Math.min(b.w, b.h) * 0.35, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = b.isHighValue ? '#34d399' : 'rgba(100, 116, 139, 0.6)';
          ctx.font = 'bold 6px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', 0, 0);
        } else if (b.roofDetail === 'solar') {
          ctx.fillStyle = 'rgba(30, 58, 138, 0.75)';
          ctx.fillRect(-halfW + 1.2, -halfH + 1.2, b.w - 2.4, b.h - 2.4);
        } else if (b.roofDetail === 'cross') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
          ctx.fillRect(-halfW + 2, -halfH + 2, b.w - 4, b.h - 4);
        }

        // Parked car vehicle
        if (b.carColor) {
          ctx.fillStyle = b.carColor;
          ctx.fillRect(halfW + 1, halfH - 4.5, 2.2, 3.8);
        }

        ctx.restore();
      });

      // 4. Draw Location Marker Pins
      if (map.markers) {
        map.markers.forEach(mk => {
          const scrY = mk.y + offsetY;
          if (scrY < 30 || scrY > BATTERY_Y - 20) return;

          ctx.save();
          
          const badgeRadius = 10;
          
          // Badge shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 5;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 2;
          
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(mk.x, scrY, badgeRadius, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          ctx.strokeStyle = '#b0b5be';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Inner circle and emoji matching types
          let pinColor = '#1e3a8a';
          let emoji = '📍';
          if (mk.type === 'church') {
            pinColor = '#a77a56';
            emoji = '⛪';
          } else if (mk.type === 'mall') {
            pinColor = '#1d4ed8';
            emoji = '🛍️';
          } else if (mk.type === 'mosque') {
            pinColor = '#15803d';
            emoji = '🕌';
          } else if (mk.type === 'ruins') {
            pinColor = '#475569';
            emoji = '🏰';
          } else if (mk.type === 'market') {
            pinColor = '#b45309';
            emoji = '🎪';
          } else if (mk.type === 'hospital') {
            pinColor = '#be123c';
            emoji = '🏥';
          } else if (mk.type === 'hotel') {
            pinColor = '#6d28d9';
            emoji = '🏨';
          }

          ctx.fillStyle = pinColor;
          ctx.beginPath();
          ctx.arc(mk.x, scrY, badgeRadius * 0.72, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = '8px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, mk.x, scrY);

          // Text Badge
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Outer dark silhouette stroke
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.strokeText(mk.label, mk.x, scrY + badgeRadius + 3);

          // White fill
          ctx.fillStyle = '#ffffff';
          ctx.fillText(mk.label, mk.x, scrY + badgeRadius + 3);

          ctx.restore();
        });
      }
    };

    // Render continuous dual passes for mathematically cohesive seamless wrapping layout
    drawBattlefieldLayer(scrollOffset);
    drawBattlefieldLayer(scrollOffset - scrollHeight);

    // 4. Drawing high-tech overlay details (Radar alignment markings & telemetry markers)
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.22)';
    ctx.lineWidth = 1;

    // Modern tracking coordinate labels / High-Tech Live HUD
    // Translucent glassmorphism bar at the top of the simulation
    ctx.fillStyle = 'rgba(15, 23, 42, 0.68)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 26);
    
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.lineTo(CANVAS_WIDTH, 26);
    ctx.stroke();

    const hp = gameStateRef.current.health;
    ctx.font = 'bold 9px monospace';
    
    // Status color-coding (Green -> Amber -> Red warning states)
    ctx.fillStyle = hp <= 30 ? '#ef4444' : hp <= 60 ? '#fbbf24' : '#10b981';
    ctx.textAlign = 'left';
    ctx.fillText(`SYSTEM HP: ${hp}%`, 10, 16);

    // Active tactical wave multiplier
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(`GRID ALERT LVL: ${gameStateRef.current.level}`, CANVAS_WIDTH / 2, 16);

    // Intercept Score tracking
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(`SECURED SCORE: ${gameStateRef.current.score}`, CANVAS_WIDTH - 10, 16);

    // 5. Basestation/Battery Base Ground Plate (Sealing the very bottom cleanly)
    ctx.fillStyle = '#090d16'; // Deep space slate backboard
    ctx.fillRect(0, BATTERY_Y, CANVAS_WIDTH, GROUND_HEIGHT);
    ctx.strokeStyle = '#1e293b'; // slate-800 separator
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, BATTERY_Y);
    ctx.lineTo(CANVAS_WIDTH, BATTERY_Y);
    ctx.stroke();

    // Draw Battery (Tactical Armored Command Launcher Station - occupying space beautifully)
    // Outer heavy armored blast casing
    ctx.fillStyle = '#064e3b'; // dark forest emerald-900
    ctx.beginPath();
    ctx.moveTo(BATTERY_X - 45, BATTERY_Y);
    ctx.lineTo(BATTERY_X + 45, BATTERY_Y);
    ctx.lineTo(BATTERY_X + 30, BATTERY_Y - 22);
    ctx.lineTo(BATTERY_X - 30, BATTERY_Y - 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#10b981'; // emerald-500
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner heavy battery core launcher pod
    ctx.fillStyle = '#10b981'; // emerald-500
    ctx.beginPath();
    ctx.moveTo(BATTERY_X - 22, BATTERY_Y);
    ctx.lineTo(BATTERY_X + 22, BATTERY_Y);
    ctx.lineTo(BATTERY_X + 12, BATTERY_Y - 32);
    ctx.lineTo(BATTERY_X - 12, BATTERY_Y - 32);
    ctx.closePath();
    ctx.fill();

    // Silo / Launcher Tubes Detail (high-tech vertical chambers)
    ctx.strokeStyle = '#022c22'; // deep emerald-950 shadows
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Vertical launcher cell divisions
    ctx.moveTo(BATTERY_X - 8, BATTERY_Y - 14);
    ctx.lineTo(BATTERY_X - 8, BATTERY_Y - 28);
    ctx.moveTo(BATTERY_X, BATTERY_Y - 14);
    ctx.lineTo(BATTERY_X, BATTERY_Y - 30);
    ctx.moveTo(BATTERY_X + 8, BATTERY_Y - 14);
    ctx.lineTo(BATTERY_X + 8, BATTERY_Y - 28);
    ctx.stroke();

    // High intensity active system status indicator glow
    ctx.fillStyle = '#34d399'; // bright core green
    ctx.beginPath();
    ctx.arc(BATTERY_X, BATTERY_Y - 8, 3.5, 0, Math.PI * 2);
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

    // Update & Draw Enemies in reverse
    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const m = enemiesRef.current[i];
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
      
      if (distToB < RADAR_RANGE && inSweep && !m.isDetected) {
        m.isDetected = true;
        m.lockStartTime = Date.now();
        soundManager.playRadar();
      }

      m.update();
      m.draw(ctx);

      if (m.exploded) {
        if (m.y >= BATTERY_Y) {
          explosionsRef.current.push(new Explosion(m.x, m.y, 60, true));
          setGameState(prev => {
            const nextHealth = Math.max(0, prev.health - 10);
            return {
              ...prev,
              health: nextHealth,
              isGameOver: nextHealth <= 0
            };
          });
          setShake(10);
          soundManager.playHit(true);
        }
        enemiesRef.current.splice(i, 1);
      }
    }

    // Update & Draw Interceptors in reverse
    for (let i = interceptorsRef.current.length - 1; i >= 0; i--) {
      const m = interceptorsRef.current[i];
      m.update();

      // Collision Detection: Precise missile-to-missile contact
      for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
        const en = enemiesRef.current[j];
        if (en.exploded) continue;

        const dist = Math.hypot(en.x - m.x, en.y - m.y);
        const hitThreshold = en.isBomber ? 20 : 12; // Larger hit box for bombers

        if (dist < hitThreshold) { // Precise touch threshold
          // Jet shots can ONLY hit Bomber Planes
          if (m.isFromJet && !en.isBomber) continue;
          
          // Ground shots (Iron Dome) can NOT hit Bomber Planes
          if (!m.isFromJet && en.isBomber) continue;

          en.exploded = true;
          m.exploded = true;
          soundManager.playHit(en.isBomber);
          
          setGameState(prev => {
            const nextIntercepted = prev.missilesIntercepted + 1;
            let nextLevel = prev.level;
            if (nextIntercepted > 0 && nextIntercepted % 10 === 0) {
              nextLevel = Math.floor(nextIntercepted / 10) + 1;
            }
            return {
              ...prev,
              score: prev.score + 100,
              missilesIntercepted: nextIntercepted,
              level: nextLevel
            };
          });
        }
      }

      m.draw(ctx);

      if (m.exploded) {
        explosionsRef.current.push(new Explosion(m.x, m.y, EXPLOSION_MAX_RADIUS, false, m.isAuto));
        interceptorsRef.current.splice(i, 1);
      }
    }

    // Update & Draw Explosions in reverse
    for (let i = explosionsRef.current.length - 1; i >= 0; i--) {
      const e = explosionsRef.current[i];
      e.update();
      e.draw(ctx);

      if (e.life <= 0) {
        explosionsRef.current.splice(i, 1);
      }
    }

    gameLoopRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    if (!gameState.isGameOver) {
      gameLoopRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [update, gameState.isGameOver]);

  useEffect(() => {
    if (shake > 0) {
      const timer = setTimeout(() => setShake(0), 100);
      return () => clearTimeout(timer);
    }
  }, [shake]);

  useEffect(() => {
    soundManager.setMute(isMuted);
  }, [isMuted]);

  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState.isGameOver) return;
    
    // Initialize sound on first click
    soundManager.init();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    // Check if clicked an enemy to lock (especially bombers)
    let clickedEnemy = false;
    enemiesRef.current.forEach(en => {
      const dist = Math.hypot(en.x - x, en.y - y);
      const radius = en.isBomber ? 30 : 20; // Allow a generous hit area for locking
      
      if (dist < radius && !en.isDetected && en.isBomber) {
        clickedEnemy = true;
        en.currentTaps++;
        if (en.currentTaps >= en.requiredTaps) {
          en.isDetected = true;
          en.lockStartTime = Date.now();
          soundManager.playRadar();
        }
      }
    });
    
    if (!clickedEnemy) {
      // Fire from battery if not locking an enemy
      fireInterceptor(x, y, BATTERY_X, BATTERY_Y);
    }
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
    lastUpdateTimeRef.current = 0;

    // Procedurally regenerate background on game restart
    const { greenZones, roads, buildings, markers } = generateProceduralMap(CANVAS_WIDTH, CANVAS_HEIGHT);
    mapDataRef.current = { greenZones, roads, buildings, markers };
  };

  return (
    <div className="w-screen h-[100dvh] bg-slate-950 text-slate-200 font-mono overflow-hidden relative select-none">
      {/* Game Stage (True Fullscreen behind everything) */}
      <div 
        className="absolute inset-0 w-full h-full overflow-hidden cursor-default z-0"
        style={{ 
          transform: `translate(${Math.random() * shake - shake/2}px, ${Math.random() * shake - shake/2}px)`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onPointerDown={handleCanvasClick}
          className="w-full h-full block"
        />

        {/* Game Over Overlay */}
        <AnimatePresence>
          {gameState.isGameOver && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-8 z-25 pointer-events-auto"
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
                  className="group flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-8 py-4 rounded font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 mx-auto"
                >
                  <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                  Re-Initialize System
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>



      {/* Decorative Glows */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20 overflow-hidden z-0">
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-emerald-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-cyan-500/20 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
