// File: components/EmailListItem.js
import React from 'react';

export default function EmailListItem({ email, onClick, isSelected, onStar }) {
  // Function to generate a color based on email sender (for avatar)
  const generateColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF)
      .toString(16)
      .toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  };

  // Get sender's initials for avatar
  const getSenderInitials = () => {
    const name = email.from.split('<')[0].trim();
    return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2);
  };

  // Format date for display
  const formatDate = () => {
    try {
      const date = new Date(email.date);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      
      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    } catch (e) {
      return '';
    }
  };

  return (
    <div 
      className={`px-3 py-2 cursor-pointer flex items-start hover:shadow-md transition-shadow duration-150 ${
        isSelected ? 'bg-blue-50' : email.isRead ? 'bg-white' : 'bg-gray-50 font-medium'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center mr-3 mt-1">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onStar(email.id);
          }} 
          className="p-1"
        >
          {email.isStarred ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 hover:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          )}
        </button>
      </div>
      
      <div 
        className="w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
        style={{ backgroundColor: generateColor(email.from) }}
      >
        <span className="text-white text-sm font-medium">{getSenderInitials()}</span>
      </div>
      
      <div className="flex-grow min-w-0">
        <div className="flex items-baseline">
          <h3 className={`text-sm truncate ${!email.isRead && 'font-semibold'}`}>
            {email.from.split('<')[0].trim()}
          </h3>
          <span className="ml-auto text-xs text-gray-500 flex-shrink-0">{formatDate()}</span>
        </div>
        <h4 className="text-sm font-medium truncate">{email.subject}</h4>
        <p className="text-xs text-gray-500 truncate">
          {email.bodyText?.slice(0, 100).trim() || 'No content'}
          {email.conversationCount > 1 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
              {email.conversationCount}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}