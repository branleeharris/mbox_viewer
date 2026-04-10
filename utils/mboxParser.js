// File: utils/mboxParser.js - Improved MIME handling with enhanced character encoding fixes
import { v4 as uuidv4 } from 'uuid';

export async function parseEmails(mboxContent) {
  try {
    // Normalize line endings
    const normalizedContent = mboxContent.replace(/\r\n/g, '\n');
    
    // Split the MBOX file into individual email messages
    const messages = [];
    const messageRegex = /^From [^\n]*(?:\n(?!From )[^\n]*)*/gm;
    let match;
    
    while ((match = messageRegex.exec(normalizedContent)) !== null) {
      messages.push(match[0]);
    }
    
    console.log(`Found ${messages.length} messages in the MBOX file`);
    
    // Parse each email message
    const emails = await Promise.all(messages.map(async (message, index) => {
      try {
        return parseEmailMessage(message, index);
      } catch (err) {
        console.error(`Error parsing message ${index}:`, err);
        // Return a placeholder for failed messages
        return {
          id: uuidv4(),
          from: 'Error parsing email',
          to: '',
          subject: `Message #${index + 1} (parsing failed)`,
          date: new Date().toISOString(),
          bodyText: 'This email could not be parsed correctly: ' + err.message,
          bodyHtml: '',
          attachments: []
        };
      }
    }));
    
    // Group emails into conversations
    const conversations = groupEmailsIntoConversations(emails);
    
    return emails;
  } catch (error) {
    console.error('Error parsing MBOX file:', error);
    throw error;
  }
}

// Group emails into conversations by subject
function groupEmailsIntoConversations(emails) {
  // Create a Map to group emails by normalized subject
  const conversationMap = new Map();
  
  // Process each email
  emails.forEach(email => {
    // Normalize subject by removing prefixes like "Re:", "Fwd:", etc.
    const normalizedSubject = normalizeSubject(email.subject);
    
    // Create or update the conversation group
    if (!conversationMap.has(normalizedSubject)) {
      conversationMap.set(normalizedSubject, []);
    }
    
    conversationMap.get(normalizedSubject).push(email);
  });
  
  // Convert the Map to an array of conversation objects
  const conversationsArray = Array.from(conversationMap.entries()).map(([subject, emails]) => {
    // Sort emails by date for proper threading
    const sortedEmails = [...emails].sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });
    
    // Find the earliest email to represent the conversation
    const firstEmail = sortedEmails[0];
    
    return {
      id: subject, // Use normalized subject as the conversation ID
      subject: firstEmail.subject, // Use the subject of the first email
      participants: getUniqueParticipants(sortedEmails),
      emails: sortedEmails,
      date: sortedEmails[sortedEmails.length - 1].date, // Use the date of the most recent email
      count: sortedEmails.length
    };
  });
  
  // Sort conversations by date (newest first)
  return conversationsArray.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Helper to normalize subject lines
function normalizeSubject(subject) {
  if (!subject) return 'No Subject';
  
  // Remove prefixes like Re:, RE:, Fwd:, etc. and trim whitespace
  return subject
    .replace(/^(Re|RE|FWD|Fwd|Fw|FW)(\[\d+\])?:\s*/g, '')
    .trim() || 'No Subject';
}

// Helper to get unique participants in a conversation
function getUniqueParticipants(emails) {
  const participants = new Set();
  
  emails.forEach(email => {
    // Extract email addresses
    const fromEmail = extractEmailAddress(email.from);
    const toEmails = extractEmailAddress(email.to).split(',').map(e => e.trim());
    
    if (fromEmail) participants.add(fromEmail);
    toEmails.forEach(email => {
      if (email) participants.add(email);
    });
  });
  
  return Array.from(participants);
}

// Helper to extract email address from "Name <email@example.com>" format
function extractEmailAddress(addressString) {
  if (!addressString) return '';
  
  const match = addressString.match(/<([^>]+)>/);
  return match ? match[1] : addressString;
}

