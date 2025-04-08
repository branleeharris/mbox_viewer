// File: components/MboxMerger.js
import { useState, useRef } from 'react';

export default function MboxMerger({ onMergedFileReady }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [mergeProgress, setMergeProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Validate that all files are .mbox
    const nonMboxFiles = files.filter(file => !file.name.toLowerCase().endsWith('.mbox'));
    if (nonMboxFiles.length > 0) {
      setError(`Some files are not .mbox format: ${nonMboxFiles.map(f => f.name).join(', ')}`);
      return;
    }

    setSelectedFiles(files);
    setError('');
  };

  const mergeFiles = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select files to merge');
      return;
    }

    setIsProcessing(true);
    setMergeProgress(0);
    setError('');

    try {
      // Create a new Blob to hold the merged content
      const mergedContent = [];
      const totalFiles = selectedFiles.length;

      // Process each file
      for (let i = 0; i < totalFiles; i++) {
        const file = selectedFiles[i];
        const content = await readFileAsText(file);
        
        // Add newline between files if needed
        if (i > 0 && !content.startsWith('From ')) {
          mergedContent.push('\n');
        }
        
        mergedContent.push(content);
        setMergeProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      // Create a blob with the merged content
      const mergedBlob = new Blob(mergedContent, { type: 'text/plain' });
      
      // Generate a filename for the merged file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const mergedFileName = `merged_mbox_${timestamp}.mbox`;
      
      // Create a download link
      const downloadUrl = URL.createObjectURL(mergedBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = mergedFileName;
      
      // Trigger the download
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Cleanup
      URL.revokeObjectURL(downloadUrl);
      
      // Notify parent component if provided
      if (onMergedFileReady) {
        onMergedFileReady(mergedBlob, mergedFileName);
      }
      
      setIsProcessing(false);
      setMergeProgress(100);
      
      // Clear selected files after successful merge
      // Uncomment the next line if you want to clear selection after merge
      // setSelectedFiles([]);
    } catch (err) {
      setError(`Error merging files: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white shadow rounded p-4">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Merge MBOX Files</h2>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select multiple MBOX files to merge
        </label>
        <input
          type="file"
          accept=".mbox"
          multiple
          onChange={handleFileSelect}
          ref={fileInputRef}
          className="block w-full text-sm text-gray-500
                   file:mr-4 file:py-2 file:px-4
                   file:rounded-md file:border-0
                   file:text-sm file:font-medium
                   file:bg-blue-50 file:text-blue-700
                   hover:file:bg-blue-100"
        />
      </div>
      
      {selectedFiles.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Files ({selectedFiles.length})</h3>
          <ul className="max-h-40 overflow-y-auto text-sm text-gray-600 bg-gray-50 rounded p-2">
            {selectedFiles.map((file, index) => (
              <li key={index} className="py-1">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
      
      {isProcessing && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Merging files...</span>
            <span className="text-sm text-gray-500">{mergeProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${mergeProgress}%` }}
            ></div>
          </div>
        </div>
      )}
      
      <div className="flex space-x-3">
        <button
          type="button"
          onClick={mergeFiles}
          disabled={selectedFiles.length === 0 || isProcessing}
          className={`px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white 
                     ${selectedFiles.length === 0 || isProcessing 
                       ? 'bg-blue-300 cursor-not-allowed' 
                       : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}`}
        >
          Merge and Download
        </button>
        
        <button
          type="button"
          onClick={clearFiles}
          disabled={selectedFiles.length === 0 || isProcessing}
          className={`px-4 py-2 text-sm font-medium rounded-md shadow-sm border 
                     ${selectedFiles.length === 0 || isProcessing 
                       ? 'border-gray-200 text-gray-400 cursor-not-allowed' 
                       : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}`}
        >
          Clear
        </button>
      </div>
    </div>
  );
}