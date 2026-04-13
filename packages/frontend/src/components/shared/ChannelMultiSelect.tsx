import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useChannels } from '@/hooks/use-bots';

interface ChannelMultiSelectProps {
  /** Comma-separated channel IDs, e.g. "20,21,752" */
  value: string;
  onChange: (v: string) => void;
  configId: number | null;
  sid: number | null;
  placeholder?: string;
  className?: string;
}

export function ChannelMultiSelect({ value, onChange, configId, sid, placeholder, className }: ChannelMultiSelectProps) {
  const channels = useChannels(configId, sid);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value
    ? value.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const toggle = (cid: string) => {
    const next = selected.includes(cid)
      ? selected.filter((s) => s !== cid)
      : [...selected, cid];
    onChange(next.join(','));
  };

  const remove = (cid: string) => {
    onChange(selected.filter((s) => s !== cid).join(','));
  };

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Build sorted channel list (mirrors ChannelSelect ordering)
  const sorted: Array<{ cid: string; channel_name: string; pid: string; channel_order: string; indent: boolean }> = [];
  if (channels.data) {
    const roots = channels.data
      .filter((c) => c.pid === '0')
      .sort((a, b) => Number(a.channel_order) - Number(b.channel_order));
    for (const root of roots) {
      sorted.push({ ...root, indent: false });
      const children = channels.data
        .filter((c) => c.pid === root.cid)
        .sort((a, b) => Number(a.channel_order) - Number(b.channel_order));
      for (const child of children) {
        sorted.push({ ...child, indent: true });
      }
    }
  }

  // Resolve display name for a cid
  const nameFor = (cid: string) => {
    const ch = channels.data?.find((c) => c.cid === cid);
    return ch ? ch.channel_name : cid;
  };

  return (
    <div ref={containerRef} className={cn('relative mt-1', className)}>
      {/* Selected badges */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selected.map((cid) => (
            <span
              key={cid}
              className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] font-mono-data"
            >
              {nameFor(cid)} ({cid})
              <button
                type="button"
                onClick={() => remove(cid)}
                className="ml-0.5 text-muted-foreground hover:text-foreground leading-none"
                aria-label={`Remove ${cid}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-7 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 text-xs ring-offset-background',
          'hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          open && 'ring-1 ring-ring',
        )}
      >
        <span className="text-muted-foreground">
          {selected.length === 0
            ? (placeholder ?? 'Select channels\u2026')
            : `${selected.length} channel${selected.length !== 1 ? 's' : ''} selected`}
        </span>
        <svg
          className={cn('h-3 w-3 shrink-0 opacity-50 transition-transform', open && 'rotate-180')}
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {channels.isLoading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading channels…</div>
          )}
          {channels.isError && (
            <div className="px-2 py-1.5 text-xs text-destructive">Failed to load channels</div>
          )}
          {sorted.length > 0 && (
            <div className="max-h-48 overflow-y-auto p-1">
              {sorted.map((ch) => {
                const isSelected = selected.includes(ch.cid);
                return (
                  <button
                    key={ch.cid}
                    type="button"
                    onClick={() => toggle(ch.cid)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'bg-accent/50',
                    )}
                  >
                    <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-primary', isSelected && 'bg-primary')}>
                      {isSelected && (
                        <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586l-3.293-3.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <span className="font-mono-data">
                      {ch.indent ? '\u21b3 ' : ''}{ch.channel_name} ({ch.cid})
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