function parseEmailMessage(messageContent, index) {
  console.log(`Parsing message ${index}, length: ${messageContent.length}`);
  
  try {
    // Basic structure to hold the email data
    const email = {
      id: uuidv4(),
      from: 'Unknown Sender',
      to: 'Unknown Recipient',
      subject: `Email #${index + 1}`,
      date: new Date().toISOString(),
      bodyText: '',
      bodyHtml: '',
      attachments: []
    };
    
    // Split message into lines
    const lines = messageContent.split('\n');
    
    // Skip the first "From " line as it's the MBOX separator
    const headerLines = [];
    let bodyStartIndex = -1;
    
    // Collect header lines and find start of body
    let isInHeader = true;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Empty line marks end of headers
      if (isInHeader && line.trim() === '') {
        isInHeader = false;
        bodyStartIndex = i + 1;
        continue;
      }
      
      if (isInHeader) {
        // If line starts with whitespace, it's a continuation of previous header
        if (line.match(/^\s+/) && headerLines.length > 0) {
          headerLines[headerLines.length - 1] += ' ' + line.trim();
        } else {
          headerLines.push(line);
        }
      }
    }
    
    console.log(`Message ${index}: Found ${headerLines.length} header lines, body starts at ${bodyStartIndex}`);
    
    // Parse headers
    let contentType = 'text/plain';
    let boundary = null;
    let contentTransferEncoding = null;
    let charset = 'utf-8'; // Default charset
    
    headerLines.forEach(line => {
      // Header format: Name: Value
      const match = line.match(/^([^:]+):\s*(.*)/);
      if (!match) return;
      
      const [, name, value] = match;
      const headerName = name.toLowerCase().trim();
      const headerValue = value.trim();
      
      if (headerName === 'from') {
        email.from = decodeHeader(headerValue);
      } else if (headerName === 'to') {
        email.to = decodeHeader(headerValue);
      } else if (headerName === 'subject') {
        email.subject = decodeHeader(headerValue);
      } else if (headerName === 'date') {
        try {
          const parsedDate = new Date(headerValue);
          if (!isNaN(parsedDate.getTime())) {
            email.date = parsedDate.toISOString();
          } else {
            email.date = headerValue;
          }
        } catch (e) {
          email.date = headerValue;
        }
      } else if (headerName === 'content-type') {
        const contentTypeMatch = headerValue.match(/^([^;]+)/);
        if (contentTypeMatch) {
          contentType = contentTypeMatch[1].toLowerCase().trim();
        }
        
        // Extract charset if present
        const charsetMatch = headerValue.match(/charset="?([^";]+)"?/i);
        if (charsetMatch) {
          charset = charsetMatch[1].trim();
        }
        
        // Extract boundary if present
        const boundaryMatch = headerValue.match(/boundary="?([^";]+)"?/i);
        if (boundaryMatch) {
          boundary = boundaryMatch[1].trim();
          console.log(`Message ${index}: Found boundary: ${boundary}`);
        }
      } else if (headerName === 'content-transfer-encoding') {
        contentTransferEncoding = headerValue.toLowerCase().trim();
      }
    });
    
    // Extract body content
    if (bodyStartIndex >= 0 && bodyStartIndex < lines.length) {
      // Join lines back into a single string for the body
      const bodyContent = lines.slice(bodyStartIndex).join('\n');
      
      // Parse the body based on content type
      if (contentType.includes('multipart/') && boundary) {
        parseMultipartBody(bodyContent, boundary, email, charset);
      } else {
        // Single part message
        if (contentType.includes('text/html')) {
          email.bodyHtml = decodeBody(bodyContent, contentTransferEncoding, charset);
          email.bodyText = stripHtml(email.bodyHtml);
        } else {
          email.bodyText = decodeBody(bodyContent, contentTransferEncoding, charset);
        }
      }
      
      console.log(`Message ${index}: Body extracted, html: ${email.bodyHtml ? 'yes' : 'no'}, text: ${email.bodyText ? 'yes' : 'no'}`);
    } else {
      console.warn(`Message ${index}: No body content found`);
    }
    
    // Make sure we have some text content
    if (!email.bodyText && email.bodyHtml) {
      email.bodyText = stripHtml(email.bodyHtml);
    }
    
    if (!email.bodyText && !email.bodyHtml) {
      email.bodyText = "No readable content found in this email.";
    }
    
    // Final cleanup for non-breaking spaces and other encoding issues
    if (email.bodyText) {
      email.bodyText = cleanupEncodingIssues(email.bodyText);
    }
    if (email.bodyHtml) {
      email.bodyHtml = cleanupEncodingIssues(email.bodyHtml);
    }
    
    return email;
  } catch (error) {
    console.error(`Error parsing message ${index}:`, error);
    throw error;
  }
}

