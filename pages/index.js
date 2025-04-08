// File: pages/index.js (modified)
import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import EmailList from '../components/EmailList';
import EmailView from '../components/EmailView';
import FilterPanel from '../components/FilterPanel';
import MboxMerger from '../components/MboxMerger';
import { parseEmails } from '../utils/mboxParser';

export default function Home() {
  const [emails, setEmails] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [filteredConversations, setFilteredConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showMergeTools, setShowMergeTools] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    setIsLoading(true);
    setError('');
    setCurrentSearchTerm(''); // Reset search term when new file is loaded
    
    try {
      const file = e.target.files[0];
      if (!file) return;
      
      processFile(file);
    } catch (err) {
      setError('Error processing file: ' + err.message);
      setIsLoading(false);
    }
  };

  const processFile = async (file) => {
    try {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const content = event.target.result;
          const parsedEmails = await parseEmails(content);
          
          // Store original emails
          setEmails(parsedEmails);
          
          // Group emails into conversations
          const convos = groupEmailsIntoConversations(parsedEmails);
          setConversations(convos);
          setFilteredConversations(convos);
          
          setIsLoading(false);
          
          // Auto-select the first conversation if available
          if (convos.length > 0) {
            setSelectedConversation(convos[0]);
          }
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

  // Handle merged file ready event
  const handleMergedFileReady = (mergedBlob, mergedFileName) => {
    // Create a File object from the Blob
    const file = new File([mergedBlob], mergedFileName, { type: 'text/plain' });
    
    // Ask user if they want to load the merged file
    if (window.confirm('Would you like to load the merged file into the viewer?')) {
      processFile(file);
    }
  };

  // Group emails into conversations by subject (same as before)
  const groupEmailsIntoConversations = (emails) => {
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
    const conversationsArray = Array.from(conversationMap.entries()).map(([subject, emailsInConvo]) => {
      // Sort emails by date for proper threading
      const sortedEmails = [...emailsInConvo].sort((a, b) => {
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
        previewText: sortedEmails[sortedEmails.length - 1].bodyText?.slice(0, 100) || '',
        count: sortedEmails.length,
        isRead: false // Default to unread
      };
    });
    
    // Sort conversations by date (newest first)
    return conversationsArray.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // Helper functions (same as before)
  const normalizeSubject = (subject) => {
    if (!subject) return 'No Subject';
    
    // Remove prefixes like Re:, RE:, Fwd:, etc. and trim whitespace
    return subject
      .replace(/^(Re|RE|FWD|Fwd|Fw|FW)(\[\d+\])?:\s*/g, '')
      .trim() || 'No Subject';
  };
  
  const getUniqueParticipants = (emails) => {
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
  };
  
  const extractEmailAddress = (addressString) => {
    if (!addressString) return '';
    
    const match = addressString.match(/<([^>]+)>/);
    return match ? match[1] : addressString;
  };

  // Other function handlers (same as before)
  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
    
    // Mark conversation as read
    setConversations(prevConversations => 
      prevConversations.map(conv => 
        conv.id === conversation.id ? {...conv, isRead: true} : conv
      )
    );
    
    setFilteredConversations(prevConversations => 
      prevConversations.map(conv => 
        conv.id === conversation.id ? {...conv, isRead: true} : conv
      )
    );
  };

  const handleSearch = (searchTerm) => {
    setCurrentSearchTerm(searchTerm);
    
    if (!searchTerm.trim()) {
      // If search is cleared, reset to current filtered state
      applyFilters({});
      return;
    }
    
    // Search across all fields
    const result = conversations.filter(conversation => {
      // Check subject
      const matchesSubject = conversation.subject.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Check participants
      const matchesParticipants = conversation.participants.some(p => 
        p.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      // Check content of all emails in the conversation
      const matchesContent = conversation.emails.some(email => {
        const bodyMatches = email.bodyText && 
          email.bodyText.toLowerCase().includes(searchTerm.toLowerCase());
        const fromMatches = email.from && 
          email.from.toLowerCase().includes(searchTerm.toLowerCase());
        const toMatches = email.to && 
          email.to.toLowerCase().includes(searchTerm.toLowerCase());
        
        return bodyMatches || fromMatches || toMatches;
      });
      
      return matchesSubject || matchesParticipants || matchesContent;
    });
    
    setFilteredConversations(result);
    
    // If we have search results and no conversation is selected, select the first one
    if (result.length > 0 && !selectedConversation) {
      setSelectedConversation(result[0]);
    } else if (result.length > 0 && !result.find(c => c.id === selectedConversation.id)) {
      // If current selection is not in search results, select the first result
      setSelectedConversation(result[0]);
    }
  };

  const applyFilters = (filters) => {
    const { from, to, subject } = filters;
    
    let result = [...conversations];
    
    // Apply specific filters if they exist
    if (from) {
      result = result.filter(conversation => 
        conversation.participants.some(p => p.toLowerCase().includes(from.toLowerCase()))
      );
    }
    
    if (to) {
      result = result.filter(conversation => 
        conversation.participants.some(p => p.toLowerCase().includes(to.toLowerCase()))
      );
    }
    
    if (subject) {
      result = result.filter(conversation => 
        conversation.subject.toLowerCase().includes(subject.toLowerCase())
      );
    }
    
    // If search term is active, filter the results by that too
    if (currentSearchTerm) {
      result = result.filter(conversation => {
        const matchesSubject = conversation.subject.toLowerCase().includes(currentSearchTerm.toLowerCase());
        const matchesParticipants = conversation.participants.some(p => 
          p.toLowerCase().includes(currentSearchTerm.toLowerCase())
        );
        const matchesContent = conversation.emails.some(email => 
          email.bodyText && email.bodyText.toLowerCase().includes(currentSearchTerm.toLowerCase())
        );
        
        return matchesSubject || matchesParticipants || matchesContent;
      });
    }
    
    setFilteredConversations(result);
  };

  const showConversation = (from, to) => {
    if (!from && !to) return;
    
    const result = conversations.filter(conversation => {
      return conversation.participants.some(p => p.toLowerCase().includes(from?.toLowerCase() || '')) &&
             conversation.participants.some(p => p.toLowerCase().includes(to?.toLowerCase() || ''));
    });
    
    setFilteredConversations(result);
  };

  const clearSearch = () => {
    setCurrentSearchTerm('');
    setFilteredConversations(conversations);
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  const toggleMergeTools = () => {
    setShowMergeTools(!showMergeTools);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>BH MBOX Viewer</title>
        <meta name="description" content="Secure, client-side MBOX email viewer" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">BH MBOX Viewer</h1>
          <div className="flex space-x-3">
            <button
              onClick={toggleMergeTools}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded mr-2"
            >
              {showMergeTools ? 'Hide Merge Tools' : 'Merge MBOX Files'}
            </button>
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
        
        {/* MBOX Merger Component - Collapsible */}
        {showMergeTools && (
          <div className="mb-6">
            <MboxMerger onMergedFileReady={handleMergedFileReady} />
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="loader"></div>
            <p className="ml-2">Processing MBOX file...</p>
          </div>
        ) : conversations.length > 0 ? (
          <div className="space-y-6">
            {/* Search and Filter Section - Full Width */}
            <div className="bg-white shadow rounded p-4">
              <div className="flex flex-col space-y-4">
                {/* Search Box */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-medium text-gray-900">Search</h2>
                    <button
                      onClick={toggleFilters}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      {showFilters ? 'Hide Filters' : 'Show Filters'}
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search across all emails"
                      className="w-full block border border-gray-300 rounded-md shadow-sm py-2 pl-10 pr-4 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={currentSearchTerm}
                      onChange={(e) => setCurrentSearchTerm(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch(currentSearchTerm)}
                    />
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    {currentSearchTerm && (
                      <button
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                        onClick={clearSearch}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSearch(currentSearchTerm)}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Search
                    </button>
                  </div>
                  
                  {currentSearchTerm && (
                    <div className="mt-3 text-sm text-gray-600">
                      Found {filteredConversations.length} 
                      {filteredConversations.length === 1 ? ' result' : ' results'} 
                      for "<span className="font-medium">{currentSearchTerm}</span>"
                    </div>
                  )}
                </div>
                
                {/* Advanced Filters - Collapsible */}
                {showFilters && (
                  <div className="pt-4 border-t border-gray-200">
                    <FilterPanel 
                      onApplyFilters={applyFilters} 
                      onShowConversation={showConversation}
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* Email List and Viewer Section - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Email List - 1/3 width on medium screens and up */}
              <div className="md:col-span-1">
                <EmailList 
                  conversations={filteredConversations}
                  onSelectConversation={handleSelectConversation}
                  selectedConversationId={selectedConversation?.id}
                  searchTerm={currentSearchTerm}
                />
              </div>
              
              {/* Email Viewer - 2/3 width on medium screens and up */}
              <div className="md:col-span-2">
                {selectedConversation ? (
                  <EmailView 
                    key={selectedConversation.id}
                    conversation={selectedConversation} 
                    searchTerm={currentSearchTerm}
                  />
                ) : (
                  <div className="bg-white shadow rounded p-6 h-full flex items-center justify-center">
                    <p className="text-gray-500">Select a conversation to view emails</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow rounded p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Welcome to MBOX Viewer</h2>
            <p className="mb-6">Open an MBOX file to get started or merge multiple MBOX files.</p>
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