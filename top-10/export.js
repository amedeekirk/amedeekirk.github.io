import { listTitle } from './state.js';

const WIDTH = 1200;
const PAD = 32;
const HEADER = 116;
const ROW = 116;
const GAP = 10;
const IMAGE_WIDTH = 158;
const HEIGHT = PAD * 2 + HEADER + ROW * 10 + GAP * 9;

function imageFor(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Artwork timed out.')), 15000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Artwork could not be loaded for export.')); };
    image.src = `${url}${url.includes('?') ? '&' : '?'}canvas=1`;
  });
}

function cover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, width, height);
}

function fitText(ctx, value, width) {
  let text = value;
  while (ctx.measureText(text).width > width && text.length > 1) text = `${text.slice(0, -2)}…`;
  return text;
}

export async function createPng(draft) {
  const images = await Promise.all(draft.slots.map(async (entry, index) => {
    if (!entry?.image) return null;
    try { return await imageFor(entry.image); }
    catch { throw new Error(`Artwork in rank ${index + 1} could not be loaded for export.`); }
  }));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the image.');
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#4c7cc8';
  ctx.textAlign = 'left';
  const title = listTitle(draft);
  let titleSize = 52;
  ctx.font = `bold ${titleSize}px Nunito, sans-serif`;
  while (ctx.measureText(title).width > WIDTH - PAD * 2 && titleSize > 22) {
    ctx.font = `bold ${--titleSize}px Nunito, sans-serif`;
  }
  ctx.fillText(fitText(ctx, title, WIDTH - PAD * 2), PAD, PAD + 55);
  ctx.font = '22px Nunito, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('A personal ranking', PAD, PAD + 90);

  draft.slots.forEach((entry, index) => {
    const y = PAD + HEADER + index * (ROW + GAP);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW);
    ctx.strokeStyle = '#d1d5db';
    ctx.strokeRect(PAD + 0.5, y + 0.5, WIDTH - PAD * 2 - 1, ROW - 1);
    ctx.fillStyle = '#4c7cc8';
    ctx.fillRect(PAD, y, 90, ROW);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 49px Lato, sans-serif';
    ctx.fillText(String(index + 1), PAD + 45, y + ROW / 2);
    if (!entry) return;
    ctx.textAlign = 'left';
    const lines = [{ text: entry.name, height: 36, font: 'bold 30px Nunito, sans-serif', color: '#000000' }];
    if (draft.mode === 'characters') {
      lines.push({ text: entry.animeTitle ? `From: ${entry.animeTitle}` : 'Anime not listed', height: 23, font: '19px Nunito, sans-serif', color: '#666666' });
      if (entry.voiceActor) lines.push({ text: `CV (JP): ${entry.voiceActor}`, height: 23, font: '19px Nunito, sans-serif', color: '#666666' });
    } else {
      lines.push({ text: entry.detail || 'Anime', height: 23, font: '19px Nunito, sans-serif', color: '#666666' });
    }
    const blockHeight = lines.reduce((height, line) => height + line.height, 0) + (lines.length - 1) * 4;
    let lineTop = y + (ROW - blockHeight) / 2;
    lines.forEach((line) => {
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.fillText(fitText(ctx, line.text, 770), PAD + 114, lineTop + line.height / 2);
      lineTop += line.height + 4;
    });
    const imageX = WIDTH - PAD - IMAGE_WIDTH;
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(imageX, y, IMAGE_WIDTH, ROW);
    if (images[index]) cover(ctx, images[index], imageX, y, IMAGE_WIDTH, ROW);
    else {
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px Nunito, sans-serif';
      ctx.fillText('No artwork', imageX + IMAGE_WIDTH / 2, y + ROW / 2);
      ctx.textAlign = 'left';
    }
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The browser could not create a PNG. Please retry.');
  return blob;
}

export function savePng(blob, mode) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-top-10-${mode}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
