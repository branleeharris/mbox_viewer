// File: pages/index.js
import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import EmailList from '../components/EmailList';
import EmailView from '../components/EmailView';
import FilterPanel from '../components/FilterPanel';
import { parseEmails } from '../utils/mboxParser';

export default function Home() {
  const [emails, setEmails] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [filteredConversations, setFilteredConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
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

  // Group emails into conversations by subject
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
  
  // Helper to normalize subject lines
  const normalizeSubject = (subject) => {
    if (!subject) return 'No Subject';
    
    // Remove prefixes like Re:, RE:, Fwd:, etc. and trim whitespace
    return subject
      .replace(/^(Re|RE|FWD|Fwd|Fw|FW)(\[\d+\])?:\s*/g, '')
      .trim() || 'No Subject';
  };
  
  // Helper to get unique participants in a conversation
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
  
  // Helper to extract email address from "Name <email@example.com>" format
  const extractEmailAddress = (addressString) => {
    if (!addressString) return '';
    
    const match = addressString.match(/<([^>]+)>/);
    return match ? match[1] : addressString;
  };

  // Handle selecting a conversation
  const handleSelectConversation = (conversation) => {
    console.log('Selected conversation:', {
      id: conversation.id,
      subject: conversation.subject,
      emailCount: conversation.emails.length
    });
    
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

  // Apply filters from FilterPanel
  const applyFilters = (filters) => {
    const { from, to, subject, searchTerm } = filters;
    
    let result = [...conversations];
    
    if (searchTerm) {
      // Search across all fields
      result = result.filter(conversation => {
        const matchesSubject = conversation.subject.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesParticipants = conversation.participants.some(p => 
          p.toLowerCase().includes(searchTerm.toLowerCase())
        );
        const matchesContent = conversation.emails.some(email => 
          email.bodyText && email.bodyText.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        return matchesSubject || matchesParticipants || matchesContent;
      });
    } else {
      // Apply specific filters
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
    }
    
    setFilteredConversations(result);
  };

  // Show conversation between specific participants
  const showConversation = (from, to) => {
    if (!from && !to) return;
    
    const result = conversations.filter(conversation => {
      return conversation.participants.some(p => p.toLowerCase().includes(from?.toLowerCase() || '')) &&
             conversation.participants.some(p => p.toLowerCase().includes(to?.toLowerCase() || ''));
    });
    
    setFilteredConversations(result);
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
        ) : conversations.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <FilterPanel onApplyFilters={applyFilters} onShowConversation={showConversation} />
              <EmailList 
                conversations={filteredConversations}
                onSelectConversation={handleSelectConversation}
                selectedConversationId={selectedConversation?.id}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedConversation ? (
                <EmailView 
                  key={selectedConversation.id}
                  conversation={selectedConversation} 
                />
              ) : (
                <div className="bg-white shadow rounded p-6 h-full flex items-center justify-center">
                  <p className="text-gray-500">Select a conversation to view emails</p>
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