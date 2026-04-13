import { create, all } from 'mathjs';
import { logger } from '../utils/logger.js';
import type { PrismaClient } from '../../generated/prisma/index.js';

function coerceNumericStrings(val: any): any {
  if (typeof val === 'string') {
    const num = Number(val);
    return isNaN(num) ? val : num;
  }
  if (Array.isArray(val)) return val.map(coerceNumericStrings);
  if (val !== null && typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) out[k] = coerceNumericStrings(v);
    return out;
  }
  return val;
}

function resolveDotPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current instanceof Map ? current.get(part) : current[part];
  }
  return current;
}

function getTimeValues(timezone?: string): Record<string, string | number> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  if (timezone && timezone !== 'UTC') {
    try {
      const fmt = (opts: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat('en-US', { ...opts, timeZone: timezone }).format(now);
      const hours = Number(fmt({ hour: 'numeric', hour12: false }));
      const minutes = Number(fmt({ minute: 'numeric' }));
      const seconds = Number(fmt({ second: 'numeric' }));
      const day = Number(fmt({ day: 'numeric' }));
      const month = Number(fmt({ month: 'numeric' }));
      const year = Number(fmt({ year: 'numeric' }));
      const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getDay();

      return {
        hours: pad(hours),
        minutes: pad(minutes),
        seconds: pad(seconds),
        time: `${pad(hours)}:${pad(minutes)}`,
        date: `${pad(day)}.${pad(month)}.${year}`,
        timestamp: Math.floor(now.getTime() / 1000),
        day: pad(day),
        month: pad(month),
        year,
        dayOfWeek,
      };
    } catch {
      // Invalid timezone — fall through to default
    }
  }

  return {
    hours: pad(now.getHours()),
    minutes: pad(now.getMinutes()),
    seconds: pad(now.getSeconds()),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    date: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
    timestamp: Math.floor(now.getTime() / 1000),
    day: pad(now.getDate()),
    month: pad(now.getMonth() + 1),
    year: now.getFullYear(),
    dayOfWeek: now.getDay(),
  };
}

export class ExecutionContext {
  private tempVars: Map<string, any> = new Map();
  private exprParser: ReturnType<typeof create>;

  constructor(
    private prisma: PrismaClient,
    public readonly flowId: number,
    public readonly executionId: number,
    public readonly configId: number,
    public readonly sid: number,
    public readonly triggerType: string,
    public readonly eventData: Record<string, string>,
    public readonly timezone?: string,
  ) {
    // mathjs replaces expr-eval (no patched expr-eval version exists).
    // create() with all factories gives a full instance; import() adds
    // the same custom functions that were registered on the old Parser.
    this.exprParser = create(all);
    this.exprParser.import({
      contains:   (str: string, substr: string) => String(str).includes(String(substr)) ? 1 : 0,
      startsWith: (str: string, prefix: string) => String(str).startsWith(String(prefix)) ? 1 : 0,
      endsWith:   (str: string, suffix: string)  => String(str).endsWith(String(suffix)) ? 1 : 0,
      lower:      (str: string) => String(str).toLowerCase(),
      upper:      (str: string) => String(str).toUpperCase(),
      length:     (str: string) => String(str).length,
      split:      (str: string, sep: string, index: number) => {
        const parts = String(str).split(String(sep));
        return parts[index] ?? '';
      },
      // Exact item match in a comma-separated list (e.g. client_servergroups).
      hasGroup: (groups: any, groupId: any) => {
        const items = String(groups).split(',').map((g: string) => g.trim());
        return items.includes(String(groupId)) ? 1 : 0;
      },
    }, { override: true });
  }

  private applyFilter(value: string, filter: string): string {
    switch (filter) {
      case 'uptime': {
        const totalSec = parseInt(value, 10) || 0;
        const d = Math.floor(totalSec / 86400);
        const h = Math.floor((totalSec % 86400) / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const parts: string[] = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0 || d > 0) parts.push(`${h}h`);
        parts.push(`${m}m`);
        return parts.join(' ');
      }
      case 'round': return String(Math.round(parseFloat(value) || 0));
      case 'floor': return String(Math.floor(parseFloat(value) || 0));
      default: return value;
    }
  }

