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
  const onWrotePatterns = [
    /^On .+wrote:\s*$/m,
    /^On .+<.+@.+> wrote:\s*$/m,
    /^\d{4}-\d{2}-\d{2} .+ <.+@.+>:\s*$/m,
  ];

  for (const pattern of onWrotePatterns) {
    const match = text.match(pattern);
    if (match) {
      return splitAtMatch(text, match);
    }
  }

  // Strategy 2: Consecutive ">" quoted lines (2+ lines starting with >)
  const quotedBlockMatch = text.match(/^(>[\t ]*.*\n?){2,}/m);
  if (quotedBlockMatch) {
    const blockStart = text.indexOf(quotedBlockMatch[0]);
    const textBefore = text.substring(0, blockStart);
    const linesBeforeBlock = textBefore.trimEnd().split('\n');
    const lastLineBefore = linesBeforeBlock[linesBeforeBlock.length - 1] || '';
    if (/^On .+wrote:\s*$/.test(lastLineBefore.trim()) || /^.*<.+@.+>.*wrote:\s*$/.test(lastLineBefore.trim())) {
      const adjustedStart = textBefore.lastIndexOf(lastLineBefore);
      return {
        newContent: text.substring(0, adjustedStart).trim(),
        quotedContent: text.substring(adjustedStart).trim(),
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
  // Strategy 1: <blockquote> with type="cite" or Gmail's class
  const blockquotePatterns = [
    /<blockquote[^>]*type=["']cite["'][^>]*>/i,
    /<blockquote[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>/i,
  ];

  for (const pattern of blockquotePatterns) {
    const match = html.match(pattern);
    if (match) {
      return splitAtMatch(html, match);
    }
  }

  // Strategy 2: <div class="gmail_quote">
  const gmailQuoteMatch = html.match(/<div[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>/i);
  if (gmailQuoteMatch) {
    return splitAtMatch(html, gmailQuoteMatch);
  }

  // Strategy 3: Generic <blockquote> (only if it appears after some content)
  const genericBlockquoteMatch = html.match(/<blockquote[^>]*>/i);
  if (genericBlockquoteMatch) {
    const beforeBlockquote = html.substring(0, genericBlockquoteMatch.index).replace(/<[^>]*>/g, '').trim();
    if (beforeBlockquote.length > 20) {
      return splitAtMatch(html, genericBlockquoteMatch);
    }
  }

  // Strategy 4: Text patterns inside HTML
  const htmlOnWrotePattern = /On\s(?:<[^>]*>|\s)*.+(?:<[^>]*>|\s)*wrote:\s*(?:<[^>]*>)*/i;
  const htmlOnWroteMatch = html.match(htmlOnWrotePattern);
  if (htmlOnWroteMatch) {
    return splitAtMatch(html, htmlOnWroteMatch);
  }

  // Divider patterns in HTML
  const htmlDividerPatterns = [
    /-{2,}\s*Original Message\s*-{2,}/i,
    /-{3,}\s*Forwarded message\s*-{3,}/i,
  ];

  for (const pattern of htmlDividerPatterns) {
    const match = html.match(pattern);
    if (match) {
      const tagBoundaryIndex = findPrecedingTagBoundary(html, match.index);
      return {
        newContent: html.substring(0, tagBoundaryIndex).trim(),
        quotedContent: html.substring(tagBoundaryIndex).trim(),
        hasQuotes: true,
      };
    }
  }

  // No quoted content detected
  return { newContent: html, quotedContent: '', hasQuotes: false };
}

function splitAtMatch(text, match) {
  const splitIndex = match.index;
  return {
    newContent: text.substring(0, splitIndex).trim(),
    quotedContent: text.substring(splitIndex).trim(),
    hasQuotes: true,
  };
}

function findPrecedingTagBoundary(html, position) {
  let i = position;
  while (i > 0) {
    if (html[i] === '<' && html[i + 1] !== '/') {
      return i;
    }
    if (html[i] === '>' && i < position - 1) {
      return i + 1;
    }
    i--;
  }
  return position;
}
