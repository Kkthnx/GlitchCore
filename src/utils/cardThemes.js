/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Rank card themes. Each drives the fully-programmatic renderer in
// generateRankCard.js, no background image needed. Keys are kept stable
// (default/neon/hacker/gold/rgb existed before) so saved user choices survive.
//
// Schema:
//   name    display name (shown in /rankstyle choices)
//   bg      { type, colors[], grid?, dot?, stripe? } background recipe
//   accent  primary accent (avatar ring, hero number, percent)
//   accent2 secondary accent (gradients)
//   text    primary text color
//   sub     muted text color
//   track   progress bar track color (rgba recommended)
//   bar     progress fill: a color string, [c1,c2] gradient, or 'rgb'
//   ring    optional: 'rgb' for a rainbow avatar ring

module.exports = {
    default: {
        name: 'Midnight',
        bg: { type: 'linear', colors: ['#0b1220', '#141d33'] },
        accent: '#5cc8ff', accent2: '#7aa2ff',
        text: '#eaf2ff', sub: '#8aa0c0',
        track: 'rgba(255,255,255,0.08)', bar: ['#5cc8ff', '#7aa2ff'],
    },
    aurora: {
        name: 'Aurora',
        bg: { type: 'aurora', colors: ['#0a0e1a', '#34d3b4', '#b483ff'] },
        accent: '#7ee0c8', accent2: '#b483ff',
        text: '#f0f5ff', sub: '#9fb0cc',
        track: 'rgba(255,255,255,0.08)', bar: ['#34d3b4', '#b483ff'],
    },
    sunset: {
        name: 'Sunset',
        bg: { type: 'linear', colors: ['#1a0f2e', '#5a2350', '#b34a6a'] },
        accent: '#ffb36b', accent2: '#ff6b9d',
        text: '#fff2ec', sub: '#e0b8c6',
        track: 'rgba(0,0,0,0.30)', bar: ['#ffb36b', '#ff6b9d'],
    },
    emerald: {
        name: 'Emerald',
        bg: { type: 'radial', colors: ['#04140e', '#0c3a28'] },
        accent: '#34d3b4', accent2: '#2fe07a',
        text: '#e9fff5', sub: '#7fbfa4',
        track: 'rgba(255,255,255,0.07)', bar: ['#2fe07a', '#34d3b4'],
    },
    crimson: {
        name: 'Crimson',
        bg: { type: 'carbon', colors: ['#140a0c', '#2a1015'] },
        accent: '#ff4d5e', accent2: '#b3122a',
        text: '#ffecee', sub: '#d98b95',
        track: 'rgba(255,255,255,0.06)', bar: ['#ff4d5e', '#b3122a'],
    },
    gold: {
        name: 'Gold Luxe',
        bg: { type: 'dots', colors: ['#0d0b07', '#171207'], dot: 'rgba(240,180,41,0.10)' },
        accent: '#f0b429', accent2: '#ffd76b',
        text: '#fff6da', sub: '#caa646',
        track: 'rgba(255,255,255,0.07)', bar: ['#ffd76b', '#e0a000'],
    },
    neon: {
        name: 'Vaporwave',
        bg: { type: 'grid', colors: ['#241535', '#3a1d5c'], grid: 'rgba(255,95,208,0.16)' },
        accent: '#ff5fd0', accent2: '#5cc8ff',
        text: '#fdeaff', sub: '#c79fd8',
        track: 'rgba(255,255,255,0.08)', bar: ['#ff5fd0', '#5cc8ff'],
    },
    hacker: {
        name: 'Cyber Green',
        bg: { type: 'dots', colors: ['#030805', '#06120a'], dot: 'rgba(47,224,122,0.14)' },
        accent: '#2fe07a', accent2: '#39ff14',
        text: '#d6ffe0', sub: '#5aa06f',
        track: 'rgba(47,224,122,0.10)', bar: ['#2fe07a', '#39ff14'],
    },
    ocean: {
        name: 'Ocean',
        bg: { type: 'stripes', colors: ['#04121f', '#0a2c47'], stripe: 'rgba(92,200,255,0.08)' },
        accent: '#5cc8ff', accent2: '#34d3b4',
        text: '#e8f6ff', sub: '#89b4cc',
        track: 'rgba(255,255,255,0.08)', bar: ['#34d3b4', '#5cc8ff'],
    },
    rgb: {
        name: 'RGB Gamer',
        bg: { type: 'grid', colors: ['#0c0d12', '#141620'], grid: 'rgba(255,255,255,0.05)' },
        accent: '#ffffff', accent2: '#ffffff',
        text: '#ffffff', sub: '#b7bccb',
        track: 'rgba(255,255,255,0.08)', bar: 'rgb', ring: 'rgb',
    },
};
