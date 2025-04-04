// File: pages/index.js
import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import EmailList from '../components/EmailList';
import EmailView from '../components/EmailView';
import FilterPanel from '../components/FilterPanel';
import { parseEmails } from '../utils/mboxParser';

export default function Home() {
  const [emails, setEmails] = useState([]);
  const [filteredEmails, setFilteredEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    setIsLoading(true);
    setError('');
    
    try {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const content = event.target.result;
          const parsedEmails = await parseEmails(content);
          setEmails(parsedEmails);
          setFilteredEmails(parsedEmails);
          setIsLoading(false);
        } catch (err) {
          setError('Error parsing MBOX file: ' + err.message);
          setIsLoading(false);
        }
      };
      
      reader.onerror = () => {
        setError('Error reading file');
        setIsLoading(false);
      };
      
      reader.readAsText(file);
    } catch (err) {
      setError('Error processing file: ' + err.message);
      setIsLoading(false);
    }
  };

  const applyFilters = (filters) => {
    const { from, to, subject, searchTerm } = filters;
    
    let result = [...emails];
    
    if (from) {
      result = result.filter(email => 
        email.from.toLowerCase().includes(from.toLowerCase())
      );
    }
    
    if (to) {
      result = result.filter(email => 
        email.to.toLowerCase().includes(to.toLowerCase())
      );
    }
    
    if (subject) {
      result = result.filter(email => 
        email.subject.toLowerCase().includes(subject.toLowerCase())
      );
    }
    
    if (searchTerm) {
      result = result.filter(email => 
        email.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (email.bodyText && email.bodyText.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    setFilteredEmails(result);
  };

  const showConversation = (from, to) => {
    if (!from && !to) return;
    
    const conversation = emails.filter(email => {
      const isFromSender = from && email.from.toLowerCase().includes(from.toLowerCase());
      const isToRecipient = to && email.to.toLowerCase().includes(to.toLowerCase());
      const isFromRecipient = to && email.from.toLowerCase().includes(to.toLowerCase());
      const isToSender = from && email.to.toLowerCase().includes(from.toLowerCase());
      
      return (isFromSender && isToRecipient) || (isFromRecipient && isToSender);
    });
    
    setFilteredEmails(conversation);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>MBOX Viewer</title>
        <meta name="description" content="Secure, client-side MBOX email viewer" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">MBOX Viewer</h1>
          <div>
            <input
              type="file"
              accept=".mbox"
              onChange={handleFileSelect}
              ref={fileInputRef}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
            >
              Open MBOX File
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="loader"></div>
            <p className="ml-2">Processing MBOX file...</p>
          </div>
        ) : emails.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <FilterPanel onApplyFilters={applyFilters} onShowConversation={showConversation} />
              <EmailList 
                emails={filteredEmails} 
                onSelectEmail={setSelectedEmail} 
                selectedEmailId={selectedEmail?.id} 
              />
            </div>
            <div className="lg:col-span-2">
              {selectedEmail ? (
                <EmailView email={selectedEmail} />
              ) : (
                <div className="bg-white shadow rounded p-6 h-full flex items-center justify-center">
                  <p className="text-gray-500">Select an email to view its contents</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white shadow rounded p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Welcome to MBOX Viewer</h2>
            <p className="mb-6">Open an MBOX file to get started.</p>
            <p className="text-sm text-gray-500 mb-2">All processing happens in your browser.</p>
            <p className="text-sm text-gray-500">Your data never leaves your computer.</p>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 text-center">
            MBOX Viewer - A secure client-side application for viewing MBOX email archives
          </p>
        </div>
      </footer>
    </div>
  );
}