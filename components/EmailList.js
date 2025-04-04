// File: components/EmailList.js
import { useState, useEffect } from 'react';

export default function EmailList({ emails, onSelectEmail, selectedEmailId }) {
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [sortedEmails, setSortedEmails] = useState([]);
  
  useEffect(() => {
    let sortableEmails = [...emails];
    if (sortConfig.key) {
      sortableEmails.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    setSortedEmails(sortableEmails);
  }, [emails, sortConfig]);

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

  return (
    <div className="bg-white shadow rounded overflow-hidden">
      <div className="border-b border-gray-200">
        <div className="grid grid-cols-12 px-6 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div 
            className="col-span-3 cursor-pointer hover:text-gray-700"
            onClick={() => requestSort('from')}
          >
            From {getClassNamesFor('from') === 'asc' ? '↑' : getClassNamesFor('from') === 'desc' ? '↓' : ''}
          </div>
          <div 
            className="col-span-3 cursor-pointer hover:text-gray-700"
            onClick={() => requestSort('to')}
          >
            To {getClassNamesFor('to') === 'asc' ? '↑' : getClassNamesFor('to') === 'desc' ? '↓' : ''}
          </div>
          <div 
            className="col-span-4 cursor-pointer hover:text-gray-700"
            onClick={() => requestSort('subject')}
          >
            Subject {getClassNamesFor('subject') === 'asc' ? '↑' : getClassNamesFor('subject') === 'desc' ? '↓' : ''}
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
        {sortedEmails.length > 0 ? (
          sortedEmails.map((email) => (
            <div 
              key={email.id}
              className={`grid grid-cols-12 px-6 py-4 cursor-pointer hover:bg-gray-50 ${selectedEmailId === email.id ? 'bg-blue-50' : ''}`}
              onClick={() => onSelectEmail(email)}
            >
              <div className="col-span-3 truncate text-sm font-medium text-gray-900">{email.from}</div>
              <div className="col-span-3 truncate text-sm text-gray-500">{email.to}</div>
              <div className="col-span-4 truncate text-sm text-gray-500">{email.subject}</div>
              <div className="col-span-2 text-sm text-gray-500">{new Date(email.date).toLocaleDateString()}</div>
            </div>
          ))
        ) : (
          <div className="px-6 py-4 text-sm text-gray-500 text-center">
            No emails found
          </div>
        )}
      </div>
      
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-sm text-gray-500">
        {sortedEmails.length} email{sortedEmails.length !== 1 ? 's' : ''} found
      </div>
    </div>
  );
}