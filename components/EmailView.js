// File: components/EmailView.js
import { useState, useEffect } from 'react';

export default function EmailView({ conversation }) {
  const [expandedEmails, setExpandedEmails] = useState(new Set());
  const [activeTab, setActiveTab] = useState('html');
  
  // Expand the most recent email by default
  useEffect(() => {
    if (conversation && conversation.emails && conversation.emails.length > 0) {
      setExpandedEmails(new Set([conversation.emails.length - 1]));
    }
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
  
  // Print the current email
  const handlePrintEmail = (email) => {
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
      alert('Please allow pop-ups to print emails');
      return;
    }
    
    const content = cleanEmailContent(email);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email: ${email.subject}</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
          .email-container { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; }
          .header { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
          .header-item { margin-bottom: 5px; }
          .label { font-weight: bold; width: 60px; display: inline-block; }
          .body { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
          .attachments { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
          .print-footer { text-align: center; color: #666; margin-top: 30px; font-size: 12px; }
          @media print {
            body { margin: 0; }
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
            ${activeTab === 'html' && content.html ? content.html : content.text.replace(/\n/g, '<br>')}
          </div>
          
          ${email.attachments && email.attachments.length > 0 ? `
            <div class="attachments">
              <h3>Attachments</h3>
              <ul>
                ${email.attachments.map(att => `<li>${att.filename} (${att.contentType})</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
        
        <div class="print-footer">
          <p>Printed from MBOX Viewer</p>
          <button class="no-print" onclick="window.print()">Print</button>
          <button class="no-print" onclick="window.close()">Close</button>
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
      {/* Conversation header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold">{conversation.subject}</h2>
        
        <div className="mt-2 flex items-center text-sm text-gray-500">
          <span className="bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-xs font-medium mr-2">
            {conversation.emails?.length || 0} messages
          </span>
          <span>
            Between: {conversation.participants?.slice(0, 3).join(', ') || 'Unknown'}
            {conversation.participants && conversation.participants.length > 3 && ' and others'}
          </span>
        </div>
      </div>
      
      {/* Email thread */}
      <div className="divide-y divide-gray-200 max-h-[600px] overflow-auto">
        {conversation.emails && conversation.emails.map((email, index) => {
          const content = cleanEmailContent(email);
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
                
                <div className="flex-1 min-w-0">
                  {/* Email header */}
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="text-sm font-medium">
                      {getSenderName(email.from)}
                    </h3>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {formatDate(email.date)}
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-500 mb-2">
                    <span>To: {email.to}</span>
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
                        {activeTab === 'html' && content.html ? (
                          <div dangerouslySetInnerHTML={{ __html: content.html }} />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{content.text}</pre>
                        )}
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
                                <span>{attachment.filename}</span>
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
                      
                      {/* Email actions */}
                      <div className="mt-4 flex space-x-2">
                        <button
                          onClick={() => handlePrintEmail(email)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                        >
                          Print
                        </button>
                        <button
                          onClick={() => toggleEmailExpansion(index)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                        >
                          Collapse
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <p className="text-sm text-gray-800 line-clamp-2">
                        {content.text?.slice(0, 150) || 'No content'}...
                      </p>
                      <button
                        onClick={() => toggleEmailExpansion(index)}
                        className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        Show more
                      </button>
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