// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderEmailHtml } from '../src/lib/sanitize';

const render = (html: string, allowRemote = false) =>
  renderEmailHtml({ html, cidUrls: new Map([['logo@x', 'blob:http://app/1']]), allowRemote, highlight: [] });

/** Every way an email might fetch from the network, per the security review. */
const REMOTE_TRICKS = [
  '<img src="https://t.example/p.gif">',
  '<img src="//t.example/p.gif">',
  '<img src="\\\\t.example/p.png">',
  '<img src="https:t.example/x">',
  '<img src="relative/x.png">',
  '<img srcset="https://t.example/a.png 2x">',
  '<table background="https://t.example/bg.png"><tr><td>x</td></tr></table>',
  '<div style="background:url(https://t.example/a.png)">x</div>',
  '<div style="background:u\\72l(https://t.example/a.png)">x</div>',
  '<div style="background:url(\\68ttps://t.example/a.png)">x</div>',
  '<div style="background-image:image-set(&quot;https://t.example/a.png&quot; 1x)">x</div>',
  '<style>@\\69mport "https://t.example/a.css"; .a{background:url(//t.example/b.png)}</style><p class="a">x</p>',
];

/** Elements that fetch via attributes we don't rewrite are removed entirely. */
const REMOVED_ELEMENTS = [
  '<svg><image href="https://t.example/s.png"></image></svg>',
  '<svg><image xlink:href="https://t.example/s.png"></image></svg>',
  '<svg><filter><feImage href="https://t.example/f.png"/></filter></svg>',
  '<svg><use href="https://t.example/u.svg#a"/></svg>',
  '<video poster="https://t.example/v.png"><source src="https://t.example/v.mp4"></video>',
];

describe('renderEmailHtml', () => {
  it.each(REMOVED_ELEMENTS)('removes fetching elements: %s', (html) => {
    expect(render(html).full).not.toMatch(/t\.example/);
  });

  it.each(REMOTE_TRICKS)('blocks and reports remote content: %s', (html) => {
    const r = render(html);
    expect(r.hasRemoteContent).toBe(true);
    expect(r.full).not.toMatch(/t\.example/);
  });

  it('allows remote images only when permitted, as absolute http(s) URLs', () => {
    const r = render('<img src="//t.example/p.gif">', true);
    expect(r.full).toContain('src="https://t.example/p.gif"');
  });

  it('rewrites cid: references and keeps data: images', () => {
    const r = render('<img src="cid:logo@x"><img src="data:image/png;base64,AAAA">');
    expect(r.full).toContain('src="blob:http://app/1"');
    expect(r.full).toContain('src="data:image/png;base64,AAAA"');
    expect(r.hasRemoteContent).toBe(false);
  });

  it('removes scripts, handlers, forms and javascript: links', () => {
    const r = render('<script>x()</script><img src=x onerror="x()"><form action="https://e"><input></form><a href="javascript:x()">j</a>');
    expect(r.full).not.toMatch(/<script|onerror|<form|<input|javascript:/i);
  });

  it('cannot break out of <style> with escaped markup', () => {
    const r = render('<style>.a{color:red}\\3C/style\\3E\\3Cimg src=x onerror=alert(1)\\3E</style><p>x</p>');
    const doc = new DOMParser().parseFromString(r.full, 'text/html');
    expect(doc.querySelectorAll('img').length).toBe(0);
    expect(doc.querySelector('[onerror]')).toBeNull();
  });

  it('forces every link (a, area, svg a) into a new tab without opener', () => {
    const r = render('<a href="https://x.example" target="_self" rel="opener">a</a><map><area href="https://x.example" target="_self" rel="opener"></map><svg><a href="https://x.example" target="_self"><text>s</text></a></svg>');
    const doc = new DOMParser().parseFromString(r.full, 'text/html');
    const links = [...doc.querySelectorAll('a, area')];
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const l of links) {
      expect(l.getAttribute('target')).toBe('_blank');
      expect(l.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('carries a restrictive CSP in the frame document', () => {
    expect(render('<p>x</p>').full).toContain("img-src data: blob:;");
  });

  it('trims Gmail quoted history but not forwards', () => {
    const reply = render('<div>New</div><div class="gmail_quote"><div class="gmail_attr">On Mon, Jane wrote:</div><blockquote>old</blockquote></div>');
    expect(reply.trimmed).toContain('New');
    expect(reply.trimmed).not.toContain('old');
    const fwd = render('<div>FYI</div><div class="gmail_quote">---------- Forwarded message ---------<br>From: x</div>');
    expect(fwd.trimmed).toBeNull();
  });
});
