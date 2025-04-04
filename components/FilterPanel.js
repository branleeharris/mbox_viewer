// File: components/FilterPanel.js
import { useState } from 'react';

export default function FilterPanel({ onApplyFilters, onShowConversation }) {
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    subject: '',
    searchTerm: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleApplyFilters = () => {
    onApplyFilters(filters);
  };

  const handleResetFilters = () => {
    setFilters({
      from: '',
      to: '',
      subject: '',
      searchTerm: ''
    });
    onApplyFilters({});
  };

  const handleShowConversation = () => {
    onShowConversation(filters.from, filters.to);
  };

  return (
    <div className="bg-white shadow rounded p-4 mb-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Filters</h2>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="from" className="block text-sm font-medium text-gray-700">From</label>
          <input
            type="text"
            name="from"
            id="from"
            value={filters.from}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="to" className="block text-sm font-medium text-gray-700">To</label>
          <input
            type="text"
            name="to"
            id="to"
            value={filters.to}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700">Subject</label>
          <input
            type="text"
            name="subject"
            id="subject"
            value={filters.subject}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="searchTerm" className="block text-sm font-medium text-gray-700">Quick Search</label>
          <input
            type="text"
            name="searchTerm"
            id="searchTerm"
            value={filters.searchTerm}
            onChange={handleChange}
            placeholder="Search in all fields"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={handleApplyFilters}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Apply Filters
          </button>
          
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Reset
          </button>
          
          <button
            type="button"
            onClick={handleShowConversation}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Conversation View
          </button>
        </div>
      </div>
    </div>
  );
}