// File: utils/mboxParser.js - Improved body parsing
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
    
    return emails;
  } catch (error) {
    console.error('Error parsing MBOX file:', error);
    throw error;
  }
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
      date: new Date().toISOString(), // Default to current date
      bodyText: '',
      bodyHtml: '',
      attachments: []
    };
    
    // First handle the From line specially - it's the MBOX separator
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
      const bodyLines = lines.slice(bodyStartIndex);
      const bodyContent = bodyLines.join('\n');
      
      // Parse the body based on content type
      if (contentType.includes('multipart/') && boundary) {
        parseMultipartBody(bodyContent, boundary, email);
      } else {
        // Single part message
        if (contentType.includes('text/html')) {
          email.bodyHtml = decodeBody(bodyContent, contentTransferEncoding);
          email.bodyText = stripHtml(email.bodyHtml);
        } else {
          email.bodyText = decodeBody(bodyContent, contentTransferEncoding);
        }
      }
      
      console.log(`Message ${index}: Body extracted, html: ${email.bodyHtml.length > 0}, text: ${email.bodyText.length > 0}`);
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
    
    return email;
  } catch (error) {
    console.error(`Error parsing message ${index}:`, error);
    throw error;
  }
}

function parseMultipartBody(bodyContent, boundary, email) {
  console.log(`Parsing multipart body with boundary: ${boundary}`);
  
  try {
    // Create boundary markers
    const startBoundary = `--${boundary}`;
    const endBoundary = `--${boundary}--`;
    
    // Split by boundary
    const parts = bodyContent.split(new RegExp(`${startBoundary}\\r?\\n`));
    
    // First part is usually empty or contains pre-boundary content
    parts.shift();
    
    // Process each part
    for (let part of parts) {
      // Stop if we hit the end boundary
      if (part.includes(endBoundary)) {
        part = part.split(endBoundary)[0];
      }
      
      // Split part into headers and content
      const partSplit = part.split(/\r?\n\r?\n/, 2);
      if (partSplit.length < 2) continue; // Skip if no clear header/content split
      
      const partHeaders = partSplit[0];
      let partContent = partSplit[1];
      
      // Check content type
      const partTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      const partType = partTypeMatch ? partTypeMatch[1].trim().toLowerCase() : 'text/plain';
      
      // Check transfer encoding
      const encodingMatch = partHeaders.match(/Content-Transfer-Encoding:\s*([^;\r\n]+)/i);
      const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : 'quoted-printable';
      
      // Check disposition
      const dispositionMatch = partHeaders.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      const disposition = dispositionMatch ? dispositionMatch[1].trim().toLowerCase() : '';
      
      // Decode content based on encoding
      partContent = decodeBody(partContent, encoding);
      
      if (disposition.includes('attachment')) {
        // This is an attachment
        const filenameMatch = partHeaders.match(/filename="?([^"\r\n;]+)"?/i);
        const filename = filenameMatch ? filenameMatch[1].trim() : 'attachment.bin';
        
        email.attachments.push({
          filename,
          contentType: partType,
          content: partContent // In a real app we'd properly decode binary content
        });
      } else {
        // Body content
        if (partType.includes('text/plain')) {
          email.bodyText = partContent;
        } else if (partType.includes('text/html')) {
          email.bodyHtml = partContent;
        }
      }
    }
  } catch (err) {
    console.error('Error parsing multipart body:', err);
  }
}

function decodeBody(content, encoding) {
  if (!content) return '';
  
  try {
    if (encoding === 'base64') {
      // In a browser environment, we can use atob for base64 decoding
      try {
        return atob(content.replace(/\s/g, ''));
      } catch (e) {
        console.warn('Failed to decode base64 content:', e);
        return content;
      }
    } else if (encoding === 'quoted-printable') {
      // Simple quoted-printable decoder
      return content.replace(/=\r?\n/g, '')
                   .replace(/=([\dA-F]{2})/gi, (_, hex) => 
                      String.fromCharCode(parseInt(hex, 16)));
    }
  } catch (err) {
    console.error('Error decoding body content:', err);
  }
  
  return content;
}

function stripHtml(html) {
  if (!html) return '';
  // Simple HTML stripping
  return html.replace(/<[^>]*>/g, '')
             .replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>');
}

function decodeHeader(headerValue) {
  if (!headerValue) return '';
  
  try {
    // Handle encoded-word format (e.g. =?UTF-8?Q?Subject?=)
    return headerValue.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          // Base64 encoding
          return atob(text);
        } else if (encoding.toUpperCase() === 'Q') {
          // Quoted-printable encoding
          return text.replace(/_/g, ' ')
                     .replace(/=([\dA-F]{2})/gi, (_, hex) => 
                        String.fromCharCode(parseInt(hex, 16)));
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