function parseMultipartBody(bodyContent, boundary, email, parentCharset) {
  try {
    // Create boundary markers
    const startBoundary = `--${boundary}`;
    const endBoundary = `--${boundary}--`;
    
    // Split by boundary
    const parts = bodyContent.split(new RegExp(`${startBoundary}(?:\\r?\\n|$)`));
    
    // First part is usually empty or contains pre-boundary content
    parts.shift();
    
    // Process each part
    parts.forEach(part => {
      // Stop if we hit the end boundary
      if (part.includes(endBoundary)) {
        part = part.split(endBoundary)[0];
      }
      
      // Skip empty parts
      if (!part.trim()) return;
      
      // Split part into headers and content (first empty line separates headers from content)
      const headerBodySplit = part.split(/\r?\n\r?\n/);
      if (headerBodySplit.length < 2) return; // No clear split between headers and body
      
      const partHeaders = headerBodySplit[0];
      // Content is everything after the first empty line
      const partContent = headerBodySplit.slice(1).join('\n\n');
      
      // Skip parts without content
      if (!partContent.trim()) return;
      
      // Parse part headers
      let partType = 'text/plain';
      let partEncoding = 'quoted-printable';
      let partDisposition = '';
      let partFilename = '';
      let partCharset = parentCharset || 'utf-8'; // Inherit parent's charset if available
      
      // Parse content type
      const typeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      if (typeMatch) {
        partType = typeMatch[1].toLowerCase().trim();
      }
      
      // Parse charset
      const charsetMatch = partHeaders.match(/charset="?([^";]+)"?/i);
      if (charsetMatch) {
        partCharset = charsetMatch[1].trim();
      }
      
      // Check if this is a nested multipart
      const nestedBoundaryMatch = partHeaders.match(/boundary="?([^";]+)"?/i);
      if (nestedBoundaryMatch && partType.includes('multipart/')) {
        // Handle nested multipart by recursive call
        parseMultipartBody(partContent, nestedBoundaryMatch[1].trim(), email, partCharset);
        return;
      }
      
      // Parse encoding
      const encodingMatch = partHeaders.match(/Content-Transfer-Encoding:\s*([^;\r\n]+)/i);
      if (encodingMatch) {
        partEncoding = encodingMatch[1].toLowerCase().trim();
      }
      
      // Parse disposition
      const dispositionMatch = partHeaders.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      if (dispositionMatch) {
        partDisposition = dispositionMatch[1].toLowerCase().trim();
      }
      
      // Parse filename for attachments
      const filenameMatch = partHeaders.match(/filename="?([^"\r\n;]+)"?/i);
      if (filenameMatch) {
        partFilename = filenameMatch[1].trim();
      }
      
      // Decode the content with proper charset
      let decodedContent = decodeBody(partContent, partEncoding, partCharset);
      
      // Apply final cleanup
      decodedContent = cleanupEncodingIssues(decodedContent);
      
      // Process the part based on its type and disposition
      if (partDisposition === 'attachment' || filenameMatch) {
        // This is an attachment
        email.attachments.push({
          filename: partFilename || `attachment-${email.attachments.length + 1}`,
          contentType: partType,
          content: decodedContent
        });
      } else {
        // This is email body content
        if (partType.includes('text/plain') && !email.bodyText) {
          email.bodyText = decodedContent;
        } else if (partType.includes('text/html') && !email.bodyHtml) {
          email.bodyHtml = decodedContent;
        }
      }
    });
  } catch (err) {
    console.error('Error parsing multipart body:', err);
    
    // Set fallback content
    if (!email.bodyText && !email.bodyHtml) {
      email.bodyText = "Error parsing multipart content: " + err.message;
    }
  }
}

