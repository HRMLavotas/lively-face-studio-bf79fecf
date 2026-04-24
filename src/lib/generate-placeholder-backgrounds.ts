// Utility to generate placeholder background images
// This can be run once to create placeholder images until real images are added

export function generatePlaceholderBackground(
  name: string,
  colors: string[],
  width: number = 1920,
  height: number = 1080
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  colors.forEach((color, i) => {
    gradient.addColorStop(i / (colors.length - 1), color);
  });

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add some texture/pattern based on name
  switch (name) {
    case 'cyberpunk-city':
      addCyberpunkCityPattern(ctx, width, height);
      break;
    case 'neon-grid':
      addNeonGridPattern(ctx, width, height);
      break;
    case 'space-station':
      addSpaceStationPattern(ctx, width, height);
      break;
    case 'digital-void':
      addDigitalVoidPattern(ctx, width, height);
      break;
    case 'hologram-lab':
      addHologramLabPattern(ctx, width, height);
      break;
    case 'matrix-code':
      addMatrixCodePattern(ctx, width, height);
      break;
  }

  return canvas.toDataURL('image/jpeg', 0.8);
}

function addCyberpunkCityPattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Add building silhouettes
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  for (let i = 0; i < 20; i++) {
    const x = (i / 20) * width;
    const buildingHeight = Math.random() * height * 0.6 + height * 0.2;
    const buildingWidth = width / 25;
    ctx.fillRect(x, height - buildingHeight, buildingWidth, buildingHeight);
  }

  // Add neon lights
  ctx.fillStyle = '#ff00ff';
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillRect(x, y, 2, 2);
  }
}

function addNeonGridPattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Add grid lines
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  
  const gridSize = 50;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function addSpaceStationPattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Add stars
  ctx.fillStyle = 'white';
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2;
    ctx.fillRect(x, y, size, size);
  }

  // Add space station elements
  ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
  ctx.fillRect(width * 0.1, height * 0.7, width * 0.8, height * 0.1);
}

function addDigitalVoidPattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Add digital particles
  ctx.fillStyle = 'rgba(138, 43, 226, 0.4)';
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 4 + 1;
    ctx.fillRect(x, y, size, size);
  }
}

function addHologramLabPattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Add holographic elements
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
  ctx.lineWidth = 2;
  
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 50 + 20;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function addMatrixCodePattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Add matrix-style code rain
  ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
  ctx.font = '12px monospace';
  
  const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const char = chars[Math.floor(Math.random() * chars.length)];
    ctx.fillText(char, x, y);
  }
}

// Generate all placeholder backgrounds
export function generateAllPlaceholders(): Record<string, string> {
  const placeholders: Record<string, string> = {};

  // Free backgrounds
  placeholders['cyberpunk-city'] = generatePlaceholderBackground('cyberpunk-city', [
    '#0a0a1f', '#1a0a2e', '#16213e', '#0f3460'
  ]);

  placeholders['neon-grid'] = generatePlaceholderBackground('neon-grid', [
    '#0f0f23', '#1a1a3a', '#2d1b69', '#1e3a8a'
  ]);

  placeholders['space-station'] = generatePlaceholderBackground('space-station', [
    '#000000', '#1a1a2e', '#16213e', '#0f172a'
  ]);

  placeholders['digital-void'] = generatePlaceholderBackground('digital-void', [
    '#0c0c0c', '#1a0a2e', '#2d1b69', '#1e1b4b'
  ]);

  // Pro backgrounds
  placeholders['hologram-lab'] = generatePlaceholderBackground('hologram-lab', [
    '#0a1a2e', '#1a2e4b', '#2e4b69', '#4b6987'
  ]);

  placeholders['matrix-code'] = generatePlaceholderBackground('matrix-code', [
    '#000000', '#0a1a0a', '#1a2e1a', '#2e4b2e'
  ]);

  return placeholders;
}

// Generate thumbnails (smaller versions)
export function generateThumbnails(): Record<string, string> {
  const thumbnails: Record<string, string> = {};

  thumbnails['cyberpunk-city-thumb'] = generatePlaceholderBackground('cyberpunk-city', [
    '#0a0a1f', '#1a0a2e', '#16213e', '#0f3460'
  ], 200, 112);

  thumbnails['neon-grid-thumb'] = generatePlaceholderBackground('neon-grid', [
    '#0f0f23', '#1a1a3a', '#2d1b69', '#1e3a8a'
  ], 200, 112);

  thumbnails['space-station-thumb'] = generatePlaceholderBackground('space-station', [
    '#000000', '#1a1a2e', '#16213e', '#0f172a'
  ], 200, 112);

  thumbnails['digital-void-thumb'] = generatePlaceholderBackground('digital-void', [
    '#0c0c0c', '#1a0a2e', '#2d1b69', '#1e1b4b'
  ], 200, 112);

  thumbnails['hologram-lab-thumb'] = generatePlaceholderBackground('hologram-lab', [
    '#0a1a2e', '#1a2e4b', '#2e4b69', '#4b6987'
  ], 200, 112);

  thumbnails['matrix-code-thumb'] = generatePlaceholderBackground('matrix-code', [
    '#000000', '#0a1a0a', '#1a2e1a', '#2e4b2e'
  ], 200, 112);

  return thumbnails;
}