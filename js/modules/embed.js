// Embed tab functionality
import { showError, AppError } from '../utils/error.js';
import { readFileAsArrayBuffer, formatFileSize, sanitizeFilename } from '../utils/file.js';
import { createWorker, terminateWorker } from '../utils/worker.js';
import { calculateCanvasSizeForFiles, encodeFilesToCanvas } from '../utils/canvas.js';

// Constants
const DEFAULT_MAX_SIZE_MB = 10;
const MAX_TOTAL_SIZE_MB = 20; // Maximum total size for all files
const WORKER_CHUNK_SIZE = 1024 * 1024 * 2; // 2MB chunks for worker

// DOM Elements
let fileInput, maxSizeInput, previewCanvas, downloadBtn, showRawBtn, rawDataTextarea, fileListEl;
let selectedFiles = [];

// Helper function to update the file list UI
function updateFileList() {
    if (!fileListEl) return;
    
    fileListEl.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-message';
        emptyMsg.textContent = 'No files selected';
        fileListEl.appendChild(emptyMsg);
        return;
    }
    
    // Calculate total size
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);
    
    // Add file items
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.index = index;
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-item-info';
        
        const fileName = document.createElement('span');
        fileName.className = 'file-item-name';
        fileName.textContent = sanitizeFilename(file.name);
        
        const fileSize = document.createElement('span');
        fileSize.className = 'file-item-size';
        fileSize.textContent = `(${formatFileSize(file.size)})`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'file-item-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove file';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(index);
        });
        
        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileSize);
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(removeBtn);
        fileListEl.appendChild(fileItem);
    });
    
    // Update file info
    const fileInfo = document.querySelector('.file-info');
    if (fileInfo) {
        fileInfo.textContent = `${selectedFiles.length} file(s) selected, ${totalSizeMB.toFixed(2)} MB total`;
    }
}

// Helper function to remove a file from the selection
function removeFile(index) {
    if (index >= 0 && index < selectedFiles.length) {
        selectedFiles.splice(index, 1);
        updateFileList();
    }
}

// Helper function to validate file size
function validateFileSize(file, maxSizeMB) {
    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
        throw new AppError(`File "${file.name}" is too large. Maximum size is ${maxSizeMB}MB.`);
    }
}

// Helper function to validate total size
function validateTotalSize(files, maxTotalSizeMB) {
    const maxTotalSize = maxTotalSizeMB * 1024 * 1024;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    if (totalSize > maxTotalSize) {
        throw new AppError(`Total size of selected files (${formatFileSize(totalSize)}) exceeds the maximum limit of ${maxTotalSizeMB}MB.`);
    }
}

// Helper function to read a file as ArrayBuffer
async function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Error reading file'));
        reader.readAsArrayBuffer(file);
    });
}