function decodeBody(content, encoding, charset = 'utf-8') {
  if (!content) return '';
  
  try {
    // Normalize charset name
    charset = normalizeCharset(charset);
    
    if (encoding === 'base64') {
      // For base64, remove whitespace and decode
      const cleanBase64 = content.replace(/[\r\n\s]/g, '');
      try {
        // Decode base64 to bytes
        const binaryStr = atob(cleanBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        
        // Use TextDecoder for charset conversion with a fallback
        try {
          if (typeof TextDecoder !== 'undefined') {
            return new TextDecoder(charset).decode(bytes);
          } else {
            // Fallback for environments without TextDecoder
            return binaryStr;
          }
        } catch (e) {
          // Fallback to UTF-8 if the charset is not supported
          console.warn(`Charset ${charset} not supported, falling back to UTF-8`);
          if (typeof TextDecoder !== 'undefined') {
            return new TextDecoder('utf-8').decode(bytes);
          } else {
            return binaryStr;
          }
        }
      } catch (e) {
        console.warn('Failed to decode base64 content:', e);
        return content;
      }
    } else if (encoding === 'quoted-printable') {
      // Decode quoted-printable
      let decoded = content
        .replace(/=\r?\n/g, '') // Remove soft line breaks
        .replace(/=([\dA-F]{2})/gi, (_, hex) => 
          String.fromCharCode(parseInt(hex, 16)));
      
      // For non-UTF-8 charsets, we need to handle the bytes properly
      if (charset !== 'utf-8') {
        try {
          if (typeof TextDecoder !== 'undefined') {
            // Convert to bytes
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
              bytes[i] = decoded.charCodeAt(i) & 0xFF;
            }
            
            // Use TextDecoder to convert bytes to proper encoding
            return new TextDecoder(charset).decode(bytes);
          }
        } catch (e) {
          console.warn(`Error decoding with charset ${charset}:`, e);
        }
      }
      
      return decoded;
    }
    
    // For 7bit, 8bit, or binary encodings - try to handle charset
    if (charset !== 'utf-8' && typeof TextDecoder !== 'undefined') {
      try {
        // Convert to bytes
        const bytes = new Uint8Array(content.length);
        for (let i = 0; i < content.length; i++) {
          bytes[i] = content.charCodeAt(i) & 0xFF;
        }
        
        // Use TextDecoder for charset conversion
        return new TextDecoder(charset).decode(bytes);
      } catch (e) {
        console.warn(`Error decoding with charset ${charset}:`, e);
      }
    }
    
    // Return original content if no conversions applied
    return content;
  } catch (err) {
    console.error('Error decoding body content:', err);
    return content;
  }
}

