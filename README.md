# Mbox Viewer

A private, in-browser viewer for `.mbox` email archives that works like Gmail. Built for Google Takeout exports (including multi-GB ones), and it also reads mbox files from Thunderbird, Apple Mail and others, plus single `.eml` files.

Nothing is uploaded. Files are parsed in your browser and stored only in this browser's private storage until you clear them.

## Features

- **Gmail layout**: labels sidebar with unread counts, Primary/Promotions/Social/Updates/Forums tabs, conversation list with stars, importance markers, label chips and attachment chips, and paging ("1–50 of 12,345").
- **Real Gmail data**: Takeout's `X-Gmail-Labels` and `X-GM-THRID` headers become folders, nested labels, categories, stars, read state and the original conversations. Other mbox files are threaded by `References`/`In-Reply-To`.
- **Conversation view**: older messages collapse, quoted history hides behind `•••`, a recipient details popover, attachments with image previews, Show original (with SPF/DKIM/DMARC), and `.eml` download.
- **Search**: Gmail operators (`from:`, `to:`, `subject:`, `label:`, `in:`, `is:unread`, `has:attachment`, `filename:`, `before:`/`after:`, `older_than:`, `larger:`, `-term`, `OR`, `"phrases"`), an advanced search panel, quick filter chips, and full-text body search in a background worker.
- **Keyboard shortcuts**: `j`/`k`, `o`, `u`, `x`, `s`, `/`, `g i`, `*a`, `Shift+I`/`Shift+U` and more. Press `?` in the app for the full list.
- **Merge and export**: open several files to merge them into one mailbox (duplicates are skipped). Export any conversation, selection, search or the whole merged mailbox as `.mbox`.
- **Print**: Gmail-style print layout for a message or a whole conversation.
- **Settings**: density, light/dark/system theme, reading pane (no split or right), page size, external image policy.

## Privacy and security

- Email HTML is sanitized with DOMPurify and rendered in a sandboxed iframe that cannot run scripts.
- Remote images and CSS backgrounds are blocked until you choose to display them (per message, per sender, or always), so opening an old message doesn't tell a tracker you read it.
- Production builds ship a strict Content-Security-Policy. `vercel.json` adds frame and referrer protections.
- Raw files are kept in the browser's origin-private file system (OPFS) and the index in IndexedDB. **Settings → Clear all data** removes both.

## Development

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (splitter, parsing, charset handling, threading, search)
npm run build      # type-check + production build into dist/
npm run sample     # writes sample.mbox (Takeout-style test data); `npm run sample -- 50000 big.mbox` for more
```

## How it works

| Piece | File |
|---|---|
| Streaming byte-level mbox splitter (no charset guessing, handles `>From` escaping and CRLF) | `src/lib/mbox/splitter.ts` |
| Import worker: reads 8 MB chunks, parses with postal-mime, writes IndexedDB and OPFS | `src/lib/mbox/import.worker.ts`, `extract.ts` |
| Threading (Gmail thread IDs, then message references) | `src/lib/threads.ts` |
| Search syntax and full-text worker | `src/lib/search/` |
| HTML sanitizing, image blocking, quote trimming | `src/lib/sanitize.ts` |
| App state | `src/store.ts` |

Message bodies are never held in memory in bulk. Only list metadata is, and each message is re-read from storage by byte offset and parsed when you open it.

## Limits

- Very large mailboxes (hundreds of thousands of messages) need a few hundred MB of RAM for the list index. For reference, 100k messages used about 270 MB.
- If the browser doesn't have enough storage to keep a copy of a file, the app still indexes it but asks you to re-select the file after a reload to read messages.
