// File: components/EmailView.js
import { useState } from 'react';

export default function EmailView({ email }) {
  const [activeTab, setActiveTab] = useState('plain');
  
  const handlePrintEmail = () => {
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
      alert('Please allow pop-ups to print emails');
      return;
    }
    
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
            <div class="header-item"><span class="label">Date:</span> ${
              (() => {
                try {
                  return new Date(email.date).toLocaleString();
                } catch (e) {
                  return email.date;
                }
              })()
            }</div>
          </div>
          
          <div class="body">
            ${activeTab === 'html' && email.bodyHtml ? email.bodyHtml : email.bodyText.replace(/\n/g, '<br>')}
          </div>
          
          ${email.attachments && email.attachments.length > 0 ? `
            <div class="attachments">
              <h3>Attachments</h3>
              <ul>
                ${email.attachments.map(att => `<li>${att.filename} (${att.contentType})</li>`).join('')}
              </ul>
            </div>
          ` : '<div class="attachments"><p>No attachments</p></div>'}
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
  
  const handleExportAsPdf = () => {
    alert('To save as PDF: Use the Print function and select "Save as PDF" as the printer option.');
    handlePrintEmail();
  };
  
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
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold">{email.subject}</h2>
        
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">From:</span> {email.from}
          </div>
          <div>
            <span className="text-gray-500">To:</span> {email.to}
          </div>
          <div>
            <span className="text-gray-500">Date:</span> {
              (() => {
                try {
                  // Check if it's a valid ISO string
                  return new Date(email.date).toLocaleString();
                } catch (e) {
                  // If not, just return the original string
                  return email.date;
                }
              })()
            }
          </div>
        </div>
        
        <div className="mt-4 flex space-x-2">
          <button
            onClick={handlePrintEmail}
            className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Print
          </button>
          <button
            onClick={handleExportAsPdf}
            className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Export as PDF
          </button>
        </div>
      </div>
      
      {email.bodyHtml && (
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('plain')}
              className={`py-2 px-4 text-sm font-medium ${
                activeTab === 'plain'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Plain Text
            </button>
            <button
              onClick={() => setActiveTab('html')}
              className={`py-2 px-4 text-sm font-medium ${
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
      
      <div className="px-6 py-4 max-h-[400px] overflow-auto">
        {activeTab === 'html' && email.bodyHtml ? (
          <div dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm">{email.bodyText}</pre>
        )}
      </div>
      
      {email.attachments && email.attachments.length > 0 && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Attachments</h3>
          <ul className="mt-2 divide-y divide-gray-200">
            {email.attachments.map((attachment, index) => (
              <li key={index} className="py-2 flex justify-between items-center">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                  </svg>
                  <span className="ml-2 text-sm text-gray-900">{attachment.filename}</span>
                  <span className="ml-2 text-xs text-gray-500">({attachment.contentType})</span>
                </div>
                <button
                  onClick={() => handleSaveAttachment(attachment)}
                  className="ml-4 inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Save
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}