function decodeHeader(headerValue) {
  if (!headerValue) return '';
  
  try {
    // Handle encoded-word format (e.g. =?UTF-8?Q?Subject?=)
    return headerValue.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset, encoding, text) => {
      try {
        // Normalize charset name
        charset = normalizeCharset(charset);
        
        if (encoding.toUpperCase() === 'B') {
          // Base64 encoding
          try {
            // Decode base64 to bytes
            const binaryStr = atob(text);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            
            // Use TextDecoder for charset conversion
            try {
              if (typeof TextDecoder !== 'undefined') {
                return new TextDecoder(charset).decode(bytes);
              } else {
                return binaryStr;
              }
            } catch (e) {
              // Fallback to UTF-8 if the charset is not supported
              console.warn(`Charset ${charset} not supported in header, falling back to UTF-8`);
              if (typeof TextDecoder !== 'undefined') {
                return new TextDecoder('utf-8').decode(bytes);
              } else {
                return binaryStr;
              }
            }
          } catch (e) {
            console.warn('Failed to decode base64 header content:', e);
            return text;
          }
        } else if (encoding.toUpperCase() === 'Q') {
          // Quoted-printable encoding
          let decoded = text
            .replace(/_/g, ' ')
            .replace(/=([\dA-F]{2})/gi, (_, hex) => 
              String.fromCharCode(parseInt(hex, 16)));
          
          // For non-UTF-8 charsets, we need to handle the bytes properly
          if (charset !== 'utf-8' && typeof TextDecoder !== 'undefined') {
            try {
              // Convert to bytes
              const bytes = new Uint8Array(decoded.length);
              for (let i = 0; i < decoded.length; i++) {
                bytes[i] = decoded.charCodeAt(i) & 0xFF;
              }
              
              // Use TextDecoder to convert bytes to proper encoding
              return new TextDecoder(charset).decode(bytes);
            } catch (e) {
              console.warn(`Error decoding header with charset ${charset}:`, e);
            }
          }
          
          return decoded;
        }
      } catch (err) {
        console.warn('Failed to decode header:', err);
      }
      return text;
    });
  } catch (err) {
    console.error('Error decoding header:', err);
    return headerValue;
  }
}

function stripHtml(html) {
  if (!html) return '';
  
  // Simple HTML stripping
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num)) // Replace numeric entities
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// New helper function to normalize charset names
function normalizeCharset(charset) {
  if (!charset) return 'utf-8';
  
  // Convert to lowercase
  charset = charset.toLowerCase();
  
  // Handle common charset aliases
  const charsetMap = {
    'windows-1252': 'windows-1252',
    'cp1252': 'windows-1252',
    'iso-8859-1': 'iso-8859-1',
    'latin1': 'iso-8859-1',
    'us-ascii': 'ascii',
    'ascii': 'ascii',
    'utf8': 'utf-8',
    'utf-8': 'utf-8'
  };
  
  return charsetMap[charset] || 'utf-8';
}

// New helper function to clean up common encoding issues
function cleanupEncodingIssues(text) {
  if (!text) return '';
  
  // Fix common encoding issues
  return text
    // Fix the "Â" non-breaking space issue (very common encoding error)
    .replace(/Â /g, ' ')
    .replace(/Â/g, '')
    // Fix mojibake: longer sequences first to avoid partial matches
    .replace(/â€œ/g, '\u201c') // Left double quote
    .replace(/â€\u009d/g, '\u201d') // Right double quote
    .replace(/â€˜/g, '\u2018') // Left single quote
    .replace(/â€™/g, '\u2019') // Right single quote
    .replace(/â€"/g, '\u2014') // Em dash
    .replace(/â€"/g, '\u2013') // En dash
    .replace(/â€¦/g, '\u2026') // Ellipsis
    .replace(/â€¯/g, ' ')     // Narrow no-break space
    .replace(/Â¯/g, '')       // Orphaned macron from partial cleanup
    .replace(/¯/g, '')        // Standalone orphaned macron
    .replace(/Ã©/g, 'é')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã«/g, 'ë')
    .replace(/Ã¯/g, 'ï')
    .replace(/Ã®/g, 'î')
    .replace(/Ã´/g, 'ô')
    .replace(/Ã¹/g, 'ù')
    .replace(/Ã»/g, 'û')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã€/g, 'À')
    .replace(/Ã‰/g, 'É')
}