// Initialize the embed tab
export function initEmbedTab() {
    // Get DOM elements
    fileInput = document.getElementById('file-input');
    maxSizeInput = document.getElementById('max-size');
    previewCanvas = document.getElementById('preview-canvas');
    downloadBtn = document.getElementById('download-btn');
    showRawBtn = document.getElementById('show-raw-btn');
    rawDataTextarea = document.getElementById('raw-data');
    fileListEl = document.getElementById('file-list');
    
    // Set initial state
    updateFileList();
    
    // Set default max size
    maxSizeInput.value = DEFAULT_MAX_SIZE_MB;
    
    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Allow drag and drop
    const dropZone = document.querySelector('.file-upload-container');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });
        
        dropZone.addEventListener('drop', handleDrop, false);
    }
    
    // Download button
    downloadBtn.addEventListener('click', handleDownload);
    
    // Show raw data button
    showRawBtn.addEventListener('click', toggleRawData);
    
    // Copy to clipboard
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyToClipboard);
    }
    
    // Max size input change
    maxSizeInput.addEventListener('change', () => {
        try {
            const maxSize = parseInt(maxSizeInput.value) || DEFAULT_MAX_SIZE_MB;
            validateTotalSize(selectedFiles, maxSize);
        } catch (error) {
            showError(error.message);
            maxSizeInput.value = DEFAULT_MAX_SIZE_MB;
        }
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    document.querySelector('.file-upload-container').classList.add('highlight');
}

function unhighlight() {
    document.querySelector('.file-upload-container').classList.remove('highlight');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

async function handleFiles(files) {
    try {
        const maxSize = parseInt(maxSizeInput.value) || DEFAULT_MAX_SIZE_MB;
        const newFiles = Array.from(files);
        
        // Validate new files
        newFiles.forEach(file => validateFileSize(file, maxSize));
        
        // Add new files to selection
        selectedFiles = [...selectedFiles, ...newFiles];
        
        // Validate total size
        validateTotalSize(selectedFiles, MAX_TOTAL_SIZE_MB);
        
        // Update UI
        updateFileList();
        
    } catch (error) {
        showError(error.message);
        throw error; // Re-throw to allow caller to handle if needed
    }
}

async function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    try {
        await handleFiles(files);
    } catch (error) {
        showError(error.message);
    } finally {
        // Reset file input to allow selecting the same files again
        event.target.value = '';
    }
}

async function encodeSelectedFiles() {
    if (selectedFiles.length === 0) {
        throw new AppError('No files selected. Please add files first.');
    }
    
    try {
        // Show loading state
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Processing...';
        
        // Prepare files array with data
        const filesWithData = [];
        let processedCount = 0;
        
        // Read all files as ArrayBuffer
        for (const file of selectedFiles) {
            try {
                const arrayBuffer = await readFileAsArrayBuffer(file);
                filesWithData.push({
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    data: arrayBuffer
                });
                
                // Update progress
                processedCount++;
                const progress = processedCount / selectedFiles.length * 100;
                downloadBtn.textContent = `Processing ${processedCount} of ${selectedFiles.length}... ${Math.round(progress)}%`;
                
            } catch (error) {
                console.error(`Error reading file ${file.name}:`, error);
                throw new AppError(`Error reading file: ${file.name}. ${error.message}`);
            }
        }
        
        // Encode all files to canvas
        await encodeFilesToCanvas(
            previewCanvas,
            filesWithData,
            (progress) => {
                const percent = Math.round(progress * 100);
                downloadBtn.textContent = `Encoding... ${percent}%`;
            }
        );
        
        // Enable download button
        downloadBtn.disabled = false;
        downloadBtn.textContent = `Download ${selectedFiles.length} file(s) as PNG`;
        
    } catch (error) {
        console.error('Error processing file:', error);
        showError('An error occurred while processing the file. Please try again.');
    }
}

function updateFileInfo(file) {
    const fileInfo = document.querySelector('#embed-tab .file-info');
    if (!fileInfo) return;
    
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    
    fileInfo.innerHTML = `
        <p>File name: <strong>${escapeHtml(file.name)}</strong></p>
        <p>File type: <strong>${file.type || 'Unknown'}</strong></p>
        <p>File size: <strong>${fileSizeMB} MB</strong></p>
    `;
}

async function handleDownload() {
    if (!previewCanvas || selectedFiles.length === 0) {
        showError('No files selected or encoded yet.');
        return;
    }
    
    try {
        // If files haven't been encoded yet, encode them first
        if (downloadBtn.textContent.includes('Select files first') || 
            downloadBtn.textContent.includes('Try again')) {
            await encodeSelectedFiles();
        }
        
        // Create a download link
        const link = document.createElement('a');
        
        // Set the download filename
        let filename = 'files';
        if (selectedFiles.length === 1) {
            filename = selectedFiles[0].name.replace(/\.[^/.]+$/, '') || 'file';
        }
        filename += '.png';
        
        link.download = filename;
        
        // Convert canvas to blob and create object URL
        const blob = await new Promise(resolve => {
            previewCanvas.toBlob(resolve, 'image/png');
        });
        
        const url = URL.createObjectURL(blob);
        link.href = url;
        
        // Show a success message
        const message = selectedFiles.length === 1 
            ? `Downloading ${selectedFiles[0].name} as PNG...`
            : `Downloading ${selectedFiles.length} files as PNG image...`;
        
        showSuccess(message);
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
    } catch (error) {
        console.error('Error downloading file:', error);
        showError(error.message || 'An error occurred while downloading the file.');
    }
}

// Helper function to show success message
function showSuccess(message) {
    const successEl = document.createElement('div');
    successEl.className = 'success-message';
    successEl.textContent = message;
    
    // Add to DOM
    const container = document.querySelector('.container');
    container.insertBefore(successEl, container.firstChild);
    
    // Remove after delay
    setTimeout(() => {
        successEl.classList.add('fade-out');
        setTimeout(() => successEl.remove(), 300);
    }, 3000);
}

function toggleRawData() {
    const rawDataContainer = document.getElementById('raw-data-container');
    const showRawBtn = document.getElementById('show-raw-btn');
    
    if (rawDataContainer.classList.contains('hidden')) {
        // Show raw data
        if (previewCanvas) {
            rawDataTextarea.value = previewCanvas.toDataURL('image/png');
        }
        rawDataContainer.classList.remove('hidden');
        showRawBtn.textContent = 'Hide Raw Data';
    } else {
        // Hide raw data
        rawDataContainer.classList.add('hidden');
        showRawBtn.textContent = 'Show Raw Data';
    }
}

async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(rawDataTextarea.value);
        showError('Copied to clipboard!', 2000);
    } catch (error) {
        console.error('Copy failed:', error);
        showError('Failed to copy to clipboard');
    }
}

// Helper functions
function showProcessingModal(show) {
    const modal = document.getElementById('progress-modal');
    if (!modal) return;
    
    if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function updateProgress(percent, message = '') {
    const progressBar = document.querySelector('.progress');
    const progressText = document.querySelector('.progress-text');
    
    if (progressBar) {
        progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
    
    if (progressText) {
        progressText.textContent = message || `${Math.round(percent)}%`;
    }
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
