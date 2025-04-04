// File: components/GmailLayout.js
import { useState, useRef } from 'react';
import EmailListItem from './EmailListItem';
import EmailView from './EmailView';

export default function GmailLayout({
  emails,
  selectedEmail,
  onSelectEmail,
  onSearch,
  onLabelChange,
  selectedLabel,
  onStarEmail,
  onShowConversation
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const searchInputRef = useRef(null);
  
  const handleSearch = (e) => {
    e.preventDefault();
    onSearch(searchTerm);
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch(e);
    }
  };

  // Calculate unread count
  const unreadCount = emails.filter(email => !email.isRead).length;
  
  // Get unique conversations
  const uniqueConversations = [];
  const conversationIds = new Set();
  
  emails.forEach(email => {
    if (!conversationIds.has(email.conversationId)) {
      conversationIds.add(email.conversationId);
      uniqueConversations.push(email);
    }
  });

  return (
    <div className="h-screen flex flex-col">
      {/* Gmail-like header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center">
        <button 
          onClick={() => setShowSidebar(!showSidebar)}
          className="p-2 rounded-full hover:bg-gray-100 mr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <div className="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
          <h1 className="font-medium text-lg text-gray-700">MBOX Viewer</h1>
        </div>
        
        {/* Search bar */}
        <div className="ml-16 flex-grow max-w-3xl">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              placeholder="Search in emails"
              className="w-full py-2 pl-10 pr-4 rounded-lg bg-gray-100 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={handleKeyPress}
              ref={searchInputRef}
            />
            <button type="submit" className="absolute left-3 top-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        </div>
        
        {/* User profile */}
        <div className="ml-4">
          <button className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center">
            <span className="font-medium text-sm">U</span>
          </button>
        </div>
      </header>
      
      {/* Main content */}
      <div className="flex-grow flex overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-56 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
            {/* Compose button */}
            <div className="p-4">
              <button className="flex items-center justify-center w-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium py-3 px-4 rounded-xl transition duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Compose
              </button>
            </div>
            
            {/* Navigation items */}
            <nav className="mt-2">
              <ul>
                <li>
                  <button
                    onClick={() => onLabelChange('inbox')}
                    className={`flex items-center w-full px-6 py-2 text-sm font-medium ${
                      selectedLabel === 'inbox' ? 'bg-blue-100 text-blue-800 rounded-r-full' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    Inbox
                    {unreadCount > 0 && (
                      <span className="ml-auto bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onLabelChange('starred')}
                    className={`flex items-center w-full px-6 py-2 text-sm font-medium ${
                      selectedLabel === 'starred' ? 'bg-blue-100 text-blue-800 rounded-r-full' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    Starred
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onLabelChange('sent')}
                    className={`flex items-center w-full px-6 py-2 text-sm font-medium ${
                      selectedLabel === 'sent' ? 'bg-blue-100 text-blue-800 rounded-r-full' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Sent
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onLabelChange('drafts')}
                    className={`flex items-center w-full px-6 py-2 text-sm font-medium ${
                      selectedLabel === 'drafts' ? 'bg-blue-100 text-blue-800 rounded-r-full' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Drafts
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        )}
        
        {/* Email list and view */}
        <div className="flex-grow flex overflow-hidden">
          {/* Email list */}
          <div className={`${selectedEmail ? 'hidden md:block md:w-2/5 lg:w-1/3' : 'w-full'} border-r border-gray-200 bg-white overflow-y-auto`}>
            <div className="p-3 border-b border-gray-200 flex items-center">
              <div className="flex items-center">
                <input type="checkbox" className="h-4 w-4 text-blue-600 mr-2" />
                <button className="p-2 rounded-full hover:bg-gray-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              <div className="ml-auto flex">
                <button className="p-2 rounded-full hover:bg-gray-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
                <button className="p-2 rounded-full hover:bg-gray-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="divide-y divide-gray-200">
              {uniqueConversations.length > 0 ? (
                uniqueConversations.map((email) => (
                  <EmailListItem 
                    key={email.id}
                    email={email}
                    onClick={() => {
                      onShowConversation(email.conversationId);
                      onSelectEmail(email);
                    }}
                    isSelected={selectedEmail && selectedEmail.id === email.id}
                    onStar={() => onStarEmail(email.id)}
                  />
                ))
              ) : (
                <div className="p-4 text-center text-gray-500">
                  No emails found
                </div>
              )}
            </div>
          </div>
          
          {/* Email view */}
          {selectedEmail && (
            <div className={`${selectedEmail ? 'w-full md:w-3/5 lg:w-2/3' : 'hidden'} bg-white overflow-y-auto`}>
              <EmailView 
                email={selectedEmail} 
                conversation={emails.filter(e => e.conversationId === selectedEmail.conversationId)}
                onBack={() => onSelectEmail(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}