// File: components/EmailList.js
import { useState, useEffect } from 'react';

export default function EmailList({ conversations, onSelectConversation, selectedConversationId }) {
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [sortedConversations, setSortedConversations] = useState([]);
  
  useEffect(() => {
    let sortableConversations = [...(conversations || [])];
    if (sortConfig.key) {
      sortableConversations.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    setSortedConversations(sortableConversations);
  }, [conversations, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getClassNamesFor = (name) => {
    if (!sortConfig) {
      return;
    }
    return sortConfig.key === name ? sortConfig.direction : undefined;
  };

  // Generate avatar color based on text
  const getAvatarColor = (text) => {
    if (!text) return '#1976D2';
    
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
  };

  // Get first name or initials
  const getNameInitials = (participant) => {
    if (!participant) return '?';
    
    // Extract name from email address if possible
    const emailMatch = participant.match(/<([^>]+)>/);
    const email = emailMatch ? emailMatch[1] : participant;
    
    // Try to get name part before @ symbol
    const namePart = email.split('@')[0];
    return namePart.slice(0, 2).toUpperCase();
  };

  // Format date for display
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const lastWeek = new Date(now);
      lastWeek.setDate(now.getDate() - 7);
      
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      } else if (date > lastWeek) {
        return date.toLocaleDateString([], { weekday: 'short' });
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-white shadow rounded overflow-hidden">
      <div className="border-b border-gray-200">
        <div className="grid grid-cols-12 px-6 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div 
            className="col-span-6 cursor-pointer hover:text-gray-700"
            onClick={() => requestSort('subject')}
          >
            Conversations {getClassNamesFor('subject') === 'asc' ? '↑' : getClassNamesFor('subject') === 'desc' ? '↓' : ''}
          </div>
          <div 
            className="col-span-4 cursor-pointer hover:text-gray-700"
            onClick={() => requestSort('count')}
          >
            Messages {getClassNamesFor('count') === 'asc' ? '↑' : getClassNamesFor('count') === 'desc' ? '↓' : ''}
          </div>
          <div 
            className="col-span-2 cursor-pointer hover:text-gray-700"
            onClick={() => requestSort('date')}
          >
            Date {getClassNamesFor('date') === 'asc' ? '↑' : getClassNamesFor('date') === 'desc' ? '↓' : ''}
          </div>
        </div>
      </div>
      
      <div className="divide-y divide-gray-200 max-h-[600px] overflow-auto">
        {sortedConversations && sortedConversations.length > 0 ? (
          sortedConversations.map((conversation) => (
            <div 
              key={conversation.id}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${
                selectedConversationId === conversation.id ? 'bg-blue-50' : 
                !conversation.isRead ? 'font-semibold bg-gray-50' : ''
              }`}
              onClick={() => onSelectConversation(conversation)}
            >
              <div className="flex items-start">
                {/* Avatar */}
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center mr-4 flex-shrink-0"
                  style={{ backgroundColor: getAvatarColor(conversation.participants[0] || 'Unknown') }}
                >
                  <span className="text-white font-medium">
                    {getNameInitials(conversation.participants[0])}
                  </span>
                </div>
                
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`text-sm truncate ${!conversation.isRead ? 'font-semibold' : 'font-medium'}`}>
                      {conversation.subject || 'No Subject'}
                    </h3>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {formatDate(conversation.date)}
                    </span>
                  </div>
                  
                  <div className="flex items-center text-xs text-gray-500">
                    <span className="bg-gray-200 text-gray-700 rounded-full px-2 py-0.5 mr-2">
                      {conversation.count}
                    </span>
                    <span className="truncate">
                      {conversation.participants.slice(0, 2).join(', ')}
                      {conversation.participants.length > 2 && ', ...'}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {conversation.previewText || 'No preview available'}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-4 text-sm text-gray-500 text-center">
            No conversations found
          </div>
        )}
      </div>
      
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-sm text-gray-500">
        {sortedConversations?.length || 0} conversation{(sortedConversations?.length || 0) !== 1 ? 's' : ''} found
      </div>
    </div>
  );
}