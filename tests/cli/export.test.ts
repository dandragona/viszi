// Tests for the static-HTML export pipeline. We import `jsonForScript` indirectly
// through the export module via re-export. To keep the dependency small, we
// re-export the helper from the export command for tests.

import { describe, it, expect } from 'vitest';
import { jsonForScript, escapeHtml } from '../../src/cli/commands/export.js';

describe('jsonForScript', () => {
  it('passes through ordinary JSON unchanged', () => {
    const out = jsonForScript({ a: 1, b: 'hello' });
    expect(JSON.parse(out)).toEqual({ a: 1, b: 'hello' });
  });

  it('neutralises </script> embedded in string values', () => {
    const payload = { rogue: 'pre </script> post' };
    const out = jsonForScript(payload);
    expect(out).not.toMatch(/<\/script>/i);
    expect(out).toMatch(/<\\\/script>/i);
    // Round-trip via JSON.parse (after unescaping the backslash) still works.
    const parsed = JSON.parse(out.replace(/<\\\/(script|style)/gi, '</$1'));
    expect(parsed).toEqual(payload);
  });

  it('neutralises </style> embedded in string values', () => {
    const out = jsonForScript({ x: 'a </style> b' });
    expect(out).not.toMatch(/<\/style>/i);
    expect(out).toMatch(/<\\\/style>/i);
  });

  it('handles uppercase variants (</SCRIPT>, </Style>)', () => {
    const out = jsonForScript({ x: '</SCRIPT> </Style> </script ' });
    expect(out).not.toMatch(/<\/script>/i);
    expect(out).not.toMatch(/<\/style>/i);
  });

  it('does not introduce script-tag breakouts when the produced HTML is parsed', () => {
    // Embed the produced JSON in a <script> tag the way export.ts does and
    // verify the closing </script> position is the one we control.
    const malicious = {
      // common evasion attempts
      a: '</script><img src=x onerror=alert(1)>',
      b: '</style><script>alert(2)</script>',
      c: 'lone <',
      d: '</script>', // unicode escape — JSON.stringify keeps it as `</script>`
    };
    const literal = jsonForScript(malicious);
    const html = `<script>window.DATA = ${literal};</script>`;
    // The only </script in the rendered HTML must be the trailing tag.
    const indexes: number[] = [];
    const re = /<\/script/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) indexes.push(m.index);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toBe(html.length - '</script>'.length);
  });
});

describe('escapeHtml', () => {
  it('escapes &, <, >, "', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });
});