  async resolveTemplate(template: string): Promise<string> {
    if (!template || !template.includes('{{')) return template;

    const matches = template.matchAll(/\{\{(.+?)\}\}/g);
    let result = template;

    for (const match of matches) {
      const fullMatch = match[0];
      const raw = match[1].trim();
      // Support pipe filters: {{path|filter}}
      const pipeIdx = raw.indexOf('|');
      const path = pipeIdx >= 0 ? raw.substring(0, pipeIdx).trim() : raw;
      const filter = pipeIdx >= 0 ? raw.substring(pipeIdx + 1).trim() : null;
      let value = '';

      if (path.startsWith('event.')) {
        const key = path.substring(6);
        // Support nested access: event.webhook_body.test → parse webhook_body as JSON, access .test
        if (this.eventData[key] !== undefined) {
          value = this.eventData[key];
        } else {
          const firstDot = key.indexOf('.');
          if (firstDot > 0) {
            const topKey = key.substring(0, firstDot);
            const rest = key.substring(firstDot + 1);
            const topVal = this.eventData[topKey];
            if (topVal) {
              try {
                const parsed = JSON.parse(topVal);
                const resolved = resolveDotPath(parsed, rest);
                value = resolved != null ? String(resolved) : '';
              } catch {
                value = '';
              }
            }
          }
        }
      } else if (path.startsWith('var.')) {
        const name = path.substring(4);
        value = await this.getVariable(name);
      } else if (path.startsWith('temp.')) {
        const dotPath = path.substring(5);
        // Support nested access: temp.server.virtualserver_clientsonline
        const firstDot = dotPath.indexOf('.');
        if (firstDot === -1) {
          const tempVal = this.tempVars.get(dotPath);
          // If value is an object/array, serialize as JSON so {{temp.apiResult}} returns valid JSON text.
          // Null resolves to the literal string "null" so condition expressions like
          // {{temp.origin}} != null evaluate correctly (empty string != null is always true).
          value = tempVal == null ? 'null' : (typeof tempVal === 'object' ? JSON.stringify(tempVal) : String(tempVal));
        } else {
          const topKey = dotPath.substring(0, firstDot);
          const rest = dotPath.substring(firstDot + 1);
          let topVal = this.tempVars.get(topKey);
          // If stored as JSON string (e.g. from HTTP response), parse it for dot access
          if (typeof topVal === 'string') {
            try { topVal = JSON.parse(topVal); } catch { /* not JSON */ }
          }
          const resolved = resolveDotPath(topVal, rest);
          value = resolved != null ? String(resolved) : '';
        }
      } else if (path.startsWith('time.')) {
        const key = path.substring(5);
        const tv = getTimeValues(this.timezone);
        value = tv[key] != null ? String(tv[key]) : '';
      } else if (path.startsWith('exec.')) {
        const key = path.substring(5);
        switch (key) {
          case 'flowId': value = String(this.flowId); break;
          case 'executionId': value = String(this.executionId); break;
          case 'configId': value = String(this.configId); break;
          case 'sid': value = String(this.sid); break;
          case 'triggerType': value = this.triggerType; break;
          default: value = '';
        }
      }

      if (filter) value = this.applyFilter(value, filter);
      result = result.replace(fullMatch, value);
    }

    return result;
  }

  async evaluateCondition(expression: string): Promise<boolean> {
    try {
      // Guard against prototype pollution in expr-eval (no patched version exists).
      // Block access to dangerous properties before evaluation.
      if (/(__proto__|constructor|prototype)\s*[.[(]/.test(expression)) {
        logger.warn(`[ExecutionContext] Blocked dangerous expression pattern: "${expression}"`);
        return false;
      }

      const scope = await this.buildExpressionScope();

      // Strip {{...}} template wrappers so scope-variable expressions like
      // "{{temp.savedRoles}} != null" become "temp.savedRoles != null".
      // This prevents template-resolved multi-value strings (e.g. comma-separated
      // group IDs) from being substituted as raw text, which would produce
      // syntactically invalid expressions such as "8,15,75 != null".
      const normalized = expression.replace(/\{\{(.+?)\}\}/g, (_match, inner) => {
        const trimmed = inner.trim();
        const pipeIdx = trimmed.indexOf('|');
        return pipeIdx >= 0 ? trimmed.substring(0, pipeIdx).trim() : trimmed;
      });
      const result = this.exprParser.evaluate(normalized, scope);
      logger.info(`[ExecutionContext] Condition [flow=${this.flowId}] "${normalized}" → ${!!result}`);
      return !!result;
    } catch (err: any) {
      logger.warn(`[ExecutionContext] Expression evaluation failed: "${expression}" — ${err.message}`);
      return false;
    }
  }

  async getVariable(name: string): Promise<string> {
    try {
      const record = await this.prisma.botVariable.findFirst({
        where: { flowId: this.flowId, name, scope: 'flow' },
      });
      return record?.value ?? '';
    } catch {
      return '';
    }
  }

  async setVariable(name: string, value: string): Promise<void> {
    try {
      await this.prisma.botVariable.upsert({
        where: { flowId_name_scope: { flowId: this.flowId, name, scope: 'flow' } },
        update: { value },
        create: { flowId: this.flowId, name, value, scope: 'flow' },
      });
    } catch {
      // Swallow DB errors (e.g. SQLITE_FULL) — variable writes are non-fatal
    }
  }

  async incrementVariable(name: string, amount: string): Promise<void> {
    const current = await this.getVariable(name);
    const currentNum = parseFloat(current) || 0;
    const increment = parseFloat(amount) || 0;
    await this.setVariable(name, String(currentNum + increment));
  }

  async appendVariable(name: string, value: string): Promise<void> {
    const current = await this.getVariable(name);
    await this.setVariable(name, current + value);
  }

  setTemp(name: string, value: any): void {
    this.tempVars.set(name, value);
  }

  getTemp(name: string): any {
    return this.tempVars.get(name);
  }

  private async buildExpressionScope(): Promise<Record<string, any>> {
    // Build event namespace
    const event: Record<string, any> = {};
    for (const [key, val] of Object.entries(this.eventData)) {
      // Try to convert numeric strings to numbers for expression evaluation
      const num = Number(val);
      event[key] = isNaN(num) ? val : num;
    }

    // Build var namespace from DB
    const varRecords = await this.prisma.botVariable.findMany({
      where: { flowId: this.flowId, scope: 'flow' },
    });
    const vars: Record<string, any> = {};
    for (const v of varRecords) {
      const num = Number(v.value);
      vars[v.name] = isNaN(num) ? v.value : num;
    }

    // Build temp namespace — coerce numeric strings so "1" == 1 works in expressions
    const temp: Record<string, any> = {};
    for (const [key, val] of this.tempVars.entries()) {
      temp[key] = coerceNumericStrings(val);
    }

    // Build time namespace
    const tv = getTimeValues(this.timezone);
    const time: Record<string, any> = {};
    for (const [k, v] of Object.entries(tv)) {
      const num = Number(v);
      time[k] = isNaN(num) ? v : num;
    }

    // Register null as a first-class literal so expressions like
    // `{{temp.origin}} != null` work correctly. expr-eval has no built-in null.
    return { event, var: vars, temp, time, null: null };
  }
}
