import { useRef, useCallback } from 'react';
import type { BannerLayout, BannerElement, BannerElementId, BannerSize } from '@ts6/common';

const BANNER_HEIGHT = 236;

const ELEMENT_LABELS: Record<BannerElementId, string> = {
  'server-name':      'Server Name',
  'server-host':      'Host',
  'stat-online':      'Online: X / Y',
  'stat-uptime':      'Uptime: 0h 0m',
  'stat-channels':    'Channels: 0',
  'stat-bandwidth':   '↑ 0 B/m  ↓ 0 B/m',
  'stat-time':        (() => { const n = new Date(); return `${n.getUTCHours().toString().padStart(2,'0')}:${n.getUTCMinutes().toString().padStart(2,'0')}`; })(),
  'stat-date':        (() => { const n = new Date(); return `${n.getUTCDate().toString().padStart(2,'0')}.${(n.getUTCMonth()+1).toString().padStart(2,'0')}.${n.getUTCFullYear()}`; })(),
  'stat-version':     '3.x.x',
  'stat-client-info': '[Client Info Block]',
  'client-table':     '[Client Table]',
  'timestamp':        new Date().toUTCString().replace(' GMT', ' UTC'),
  'custom-text':      'Custom Text',
};

interface Props {
  layout: BannerLayout;
  bannerSize: BannerSize;
  selectedId: BannerElementId | null;
  onSelect: (id: BannerElementId) => void;
  onMove: (id: BannerElementId, x: number, y: number) => void;
  /** 0–1 scale factor for fitting into the editor panel */
  scale?: number;
}

export function BannerCanvas({ layout, bannerSize, selectedId, onSelect, onMove, scale = 1 }: Props) {
  const width = bannerSize === 'wide' ? 921 : 630;
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, el: BannerElement) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(el.id);

      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startX = el.x;
      const startY = el.y;

      function onMouseMove(ev: MouseEvent) {
        const dx = (ev.clientX - startMouseX) / scale;
        const dy = (ev.clientY - startMouseY) / scale;
        const newX = Math.max(0, Math.min(100, startX + (dx / width) * 100));
        const newY = Math.max(0, Math.min(100, startY + (dy / BANNER_HEIGHT) * 100));
        onMove(el.id, newX, newY);
      }

      function onMouseUp() {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onSelect, onMove, width, scale],
  );

  const background =
    layout.backgroundType === 'gradient' && layout.backgroundGradientEnd
      ? `linear-gradient(to right, ${layout.backgroundColor}, ${layout.backgroundGradientEnd})`
      : layout.backgroundType === 'stars'
      ? `radial-gradient(ellipse at 80% 10%, ${layout.backgroundGradientEnd ?? '#0f1f3d'} 0%, ${layout.backgroundColor} 70%)`
      : layout.backgroundColor;

  return (
    <div
      style={{
        width: width * scale,
        height: BANNER_HEIGHT * scale,
        flexShrink: 0,
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width,
          height: BANNER_HEIGHT,
          background,
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          userSelect: 'none',
          cursor: 'default',
          borderRadius: 4,
        }}
        onClick={() => onSelect(null as unknown as BannerElementId)}
      >
        {/* Star field overlay */}
        {layout.backgroundType === 'stars' && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
            backgroundImage: Array.from({ length: 60 }, (_, i) => {
              const x = ((i * 137 + 43) * 31 % 10000) / 100;
              const y = ((i * 89 + 17) * 23 % 10000) / 100;
              const op = i % 5 === 0 ? 0.85 : i % 3 === 0 ? 0.55 : 0.35;
              return `radial-gradient(1px 1px at ${x}% ${y}%, rgba(255,255,255,${op}) 0%, transparent 100%)`;
            }).join(', '),
          }} />
        )}

        {layout.elements.map((el) => {
          if (!el.visible) return null;
          const isSelected = el.id === selectedId;
          const label = el.id === 'custom-text' ? (el.value || 'Custom Text') : ELEMENT_LABELS[el.id];
          const textAlign = el.align as 'left' | 'center' | 'right';
          const left =
            el.align === 'right'
              ? `${el.x}%`
              : el.align === 'center'
              ? `${el.x}%`
              : `${el.x}%`;

          return (
            <div
              key={el.id}
              onMouseDown={(e) => handleMouseDown(e, el)}
              style={{
                position: 'absolute',
                left,
                top: `${el.y}%`,
                transform:
                  el.align === 'center'
                    ? 'translateX(-50%)'
                    : el.align === 'right'
                    ? 'translateX(-100%)'
                    : undefined,
                fontSize: el.fontSize,
                color: el.id === 'server-name' ? layout.accentColor : el.color,
                fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
                fontWeight: el.id === 'server-name' ? 700 : 400,
                textAlign,
                whiteSpace: 'nowrap',
                cursor: 'grab',
                outline: isSelected ? `1px dashed ${layout.accentColor}` : '1px solid transparent',
                padding: '1px 2px',
                borderRadius: 2,
                lineHeight: 1,
              }}
            >
              {label}
            </div>
          );
        })}
        {/* Bottom stats bar */}
        {layout.showBottomBar && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 30,
            backgroundColor: layout.backgroundColor,
            borderTop: `0.5px solid ${layout.accentColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-around',
            fontSize: 11, color: '#c9d1d9',
            fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
            pointerEvents: 'none',
          }}>
            <span>Clients: 12 / 64</span>
            <span>Channels: 24</span>
            <span>Uptime: 2d 4h</span>
          </div>
        )}
      </div>
    </div>
  );
}
