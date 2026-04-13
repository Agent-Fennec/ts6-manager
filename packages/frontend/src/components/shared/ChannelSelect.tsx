import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChannels } from '@/hooks/use-bots';

interface ChannelSelectProps {
  value: string;
  onChange: (v: string) => void;
  configId: number | null;
  sid: number | null;
  placeholder?: string;
  className?: string;
}

export function ChannelSelect({ value, onChange, configId, sid, placeholder, className }: ChannelSelectProps) {
  const channels = useChannels(configId, sid);

  // Template passthrough: if value starts with {{ render a plain Input
  if (value.startsWith('{{')) {
    return (
      <Input
        className={cn('h-7 text-xs mt-1 font-mono-data', className)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Loading / error fallback
  if (channels.isLoading || channels.isError || !channels.data) {
    return (
      <Input
        className={cn('h-7 text-xs mt-1 font-mono-data', className)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const data = channels.data;

  // Build sorted channel list: root channels first, then their children
  const sorted: Array<{ cid: string; channel_name: string; pid: string; channel_order: string; indent: boolean }> = [];
  const roots = data
    .filter((c) => c.pid === '0')
    .sort((a, b) => Number(a.channel_order) - Number(b.channel_order));

  for (const root of roots) {
    sorted.push({ ...root, indent: false });
    const children = data
      .filter((c) => c.pid === root.cid)
      .sort((a, b) => Number(a.channel_order) - Number(b.channel_order));
    for (const child of children) {
      sorted.push({ ...child, indent: true });
    }
  }

  // If current value is non-empty and not in the list, add it as an extra item
  const valueInList = value === '' || sorted.some((ch) => ch.cid === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('h-7 text-xs mt-1 font-mono-data', className)}>
        <SelectValue placeholder={placeholder ?? 'Select channel\u2026'} />
      </SelectTrigger>
      <SelectContent>
        {!valueInList && value !== '' && (
          <SelectItem value={value}>{value}</SelectItem>
        )}
        {sorted.map((ch) => (
          <SelectItem key={ch.cid} value={ch.cid}>
            {ch.indent ? '\u21b3 ' : ''}{ch.channel_name} (ID: {ch.cid})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
