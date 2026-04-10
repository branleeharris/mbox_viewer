// File: components/EmailView.js
import { useState, useMemo } from 'react';
import { extractNewContent } from '../utils/quoteDetection';

export default function EmailView({ conversation, searchTerm }) {
  const [activeTab, setActiveTab] = useState('html');
  const [expandedRecipients, setExpandedRecipients] = useState(new Set());
  const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'full'

  // Decode HTML entities and fix character encoding
  const decodeHtmlEntities = (text) => {
    if (!text) return text;

    // Create a temporary element to decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    let decoded = textarea.value;

    // Fix common unicode character issues
    decoded = decoded
      // Fix problematic unicode spaces
      .replace(/\u202F/g, ' ')  // narrow no-break space
      .replace(/\u00A0/g, ' ')  // non-breaking space
      .replace(/\u2009/g, ' ')  // thin space
      // Fix mojibake: replace complete multi-byte sequences (not individual chars)
      .replace(/\u00e2\u20ac\u201c/g, '\u2014') // em dash
      .replace(/\u00e2\u20ac\u201d/g, '\u2013') // en dash
      .replace(/\u00e2\u20ac\u0153/g, '\u201c') // left double quote
      .replace(/\u00e2\u20ac\u009d/g, '\u201d') // right double quote
      .replace(/\u00e2\u20ac\u2122/g, '\u2019') // right single quote / apostrophe
      .replace(/\u00e2\u20ac\u02dc/g, '\u2018') // left single quote
      .replace(/\u00e2\u20ac\u00a6/g, '\u2026') // ellipsis
      .replace(/\u00e2\u20ac\u00af/g, ' ')       // narrow no-break space mojibake
      .replace(/\u00c2\u00af/g, ' ')              // another NNBSP mojibake variant
      .replace(/\u00af/g, '')                     // orphaned macron from partial cleanup
      // Clean up orphaned â and € not part of real words (mojibake remnants)
      .replace(/\u00e2(?=[^a-zA-Z\u00c0-\u00ff]|$)/g, ' ')
      .replace(/\u20ac(?=[^a-zA-Z0-9]|$)/g, '')  // orphaned euro sign from mojibake
      .replace(/  +/g, ' ');                      // collapse double spaces from removals

    return decoded;
  };

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

      // Decode HTML entities and fix character encoding
      cleanedText = decodeHtmlEntities(cleanedText);
    }

    // For HTML, use the content if available, otherwise convert plain text
    if (email.bodyHtml) {
      cleanedHtml = email.bodyHtml
        // Remove MIME boundaries and headers in case they got into the HTML
        .replace(/--[a-zA-Z0-9_.-]+(?:--)?\r?\n/g, '')
        .replace(/Content-Type: [^\r\n]+\r?\n/g, '')
        .replace(/Content-Transfer-Encoding: [^\r\n]+\r?\n/g, '');

      // Decode HTML entities in the HTML content
      cleanedHtml = decodeHtmlEntities(cleanedHtml);
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

  // Pre-process emails with content deduplication for screen display
  const processedEmails = useMemo(() => {
    if (!conversation?.emails) return [];

    const sorted = [...conversation.emails].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    return sorted.map((email) => {
      const content = cleanEmailContent(email);
      const isHtml = !!email.bodyHtml && !!content.html;
      const textParsed = extractNewContent(content.text, false);
      const htmlParsed = isHtml ? extractNewContent(content.html, true) : null;

      return { email, content, textParsed, htmlParsed, isHtml };
    });
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

    // For printing, just use the content as-is
    const isHtml = activeTab === 'html' && content.html;
    const newContent = isHtml ? content.html : content.text;

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

    // Add each email using pre-processed content (quotes already stripped)
    const totalEmails = processedEmails.length;

    processedEmails.forEach((processed, index) => {
      const { email, content, textParsed, htmlParsed, isHtml } = processed;
      const parsed = (isHtml && htmlParsed) ? htmlParsed : textParsed;
      const newContent = parsed?.newContent || '';

      const useHtml = isHtml && !!content.html;
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
            ${newContent
              ? (useHtml ? newContent : '<pre>' + newContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>')
              : '<em>No additional message</em>'}
          </div>

          ${email.attachments && email.attachments.length > 0 ? `
            <div class="attachments-info">
              📎 ${email.attachments.length} attachment${email.attachments.length > 1 ? 's' : ''}: ${email.attachments.map(att => att.filename).join(', ')}
            </div>
          ` : ''}
        </div>
      `;
    });

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
    <div className="bg-white" style={{ fontFamily: 'Roboto, Arial, sans-serif' }}>
      {/* Conversation header - Exact Gmail style */}
      <div className="px-6 py-4 border-b" style={{ borderColor: '#e8eaed' }}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-normal truncate" style={{ color: '#202124' }}>
              {searchTerm ? (
                <span dangerouslySetInnerHTML={{
                  __html: highlightText(conversation.subject)
                }} />
              ) : conversation.subject}
            </h1>
          </div>

          {/* View mode toggle + action buttons */}
          <div className="ml-4 flex items-center gap-3">
            <div className="view-toggle">
              <button
                className={viewMode === 'chat' ? 'active' : ''}
                onClick={() => setViewMode('chat')}
              >
                Chat
              </button>
              <button
                className={viewMode === 'full' ? 'active' : ''}
                onClick={() => setViewMode('full')}
              >
                Full Email
              </button>
            </div>
            <button
              onClick={handlePrintConversation}
              className="p-2 rounded-full transition-colors"
              style={{ color: '#5f6368' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(60, 64, 67, 0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              title="Print all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
              </svg>
            </button>
          </div>
        </div>

        {searchTerm && (
          <div className="mt-3 rounded px-3 py-2 text-sm" style={{ backgroundColor: '#fff9c4', borderColor: '#f9a825', borderWidth: '1px' }}>
            <span className="font-medium" style={{ color: '#202124' }}>Searching for: </span>
            <span className="px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#ffeb3b' }}>{searchTerm}</span>
          </div>
        )}
      </div>

      {/* Email thread */}
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 150px)', backgroundColor: '#ffffff' }}>
        <div style={{ paddingTop: '16px', paddingBottom: '16px' }}>
          {processedEmails.map((processed, index) => {
            const { email, content, textParsed, htmlParsed, isHtml } = processed;
            const parsed = (isHtml && htmlParsed) ? htmlParsed : textParsed;

            // In chat mode, prefer HTML content rendered cleanly; in full mode, respect activeTab
            const useHtml = viewMode === 'chat'
              ? (isHtml && !!content.html)
              : (activeTab === 'html' && !!content.html);

            const displayNewContent = searchTerm && parsed?.newContent
              ? highlightText(parsed.newContent)
              : parsed?.newContent || '';

            const displayQuotedContent = searchTerm && parsed?.quotedContent
              ? highlightText(parsed.quotedContent)
              : parsed?.quotedContent || '';

            return (
              <div key={email.id || index} className="chat-message">
                {/* Avatar */}
                <div
                  className="chat-avatar"
                  style={{ backgroundColor: getAvatarColor(email.from) }}
                >
                  {getSenderInitials(email.from)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Sender + Time */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span className="chat-sender">
                      {searchTerm ? (
                        <span dangerouslySetInnerHTML={{ __html: highlightText(getSenderName(email.from)) }} />
                      ) : getSenderName(email.from)}
                    </span>
                    <span className="chat-time">
                      {viewMode === 'chat'
                        ? new Date(email.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                        : formatDate(email.date)}
                    </span>
                  </div>

                  {/* Recipients (full mode only) */}
                  {viewMode === 'full' && (
                    <div className="full-email-recipients">
                      to {formatRecipients(email.to, index)}
                    </div>
                  )}

                  {/* Content tabs (full mode only) */}
                  {viewMode === 'full' && content.html && (
                    <div className="flex space-x-4 text-xs mt-2 mb-2 border-b border-gray-200">
                      <button
                        onClick={() => setActiveTab('plain')}
                        className={`pb-2 ${
                          activeTab === 'plain'
                            ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Plain Text
                      </button>
                      <button
                        onClick={() => setActiveTab('html')}
                        className={`pb-2 ${
                          activeTab === 'html'
                            ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        HTML
                      </button>
                    </div>
                  )}

                  {/* Message body — new content */}
                  {displayNewContent ? (
                    <div className="chat-body">
                      {useHtml ? (
                        <div className="gmail-body" dangerouslySetInnerHTML={{ __html: displayNewContent }} />
                      ) : (
                        <pre className="whitespace-pre-wrap" style={{ fontFamily: 'Roboto, Arial, sans-serif', fontSize: '14px', color: '#202124', margin: 0 }}>
                          <span dangerouslySetInnerHTML={{ __html: displayNewContent }} />
                        </pre>
                      )}
                    </div>
                  ) : (
                    <div className="chat-body-empty">No additional message</div>
                  )}

                  {/* Quoted content (full mode only) */}
                  {viewMode === 'full' && parsed?.hasQuotes && displayQuotedContent && (
                    <div className="full-email-quoted">
                      {useHtml ? (
                        <div className="gmail-body" dangerouslySetInnerHTML={{ __html: displayQuotedContent }} />
                      ) : (
                        <pre className="whitespace-pre-wrap" style={{ fontFamily: 'Roboto, Arial, sans-serif', fontSize: '14px', margin: 0 }}>
                          <span dangerouslySetInnerHTML={{ __html: displayQuotedContent }} />
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Attachments (both modes) */}
                  {email.attachments && email.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {email.attachments.map((attachment, idx) => (
                        <div key={idx} className="bg-gray-100 rounded-lg p-2 flex items-center text-xs">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <span>
                            {searchTerm ? (
                              <span dangerouslySetInnerHTML={{ __html: highlightText(attachment.filename) }} />
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}