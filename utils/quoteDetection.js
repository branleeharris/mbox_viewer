// File: utils/quoteDetection.js

/**
 * Detects and separates new content from quoted content in an email.
 * Uses pattern-based detection for common email quoting conventions.
 *
 * @param {string} text - The email content string
 * @param {boolean} isHtml - Whether the content is HTML
 * @returns {{ newContent: string, quotedContent: string, hasQuotes: boolean }}
 */
export function extractNewContent(text, isHtml = false) {
  if (!text) return { newContent: '', quotedContent: '', hasQuotes: false };

  if (isHtml) {
    return extractFromHtml(text);
  }

  return extractFromPlainText(text);
}

function extractFromPlainText(text) {
  // Strategy 1: "On [date], [name] wrote:" markers (Gmail, Apple Mail, Thunderbird)
  // Single-line patterns first (more specific)
  const onWrotePatterns = [
    /^On .+<.+@.+> wrote:\s*$/m,
    /^On .+wrote:\s*$/m,
    /^\d{4}-\d{2}-\d{2} .+ <.+@.+>:\s*$/m,
  ];

  for (const pattern of onWrotePatterns) {
    const match = text.match(pattern);
    if (match) {
      return splitAtMatch(text, match);
    }
  }

  // Multi-line "On...wrote:" — Gmail often wraps the attribution across many lines:
  // "On Thu,\nApr 2,\n2026 at\n7:47\nPM\nName\n<email@example.com>\nwrote:"
  const multiLineOnWrote = /^On [\s\S]{1,500}?wrote:\s*$/m;
  const multiLineMatch = text.match(multiLineOnWrote);
  if (multiLineMatch) {
    // Verify it looks like a real attribution (contains a date-like pattern)
    const matchText = multiLineMatch[0];
    if (/\d{1,4}/.test(matchText) && matchText.split('\n').length <= 15) {
      return splitAtMatch(text, multiLineMatch);
    }
  }

  // Strategy 2: Consecutive ">" quoted lines (2+ lines starting with >)
  const quotedBlockMatch = text.match(/^(>[\t ]*.*\n?){2,}/m);
  if (quotedBlockMatch) {
    const blockStart = quotedBlockMatch.index;
    const textBefore = text.substring(0, blockStart);
    const linesBeforeBlock = textBefore.trimEnd().split('\n');
    // Walk backward to find the start of a multi-line attribution (e.g., Gmail wraps
    // "On Mon, Jan 1, 2024 at 10:00 AM Alice\n<alice@example.com> wrote:")
    let attributionStartIndex = -1;
    for (let i = linesBeforeBlock.length - 1; i >= 0 && i >= linesBeforeBlock.length - 3; i--) {
      const line = linesBeforeBlock[i].trim();
      if (/^On .+/.test(line)) {
        // Found the "On ..." start of the attribution
        const linePos = textBefore.lastIndexOf(linesBeforeBlock[i]);
        attributionStartIndex = linePos;
        break;
      }
      if (/wrote:\s*$/.test(line) || /^.*<.+@.+>/.test(line)) {
        // This is a continuation line of the attribution, keep looking
        continue;
      }
      break;
    }
    if (attributionStartIndex >= 0) {
      return {
        newContent: text.substring(0, attributionStartIndex).trim(),
        quotedContent: text.substring(attributionStartIndex).trim(),
        hasQuotes: true,
      };
    }
    return {
      newContent: text.substring(0, blockStart).trim(),
      quotedContent: text.substring(blockStart).trim(),
      hasQuotes: true,
    };
  }

  // Strategy 3: Divider lines
  const dividerPatterns = [
    /^-{2,}\s*Original Message\s*-{2,}/m,
    /^-{3,}\s*Forwarded message\s*-{3,}/m,
    /^_{5,}\s*$/m,
    /^-{5,}\s*$/m,
  ];

  for (const pattern of dividerPatterns) {
    const match = text.match(pattern);
    if (match) {
      return splitAtMatch(text, match);
    }
  }

  // Strategy 4: Inline header blocks (Outlook style)
  const headerBlockPattern = /^From:\s*.+\n(?:Sent|Date):\s*.+\nTo:\s*.+\nSubject:\s*.+/m;
  const headerMatch = text.match(headerBlockPattern);
  if (headerMatch) {
    return splitAtMatch(text, headerMatch);
  }

  // No quoted content detected
  return { newContent: text, quotedContent: '', hasQuotes: false };
}

