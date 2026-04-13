import type { WidgetData, BannerLayout, BannerElement, BannerClientColumn } from '@ts6/common';
import { DEFAULT_BANNER_LAYOUT } from '@ts6/common';

const BANNER_HEIGHT = 236;
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB/m`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB/m`;
  return `${bytes} B/m`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function anchorX(x: number, width: number, align: BannerElement['align']): number {
  const px = (x / 100) * width;
  return px;
}

function textAnchor(align: BannerElement['align']): string {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
}

function parseLayout(data: WidgetData): BannerLayout {
  if (data.bannerLayout) {
    try {
      return JSON.parse(data.bannerLayout) as BannerLayout;
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_BANNER_LAYOUT;
}

function renderBackground(lines: string[], layout: BannerLayout, width: number): void {
  if (layout.backgroundType === 'gradient' && layout.backgroundGradientEnd) {
    lines.push(`<defs><linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="0">`);
    lines.push(`<stop offset="0%" stop-color="${escapeXml(layout.backgroundColor)}"/>`);
    lines.push(`<stop offset="100%" stop-color="${escapeXml(layout.backgroundGradientEnd)}"/>`);
    lines.push(`</linearGradient></defs>`);
    lines.push(`<rect width="${width}" height="${BANNER_HEIGHT}" fill="url(#bg-grad)"/>`);
  } else if (layout.backgroundType === 'stars') {
    const gradEnd = layout.backgroundGradientEnd ?? '#0f1f3d';
    lines.push(`<defs><radialGradient id="bg-stars" cx="80%" cy="10%" r="80%">`);
    lines.push(`<stop offset="0%" stop-color="${escapeXml(gradEnd)}"/>`);
    lines.push(`<stop offset="100%" stop-color="${escapeXml(layout.backgroundColor)}"/>`);
    lines.push(`</radialGradient></defs>`);
    lines.push(`<rect width="${width}" height="${BANNER_HEIGHT}" fill="url(#bg-stars)"/>`);
    renderStars(lines, width);
  } else {
    lines.push(`<rect width="${width}" height="${BANNER_HEIGHT}" fill="${escapeXml(layout.backgroundColor)}"/>`);
  }
}

function renderStars(lines: string[], width: number): void {
  // Deterministic pseudo-random star placement
  for (let i = 0; i < 80; i++) {
    const x = ((i * 4327 + 1234) % (width * 10)) / 10;
    const y = ((i * 2891 + 567) % ((BANNER_HEIGHT - 34) * 10)) / 10;
    const r  = i % 5 === 0 ? 1.2 : i % 3 === 0 ? 0.8 : 0.5;
    const op = i % 5 === 0 ? 0.85 : i % 3 === 0 ? 0.55 : 0.35;
    lines.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="white" opacity="${op}"/>`);
  }
}

const BAR_H = 30;

function renderBottomBar(lines: string[], data: WidgetData, layout: BannerLayout, width: number): void {
  const barY = BANNER_HEIGHT - BAR_H;
  lines.push(`<rect x="0" y="${barY}" width="${width}" height="${BAR_H}" fill="${escapeXml(layout.backgroundColor)}" opacity="0.9"/>`);
  lines.push(`<line x1="0" y1="${barY}" x2="${width}" y2="${barY}" stroke="${escapeXml(layout.accentColor)}" stroke-width="0.5" opacity="0.25"/>`);

  const textY = barY + 19;
  const items = [
    `Clients: ${data.onlineUsers} / ${data.maxClients}`,
    `Channels: ${data.channelCount}`,
    `Uptime: ${formatUptime(data.uptime)}`,
  ];
  const spacing = width / items.length;
  for (let i = 0; i < items.length; i++) {
    const cx = spacing * i + spacing / 2;
    lines.push(`<text x="${cx.toFixed(1)}" y="${textY}" fill="#c9d1d9" font-family="${FONT}" font-size="11" text-anchor="middle">${escapeXml(items[i])}</text>`);
  }
}

function renderClientTable(
  lines: string[],
  data: WidgetData,
  el: BannerElement,
  width: number,
): void {
  const cols: BannerClientColumn[] = el.showColumns ?? ['country', 'nickname', 'upload', 'download', 'online-time', 'connections'];
  const maxRows = el.maxItems ?? 5;
  const clients = data.bannerClients.slice(0, maxRows);
  if (clients.length === 0) return;

  const startX = (el.x / 100) * width;
  const startY = (el.y / 100) * BANNER_HEIGHT;
  const rowH = el.fontSize + 6;
  const headerColor = '#8b949e';
  const colLabels: Record<BannerClientColumn, string> = {
    country: 'CC',
    nickname: 'Nickname',
    upload: 'Upload',
    download: 'Download',
    'online-time': 'Online',
    connections: 'Conn.',
  };

  // Column widths (px) — scale with banner width
  const scale = width / 630;
  const colWidths: Record<BannerClientColumn, number> = {
    country:      24 * scale,
    nickname:     120 * scale,
    upload:       72 * scale,
    download:     72 * scale,
    'online-time': 52 * scale,
    connections:  40 * scale,
  };

  // Header row
  let cx = startX;
  for (const col of cols) {
    lines.push(`<text x="${cx.toFixed(1)}" y="${startY.toFixed(1)}" fill="${headerColor}" font-family="${FONT}" font-size="${el.fontSize - 1}" font-weight="600">${escapeXml(colLabels[col])}</text>`);
    cx += colWidths[col];
  }

  // Separator line under header
  const sepY = startY + 3;
  lines.push(`<line x1="${startX.toFixed(1)}" y1="${sepY.toFixed(1)}" x2="${Math.min(cx, width - 4).toFixed(1)}" y2="${sepY.toFixed(1)}" stroke="#30363d" stroke-width="1"/>`);

  // Data rows
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const ry = startY + rowH + (i * rowH);
    cx = startX;

    for (const col of cols) {
      let cellText = '';
      switch (col) {
        case 'country':      cellText = c.country ? c.country.toUpperCase().slice(0, 2) : '--'; break;
        case 'nickname':     cellText = truncate(c.nickname, Math.floor(colWidths.nickname / (el.fontSize * 0.55))); break;
        case 'upload':       cellText = formatBytes(c.uploadBytesLastMin); break;
        case 'download':     cellText = formatBytes(c.downloadBytesLastMin); break;
        case 'online-time':  cellText = formatDuration(c.onlineDuration); break;
        case 'connections':  cellText = String(c.totalConnections); break;
      }
      lines.push(`<text x="${cx.toFixed(1)}" y="${ry.toFixed(1)}" fill="${escapeXml(el.color)}" font-family="${FONT}" font-size="${el.fontSize}">${escapeXml(cellText)}</text>`);
      cx += colWidths[col];
    }
  }
}

function renderElement(
  lines: string[],
  el: BannerElement,
  data: WidgetData,
  layout: BannerLayout,
  width: number,
): void {
  if (!el.visible) return;

  const px = anchorX(el.x, width, el.align);
  const py = ((el.y / 100) * BANNER_HEIGHT);
  const anchor = textAnchor(el.align);
  const color = escapeXml(el.color);
  const accentColor = escapeXml(layout.accentColor);
  const baseAttrs = `x="${px.toFixed(1)}" y="${py.toFixed(1)}" font-family="${FONT}" font-size="${el.fontSize}" text-anchor="${anchor}"`;

  switch (el.id) {
    case 'server-name':
      lines.push(`<text ${baseAttrs} font-weight="700" fill="${accentColor}">${escapeXml(truncate(data.serverName, 50))}</text>`);
      break;

    case 'server-host':
      lines.push(`<text ${baseAttrs} fill="${color}">${escapeXml(`${data.serverHost}:${data.serverPort}`)}</text>`);
      break;

    case 'stat-online':
      lines.push(`<text ${baseAttrs} fill="${color}">${escapeXml(`Online: ${data.onlineUsers} / ${data.maxClients}`)}</text>`);
      break;

    case 'stat-uptime':
      lines.push(`<text ${baseAttrs} fill="${color}">${escapeXml(`Uptime: ${formatUptime(data.uptime)}`)}</text>`);
      break;

    case 'stat-channels':
      lines.push(`<text ${baseAttrs} fill="${color}">${escapeXml(`Channels: ${data.channelCount}`)}</text>`);
      break;

    case 'stat-bandwidth':
      lines.push(`<text ${baseAttrs} fill="${color}">${escapeXml(`↑ ${formatBytes(data.serverUploadBytesLastMin)}  ↓ ${formatBytes(data.serverDownloadBytesLastMin)}`)}</text>`);
      break;

    case 'stat-time': {
      const now = new Date();
      const hh = now.getUTCHours().toString().padStart(2, '0');
      const mm = now.getUTCMinutes().toString().padStart(2, '0');
      lines.push(`<text ${baseAttrs} fill="${color}" font-weight="700">${hh}:${mm}</text>`);
      break;
    }

    case 'stat-date': {
      const now = new Date();
      const dd = now.getUTCDate().toString().padStart(2, '0');
      const mo = (now.getUTCMonth() + 1).toString().padStart(2, '0');
      const yyyy = now.getUTCFullYear();
      lines.push(`<text ${baseAttrs} fill="${color}">${dd}.${mo}.${yyyy}</text>`);
      break;
    }

    case 'stat-version': {
      const version = data.version.split(' ')[0] ?? data.version;
      lines.push(`<text ${baseAttrs} fill="${color}" opacity="0.6">${escapeXml(version)}</text>`);
      break;
    }

    case 'stat-client-info': {
      const c = data.bannerClients[0];
      const fs = el.fontSize;
      const lh = fs + 5;
      const muted = '#6e7681';

      lines.push(`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" fill="${muted}" font-family="${FONT}" font-size="${fs - 1}">${escapeXml('Bandwidth (last min)')}</text>`);
      const uploadText  = c ? `Upload: ${formatBytes(c.uploadBytesLastMin)}` : 'Upload: --';
      const downloadText = c ? `Download: ${formatBytes(c.downloadBytesLastMin)}` : 'Download: --';
      lines.push(`<text x="${px.toFixed(1)}" y="${(py + lh).toFixed(1)}" fill="${color}" font-family="${FONT}" font-size="${fs}">${escapeXml(uploadText)}</text>`);
      lines.push(`<text x="${px.toFixed(1)}" y="${(py + lh * 2).toFixed(1)}" fill="${color}" font-family="${FONT}" font-size="${fs}">${escapeXml(downloadText)}</text>`);

      const connY = py + lh * 4;
      lines.push(`<text x="${px.toFixed(1)}" y="${connY.toFixed(1)}" fill="${muted}" font-family="${FONT}" font-size="${fs - 1}">${escapeXml('Connection information')}</text>`);
      if (c) {
        lines.push(`<text x="${px.toFixed(1)}" y="${(connY + lh).toFixed(1)}" fill="${color}" font-family="${FONT}" font-size="${fs}">Nickname: ${escapeXml(truncate(c.nickname, 22))}</text>`);
        lines.push(`<text x="${px.toFixed(1)}" y="${(connY + lh * 2).toFixed(1)}" fill="${color}" font-family="${FONT}" font-size="${fs}">Connected since: ${escapeXml(formatDuration(c.onlineDuration))}</text>`);
        lines.push(`<text x="${px.toFixed(1)}" y="${(connY + lh * 3).toFixed(1)}" fill="${color}" font-family="${FONT}" font-size="${fs}">Total connections: ${c.totalConnections}</text>`);
      } else {
        lines.push(`<text x="${px.toFixed(1)}" y="${(connY + lh).toFixed(1)}" fill="${muted}" font-family="${FONT}" font-size="${fs}">No clients online</text>`);
      }
      break;
    }

    case 'timestamp': {
      const now = new Date().toUTCString().replace(' GMT', ' UTC');
      lines.push(`<text ${baseAttrs} fill="${color}" opacity="0.6">${escapeXml(now)}</text>`);
      break;
    }

    case 'custom-text':
      if (el.value) lines.push(`<text ${baseAttrs} fill="${color}">${escapeXml(el.value)}</text>`);
      break;

    case 'client-table':
      renderClientTable(lines, data, el, width);
      break;
  }
}

export function renderBannerSvg(data: WidgetData): string {
  const width = data.bannerSize === 'wide' ? 921 : 630;
  const layout = parseLayout(data);
  const lines: string[] = [];

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BANNER_HEIGHT}" viewBox="0 0 ${width} ${BANNER_HEIGHT}">`);

  renderBackground(lines, layout, width);

  for (const el of layout.elements) {
    renderElement(lines, el, data, layout, width);
  }

  if (layout.showBottomBar) {
    renderBottomBar(lines, data, layout, width);
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}
