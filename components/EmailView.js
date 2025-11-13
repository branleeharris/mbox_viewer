// File: components/EmailView.js
import { useState, useEffect, useMemo } from 'react';

export default function EmailView({ conversation, searchTerm }) {
  const [expandedEmails, setExpandedEmails] = useState(new Set());
  const [activeTab, setActiveTab] = useState('html');
  const [expandedRecipients, setExpandedRecipients] = useState(new Set());
  const [expandedQuotes, setExpandedQuotes] = useState(new Set());

  // Expand the most recent email by default
  useEffect(() => {
    if (conversation && conversation.emails && conversation.emails.length > 0) {
      setExpandedEmails(new Set([conversation.emails.length - 1]));
    }
  }, [conversation]);

  // Clean up email body content
  const cleanEmailContent = (email) => {
    if (!email) return { text: '', html: '' };

    let cleanedText = '';
    let cleanedHtml = '';

    // For plain text, remove MIME boundaries and headers
    if (email.bodyText) {
      cleanedText = email.bodyText
        // Remove MIME boundaries
        .replace(/--[a-zA-Z0-9_.-]+(?:--)?\r?\n/g, '')
        // Remove Content-Type headers
        .replace(/Content-Type: [^\r\n]+\r?\n/g, '')
        // Remove Content-Transfer-Encoding headers
        .replace(/Content-Transfer-Encoding: [^\r\n]+\r?\n/g, '')
        // Remove blank lines at the beginning
        .replace(/^\s+/, '')
        // Remove Content-Disposition headers
        .replace(/Content-Disposition: [^\r\n]+\r?\n/g, '');

      // If the content still has MIME-looking stuff, try to extract just what looks like actual message content
      if (cleanedText.includes('Content-Type:') || cleanedText.includes('--=')) {
        const contentMatches = cleanedText.match(/(?:^|\n\n)([\s\S]+?)(?:\n\n|$)/g);
        if (contentMatches && contentMatches.length > 0) {
          // Find the longest text segment that doesn't look like headers
          cleanedText = contentMatches
            .filter(segment => !segment.includes('Content-Type:') &&
                              !segment.includes('--=') &&
                              segment.trim().length > 10)
            .sort((a, b) => b.length - a.length)[0] || cleanedText;
        }
      }
    }

    // For HTML, use the content if available, otherwise convert plain text
    if (email.bodyHtml) {
      cleanedHtml = email.bodyHtml
        // Remove MIME boundaries and headers in case they got into the HTML
        .replace(/--[a-zA-Z0-9_.-]+(?:--)?\r?\n/g, '')
        .replace(/Content-Type: [^\r\n]+\r?\n/g, '')
        .replace(/Content-Transfer-Encoding: [^\r\n]+\r?\n/g, '');
    } else if (cleanedText) {
      // Convert plain text to simple HTML
      cleanedHtml = cleanedText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }

    return { text: cleanedText, html: cleanedHtml };
  };

  // Normalize text for comparison (strip HTML, normalize whitespace, lowercase)
  const normalizeTextForComparison = (text, isHtml) => {
    if (!text) return '';

    let normalized = text;

    // Strip HTML tags if HTML content
    if (isHtml) {
      // Remove script and style elements completely
      normalized = normalized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      normalized = normalized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      // Remove HTML tags
      normalized = normalized.replace(/<[^>]+>/g, ' ');
      // Decode common HTML entities
      normalized = normalized.replace(/&nbsp;/g, ' ');
      normalized = normalized.replace(/&amp;/g, '&');
      normalized = normalized.replace(/&lt;/g, '<');
      normalized = normalized.replace(/&gt;/g, '>');
      normalized = normalized.replace(/&quot;/g, '"');
    }

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ');
    normalized = normalized.trim();

    // Convert to lowercase for comparison
    normalized = normalized.toLowerCase();

    return normalized;
  };

  // Split text into chunks (lines/paragraphs) for comparison
  const chunkText = (text) => {
    if (!text) return [];

    // Split by newlines and filter out very short chunks
    const chunks = text
      .split(/\n+/)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length >= 20); // Minimum 20 chars to avoid false positives

    return chunks;
  };

  // Find new content by comparing against previous emails (content deduplication)
  const findNewContent = (currentText, previousEmailsContent, isHtml) => {
    if (!currentText) return { newContent: '', quotedContent: '', hasQuotes: false };
    if (!previousEmailsContent || previousEmailsContent.length === 0) {
      // No previous emails, so all content is new
      return { newContent: currentText, quotedContent: '', hasQuotes: false };
    }

    // Normalize current email
    const normalizedCurrent = normalizeTextForComparison(currentText, isHtml);
    const currentChunks = chunkText(normalizedCurrent);

    // Build a set of all chunks from previous emails
    const previousChunksSet = new Set();
    previousEmailsContent.forEach(prevEmail => {
      const normalizedPrev = normalizeTextForComparison(prevEmail, isHtml);
      const prevChunks = chunkText(normalizedPrev);
      prevChunks.forEach(chunk => previousChunksSet.add(chunk));
    });

    // Find which chunks in current email are new (not in previous emails)
    const newChunksIndices = new Set();
    const quotedChunksIndices = new Set();

    currentChunks.forEach((chunk, index) => {
      if (previousChunksSet.has(chunk)) {
        quotedChunksIndices.add(index);
      } else {
        newChunksIndices.add(index);
      }
    });

    // If most content is new, return original content
    if (quotedChunksIndices.size === 0) {
      return { newContent: currentText, quotedContent: '', hasQuotes: false };
    }

    // Split original text to separate new from quoted
    // This is a simple heuristic: keep text at start until we hit quoted chunks
    const originalLines = currentText.split(/\n+/);
    const newLines = [];
    const quotedLines = [];
    let inQuotedSection = false;
    let currentChunkIndex = 0;

    for (const line of originalLines) {
      const lineNormalized = normalizeTextForComparison(line, isHtml);

      if (lineNormalized.length >= 20) {
        // This is a substantial line, check if it's quoted
        if (quotedChunksIndices.has(currentChunkIndex)) {
          inQuotedSection = true;
          quotedLines.push(line);
        } else if (newChunksIndices.has(currentChunkIndex)) {
          if (!inQuotedSection) {
            newLines.push(line);
          } else {
            quotedLines.push(line);
          }
        }
        currentChunkIndex++;
      } else {
        // Short line, attach it to current section
        if (inQuotedSection) {
          quotedLines.push(line);
        } else {
          newLines.push(line);
        }
      }
    }

    // If we couldn't separate cleanly, fall back to keeping first 40% as new
    if (newLines.length === 0 && originalLines.length > 0) {
      const splitPoint = Math.ceil(originalLines.length * 0.4);
      return {
        newContent: originalLines.slice(0, splitPoint).join('\n').trim(),
        quotedContent: originalLines.slice(splitPoint).join('\n').trim(),
        hasQuotes: true
      };
    }

    return {
      newContent: newLines.join('\n').trim() || currentText,
      quotedContent: quotedLines.join('\n').trim(),
      hasQuotes: quotedLines.length > 0
    };
  };

  // Wrapper function that maintains the same interface as before
  const parseQuotedContent = (text, isHtml, previousEmailsContent = []) => {
    return findNewContent(text, previousEmailsContent, isHtml);
  };

  // Pre-process emails with content deduplication for screen display
  const processedEmails = useMemo(() => {
    if (!conversation || !conversation.emails) return [];

    // Sort emails chronologically for processing
    const sortedEmails = [...conversation.emails].sort((a, b) => new Date(a.date) - new Date(b.date));
    const previousEmailsContent = [];
    const processed = [];

    sortedEmails.forEach((email, index) => {
      const content = cleanEmailContent(email);
      const isHtml = email.bodyHtml && content.html;
      const currentContent = isHtml ? content.html : content.text;

      // Parse with deduplication
      const parsed = parseQuotedContent(currentContent, isHtml, previousEmailsContent);

      // Store processed result with original index
      const originalIndex = conversation.emails.indexOf(email);
      processed.push({
        email,
        originalIndex,
        content,
        parsed,
        isHtml
      });

      // Add to previous emails for next iteration
      previousEmailsContent.push(currentContent);
    });

    // Return in original conversation order
    return processed.sort((a, b) => a.originalIndex - b.originalIndex);
  }, [conversation]);

  if (!conversation) return null;
  
  // Format date for display
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString([], {
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };
  
  // Generate color for avatar based on sender email
  const getAvatarColor = (email) => {
    if (!email) return '#1976D2';
    
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
  };
  
  // Get sender name or initials for avatar
  const getSenderInitials = (from) => {
    if (!from) return '?';
    
    // Try to extract name from "Name <email@example.com>" format
    const namePart = from.split('<')[0].trim();
    if (!namePart) return '?';
    
    const parts = namePart.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Get sender name for display
  const getSenderName = (from) => {
    if (!from) return 'Unknown';

    const namePart = from.split('<')[0].trim();
    return namePart || from;
  };

  // Toggle quote expansion
  const toggleQuoteExpansion = (index) => {
    setExpandedQuotes(prevExpanded => {
      const newExpanded = new Set(prevExpanded);
      if (newExpanded.has(index)) {
        newExpanded.delete(index);
      } else {
        newExpanded.add(index);
      }
      return newExpanded;
    });
  };

  // Toggle email expansion
  const toggleEmailExpansion = (index) => {
    setExpandedEmails(prevExpanded => {
      const newExpanded = new Set(prevExpanded);
      if (newExpanded.has(index)) {
        newExpanded.delete(index);
      } else {
        newExpanded.add(index);
      }
      return newExpanded;
    });
  };
  
  // Toggle recipient list expansion
  const toggleRecipientExpansion = (index) => {
    setExpandedRecipients(prevExpanded => {
      const newExpanded = new Set(prevExpanded);
      if (newExpanded.has(index)) {
        newExpanded.delete(index);
      } else {
        newExpanded.add(index);
      }
      return newExpanded;
    });
  };
  
  // Check if recipient list is long (more than ~50 characters)
  const isRecipientListLong = (recipients) => {
    return recipients && recipients.length > 50;
  };
  
  // Format recipient list with truncation or expansion
  const formatRecipients = (recipients, index) => {
    if (!recipients) return 'Unknown';
    
    const isExpanded = expandedRecipients.has(index);
    const isLong = isRecipientListLong(recipients);
    
    if (!isLong) {
      // If it's not long, just display normally
      return searchTerm ? (
        <span dangerouslySetInnerHTML={{ __html: highlightText(recipients) }} />
      ) : recipients;
    }
    
    if (isExpanded) {
      // If expanded, show full list with button to collapse
      return (
        <div>
          {searchTerm ? (
            <span dangerouslySetInnerHTML={{ __html: highlightText(recipients) }} />
          ) : recipients}
          <button
            onClick={(e) => {
              e.preventDefault();
              toggleRecipientExpansion(index);
            }}
            className="ml-2 text-xs text-blue-600 hover:text-blue-800"
          >
            Show less
          </button>
        </div>
      );
    } else {
      // If collapsed, show truncated version with button to expand
      const truncated = recipients.substring(0, 50) + '...';
      return (
        <div>
          {searchTerm ? (
            <span dangerouslySetInnerHTML={{ __html: highlightText(truncated) }} />
          ) : truncated}
          <button
            onClick={(e) => {
              e.preventDefault();
              toggleRecipientExpansion(index);
            }}
            className="ml-2 text-xs text-blue-600 hover:text-blue-800"
          >
            Show all recipients
          </button>
        </div>
      );
    }
  };

  // Highlight text matched by search term
  const highlightText = (text) => {
    if (!searchTerm || !text) return text;
    
    // Escape special characters in search term for regex
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Replace matches with highlighted spans
    return text.replace(
      new RegExp(`(${escapedSearchTerm})`, 'gi'), 
      '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>'
    );
  };
  
  // Print the current email
  const handlePrintEmail = (email) => {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      alert('Please allow pop-ups to print emails');
      return;
    }

    const content = cleanEmailContent(email);

    // Build previous emails content for deduplication
    const emailIndex = conversation.emails.findIndex(e => e.id === email.id || e === email);
    const previousEmailsContent = [];

    if (emailIndex > 0) {
      // Get all emails before this one
      const sortedEmails = [...conversation.emails].sort((a, b) => new Date(a.date) - new Date(b.date));
      const currentEmailIndex = sortedEmails.findIndex(e => e.id === email.id || e === email);

      for (let i = 0; i < currentEmailIndex; i++) {
        const prevContent = cleanEmailContent(sortedEmails[i]);
        const prevIsHtml = sortedEmails[i].bodyHtml && prevContent.html;
        previousEmailsContent.push(prevIsHtml ? prevContent.html : prevContent.text);
      }
    }

    // Parse content to extract only new content (strip quoted text)
    const isHtml = activeTab === 'html' && content.html;
    const currentContent = isHtml ? content.html : content.text;
    const parsed = parseQuotedContent(currentContent, isHtml, previousEmailsContent);
    const newContent = parsed.newContent || currentContent;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email: ${email.subject}</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.5; margin: 20px; font-size: 12pt; }
          .email-container { max-width: 800px; margin: 0 auto; border: 1px solid #ccc; padding: 15px; background: #fafafa; }
          .header { border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 15px; }
          .header-item { margin-bottom: 5px; font-size: 10pt; }
          .label { font-weight: bold; width: 60px; display: inline-block; }
          .body { margin-top: 15px; font-size: 11pt; line-height: 1.6; }
          .body pre { white-space: pre-wrap; font-family: Arial, sans-serif; margin: 0; }
          .attachments { margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10pt; }
          .print-footer { text-align: center; color: #999; margin-top: 30px; font-size: 9pt; }
          @media print {
            body { margin: 0; padding: 15px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <div class="header-item"><span class="label">From:</span> ${email.from}</div>
            <div class="header-item"><span class="label">To:</span> ${email.to}</div>
            <div class="header-item"><span class="label">Subject:</span> ${email.subject}</div>
            <div class="header-item"><span class="label">Date:</span> ${formatDate(email.date)}</div>
          </div>

          <div class="body">
            ${isHtml ? newContent : '<pre>' + newContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>'}
          </div>

          ${email.attachments && email.attachments.length > 0 ? `
            <div class="attachments">
              <strong>Attachments:</strong> ${email.attachments.map(att => att.filename).join(', ')}
            </div>
          ` : ''}
        </div>

        <div class="print-footer">
          <p>Printed from MBOX Viewer &bull; ${new Date().toLocaleDateString()}</p>
          <button class="no-print" onclick="window.print()" style="margin: 10px 5px; padding: 8px 16px; cursor: pointer;">Print</button>
          <button class="no-print" onclick="window.close()" style="margin: 10px 5px; padding: 8px 16px; cursor: pointer;">Close</button>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };
  
  // Print the entire conversation
  const handlePrintConversation = () => {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      alert('Please allow pop-ups to print emails');
      return;
    }

    // Start building the HTML content for the print window
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Conversation: ${conversation.subject}</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.5; margin: 20px; font-size: 12pt; }
          .conversation-container { max-width: 800px; margin: 0 auto; }
          .conversation-header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .conversation-header h1 { font-size: 16pt; margin: 0 0 8px 0; }
          .conversation-header p { margin: 4px 0; font-size: 10pt; color: #666; }
          .email { border: 1px solid #ccc; padding: 12px; margin-bottom: 15px; border-radius: 4px; background: #fafafa; }
          .email-header { font-size: 10pt; color: #444; margin-bottom: 10px; line-height: 1.4; }
          .email-number { font-weight: bold; color: #666; font-size: 9pt; margin-bottom: 4px; }
          .email-meta { display: flex; justify-content: space-between; flex-wrap: wrap; }
          .email-from { font-weight: bold; }
          .email-date { color: #666; font-size: 9pt; }
          .email-body { margin-top: 10px; font-size: 11pt; line-height: 1.6; color: #000; }
          .email-body pre { white-space: pre-wrap; font-family: Arial, sans-serif; margin: 0; }
          .attachments-info { margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; }
          .print-footer { text-align: center; color: #999; margin-top: 30px; font-size: 9pt; border-top: 1px solid #ddd; padding-top: 15px; }
          @media print {
            body { margin: 0; padding: 15px; }
            .no-print { display: none; }
            .email { break-inside: avoid; page-break-inside: avoid; }
            .conversation-header { break-after: avoid; page-break-after: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="conversation-container">
          <div class="conversation-header">
            <h1>${conversation.subject}</h1>
            <p>${conversation.emails?.length || 0} messages &bull; ${conversation.participants?.slice(0, 3).join(', ') || 'Unknown'}${conversation.participants && conversation.participants.length > 3 ? ' and others' : ''}</p>
          </div>
    `;

    // Add each email in the conversation
    if (conversation.emails && conversation.emails.length > 0) {
      // Sort emails by date (oldest first for printing)
      const sortedEmails = [...conversation.emails].sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
      });

      const totalEmails = sortedEmails.length;

      // Build up previous emails content as we go
      const previousEmailsContent = [];

      sortedEmails.forEach((email, index) => {
        const content = cleanEmailContent(email);

        // Parse content to extract only new content (strip quoted text)
        // Pass all previous emails' content for deduplication
        const isHtml = email.bodyHtml && content.html;
        const currentContent = isHtml ? content.html : content.text;
        const parsed = parseQuotedContent(currentContent, isHtml, previousEmailsContent);
        const newContent = parsed.newContent || currentContent;

        // Add this email's content to the previous emails list for next iteration
        previousEmailsContent.push(currentContent);

        // Format date more compactly
        const dateStr = formatDate(email.date);

        htmlContent += `
          <div class="email">
            <div class="email-number">Message ${index + 1} of ${totalEmails}</div>
            <div class="email-header">
              <div class="email-meta">
                <div class="email-from">${email.from}</div>
                <div class="email-date">${dateStr}</div>
              </div>
            </div>

            <div class="email-body">
              ${isHtml ? newContent : '<pre>' + newContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>'}
            </div>

            ${email.attachments && email.attachments.length > 0 ? `
              <div class="attachments-info">
                📎 ${email.attachments.length} attachment${email.attachments.length > 1 ? 's' : ''}: ${email.attachments.map(att => att.filename).join(', ')}
              </div>
            ` : ''}
          </div>
        `;
      });
    }

    // Close the HTML content
    htmlContent += `
        </div>

        <div class="print-footer">
          <p>Printed from MBOX Viewer &bull; ${new Date().toLocaleDateString()}</p>
          <button class="no-print" onclick="window.print()" style="margin: 10px 5px; padding: 8px 16px; cursor: pointer;">Print</button>
          <button class="no-print" onclick="window.close()" style="margin: 10px 5px; padding: 8px 16px; cursor: pointer;">Close</button>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;

    // Write the content to the print window
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };
  
  // Save attachment
  const handleSaveAttachment = (attachment) => {
    if (!attachment.content) {
      alert('Attachment content is not available');
      return;
    }
    
    const blob = new Blob([attachment.content], { type: attachment.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white shadow rounded overflow-hidden">
      {/* Conversation header with print conversation button */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold">
              {searchTerm ? (
                <span dangerouslySetInnerHTML={{ 
                  __html: highlightText(conversation.subject) 
                }} />
              ) : conversation.subject}
            </h2>
            
            <div className="mt-2 flex items-center text-sm text-gray-500">
              <span className="bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-xs font-medium mr-2">
                {conversation.emails?.length || 0} messages
              </span>
              <span>
                Between: {conversation.participants?.slice(0, 3).join(', ') || 'Unknown'}
                {conversation.participants && conversation.participants.length > 3 && ' and others'}
              </span>
            </div>
            
            {searchTerm && (
              <div className="mt-2 bg-yellow-50 border border-yellow-100 rounded px-3 py-1.5 text-sm">
                <span className="font-medium">Search term: </span>
                <span className="bg-yellow-200 px-1 py-0.5 rounded">{searchTerm}</span>
              </div>
            )}
          </div>
          
          {/* Print conversation button */}
          <button
            onClick={handlePrintConversation}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Conversation
          </button>
        </div>
      </div>
      
      {/* Email thread */}
      <div className="divide-y divide-gray-200 max-h-[600px] overflow-auto">
        {processedEmails.map((processed, index) => {
          const { email, content, parsed, isHtml } = processed;

          return (
            <div key={email.id || index} className="px-6 py-4">
              <div className="flex items-start">
                {/* Sender avatar */}
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center mr-4 flex-shrink-0"
                  style={{ backgroundColor: getAvatarColor(email.from) }}
                >
                  <span className="text-white font-medium">
                    {getSenderInitials(email.from)}
                  </span>
                </div>
                
                {/* Email content container */}
                <div className="flex-1 min-w-0">
                  {/* Top row with action buttons - fixed layout */}
                  <div className="flex items-start justify-between mb-2">
                    {/* Sender info */}
                    <div className="flex-grow pr-4">
                      <h3 className="text-sm font-medium">
                        {searchTerm ? (
                          <span dangerouslySetInnerHTML={{ 
                            __html: highlightText(getSenderName(email.from)) 
                          }} />
                        ) : getSenderName(email.from)}
                      </h3>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDate(email.date)}
                      </div>
                    </div>
                    
                    {/* Action buttons - fixed width */}
                    <div className="flex-shrink-0 flex space-x-2">
                      <button
                        onClick={() => handlePrintEmail(email)}
                        className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                      {!expandedEmails.has(index) ? (
                        <button
                          onClick={() => toggleEmailExpansion(index)}
                          className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          Expand
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleEmailExpansion(index)}
                          className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                          Collapse
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Recipient info on a separate line with expand/collapse */}
                  <div className="text-xs text-gray-500 mb-2">
                    <span>To: {formatRecipients(email.to, index)}</span>
                  </div>
                  
                  {/* Email content - collapsed or expanded */}
                  {expandedEmails.has(index) ? (
                    <div className="mt-3">
                      {/* Content tabs if HTML is available */}
                      {content.html && (
                        <div className="border-b border-gray-200 mb-3">
                          <nav className="flex -mb-px" aria-label="Tabs">
                            <button
                              onClick={() => setActiveTab('plain')}
                              className={`py-2 px-4 text-xs font-medium ${
                                activeTab === 'plain'
                                  ? 'border-b-2 border-blue-500 text-blue-600'
                                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              Plain Text
                            </button>
                            <button
                              onClick={() => setActiveTab('html')}
                              className={`py-2 px-4 text-xs font-medium ${
                                activeTab === 'html'
                                  ? 'border-b-2 border-blue-500 text-blue-600'
                                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              HTML
                            </button>
                          </nav>
                        </div>
                      )}
                      
                      {/* Email body */}
                      <div className="prose max-w-none">
                        {(() => {
                          // Use pre-processed parsed content from useMemo
                          const isHtmlMode = activeTab === 'html' && content.html;

                          // Apply highlighting to new content if searching
                          const displayNewContent = searchTerm && parsed.newContent
                            ? highlightText(parsed.newContent)
                            : parsed.newContent;

                          const displayQuotedContent = searchTerm && parsed.quotedContent
                            ? highlightText(parsed.quotedContent)
                            : parsed.quotedContent;

                          const isQuoteExpanded = expandedQuotes.has(index);

                          return (
                            <>
                              {/* New content (always shown) */}
                              {isHtmlMode ? (
                                <div dangerouslySetInnerHTML={{ __html: displayNewContent }} />
                              ) : (
                                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">
                                  <span dangerouslySetInnerHTML={{ __html: displayNewContent }} />
                                </pre>
                              )}

                              {/* Quoted content (collapsible) */}
                              {parsed.hasQuotes && (
                                <div className="mt-4">
                                  <button
                                    onClick={() => toggleQuoteExpansion(index)}
                                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className={`h-4 w-4 mr-1 transition-transform ${isQuoteExpanded ? 'rotate-180' : ''}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                    {isQuoteExpanded ? 'Hide' : 'Show'} quoted text
                                  </button>

                                  {isQuoteExpanded && (
                                    <div className="mt-2 quoted-text-container">
                                      {isHtmlMode ? (
                                        <div
                                          className="quoted-text-content"
                                          dangerouslySetInnerHTML={{ __html: displayQuotedContent }}
                                        />
                                      ) : (
                                        <pre className="quoted-text-content whitespace-pre-wrap font-sans text-sm">
                                          <span dangerouslySetInnerHTML={{ __html: displayQuotedContent }} />
                                        </pre>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      
                      {/* Attachments */}
                      {email.attachments && email.attachments.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <h4 className="text-xs font-medium text-gray-700 mb-2">Attachments</h4>
                          <div className="flex flex-wrap gap-2">
                            {email.attachments.map((attachment, idx) => (
                              <div key={idx} className="bg-gray-100 rounded-lg p-2 flex items-center text-xs">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                <span>
                                  {searchTerm ? (
                                    <span dangerouslySetInnerHTML={{ 
                                      __html: highlightText(attachment.filename) 
                                    }} />
                                  ) : attachment.filename}
                                </span>
                                <button
                                  onClick={() => handleSaveAttachment(attachment)}
                                  className="ml-2 text-blue-600 hover:text-blue-800"
                                >
                                  Save
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <p className="text-sm text-gray-800 line-clamp-2">
                        {searchTerm ? (
                          <span dangerouslySetInnerHTML={{ 
                            __html: highlightText(content.text?.slice(0, 150) || 'No content') 
                          }} />
                        ) : (content.text?.slice(0, 150) || 'No content')}...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}