function extractFromHtml(html) {
  // Strategy 1: HTML-specific quote markers (blockquote, gmail_quote)
  const htmlQuotePatterns = [
    /<blockquote[^>]*type=["']cite["'][^>]*>/i,
    /<blockquote[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>/i,
    /<div[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>/i,
  ];

  for (const pattern of htmlQuotePatterns) {
    const match = html.match(pattern);
    if (match) {
      return splitAtMatch(html, match);
    }
  }

  // Strategy 2: Generic <blockquote> (only if meaningful content precedes it)
  const genericBlockquoteMatch = html.match(/<blockquote[^>]*>/i);
  if (genericBlockquoteMatch) {
    const beforeBlockquote = html.substring(0, genericBlockquoteMatch.index).replace(/<[^>]*>/g, '').trim();
    if (beforeBlockquote.length > 20) {
      return splitAtMatch(html, genericBlockquoteMatch);
    }
  }

  // Strategy 3: Strip HTML to plain text, run plain text detection, map back
  // This catches all text-based quote patterns (On...wrote:, dividers, Outlook
  // headers) regardless of how they're broken up by HTML tags.
  const stripped = stripHtmlToText(html);
  const plainResult = extractFromPlainText(stripped);

  if (plainResult.hasQuotes && plainResult.newContent) {
    // Find where the new content ends in the original HTML
    // by matching the last ~40 chars of newContent against the HTML
    const newContentText = plainResult.newContent;
    const tailLength = Math.min(40, newContentText.length);
    const tail = newContentText.slice(-tailLength);

    // Build a regex that matches the tail text with optional HTML tags between chars
    const escapedTail = tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexPattern = escapedTail.split('').join('(?:<[^>]*>|\\s)*');
    const tailRegex = new RegExp(flexPattern, 'i');
    const tailMatch = html.match(tailRegex);

    if (tailMatch) {
      // Split after the matched tail text
      const splitPos = tailMatch.index + tailMatch[0].length;
      // Walk forward past any remaining tags/whitespace to find a clean boundary
      let cleanPos = splitPos;
      while (cleanPos < html.length) {
        if (html[cleanPos] === '<') {
          const closeTag = html.indexOf('>', cleanPos);
          if (closeTag !== -1) {
            cleanPos = closeTag + 1;
          } else {
            break;
          }
        } else if (/\s/.test(html[cleanPos])) {
          cleanPos++;
        } else {
          break;
        }
      }
      return {
        newContent: html.substring(0, splitPos).trim(),
        quotedContent: html.substring(cleanPos).trim(),
        hasQuotes: true,
      };
    }

    // Fallback: use a proportional split based on the plain text ratio
    const ratio = newContentText.length / stripped.length;
    const approxSplitPos = Math.floor(html.length * ratio);
    const boundaryPos = findNearestTagBoundary(html, approxSplitPos);
    return {
      newContent: html.substring(0, boundaryPos).trim(),
      quotedContent: html.substring(boundaryPos).trim(),
      hasQuotes: true,
    };
  }

  // No quoted content detected
  return { newContent: html, quotedContent: '', hasQuotes: false };
}

/**
 * Strip HTML tags to plain text for quote boundary detection.
 */
function stripHtmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\r\n/g, '\n');
}

/**
 * Find the nearest HTML tag boundary to a position.
 */
function findNearestTagBoundary(html, position) {
  // Look forward for the next tag start
  for (let i = position; i < Math.min(position + 100, html.length); i++) {
    if (html[i] === '<') return i;
  }
  // Look backward
  for (let i = position; i > Math.max(position - 100, 0); i--) {
    if (html[i] === '<') return i;
  }
  return position;
}

function splitAtMatch(text, match) {
  const splitIndex = match.index;
  return {
    newContent: text.substring(0, splitIndex).trim(),
    quotedContent: text.substring(splitIndex).trim(),
    hasQuotes: true,
  };
}

