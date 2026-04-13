import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { changelog, APP_VERSION } from '@/data/changelog';

const typeMeta = {
  feat: { label: 'New', className: 'bg-primary/15 text-primary border-primary/20' },
  fix:  { label: 'Fix', className: 'bg-destructive/15 text-destructive border-destructive/20' },
  perf: { label: 'Perf', className: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20' },
  chore:{ label: 'Chore', className: 'bg-muted text-muted-foreground border-border' },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangelogDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Changelog
            <span className="text-xs font-mono-data text-muted-foreground font-normal">v{APP_VERSION}</span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-1">
          <div className="space-y-6 py-1">
            {changelog.map((entry) => (
              <div key={entry.version}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold font-mono-data">v{entry.version}</span>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                </div>
                <ul className="space-y-1.5">
                  {entry.changes.map((c, i) => {
                    const meta = typeMeta[c.type];
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 mt-0.5 shrink-0 ${meta.className}`}>
                          {meta.label}
                        </Badge>
                        <span className="text-muted-foreground leading-snug">{c.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
