// Extract tab functionality
import { showError, AppError, showSuccess } from '../utils/error.js';
import { extractFilesFromCanvas } from '../utils/canvas.js';
import JSZip from 'jszip';

// DOM Elements
let pngInput, extractResult, extractedFilesList, downloadAllBtn;
let extractedFiles = [];

// Initialize the extract tab
export function initExtractTab() {
    // Get DOM elements
    pngInput = document.getElementById('png-input');
    extractResult = document.getElementById('extract-result');
    extractedFilesList = document.getElementById('extracted-files-list');
    downloadAllBtn = document.getElementById('download-all-btn');
    
    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // PNG input change
    pngInput.addEventListener('change', handlePngSelect);
    
    // Download all files button
    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', handleDownloadAll);
    }
    
    // Handle drag and drop
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
    if (files.length > 0) {
        pngInput.files = files;
        handlePngSelect({ target: pngInput });
    }
}

async function handlePngSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Check if file is a PNG
        if (!file.type.match('image/png')) {
            throw new AppError('Please select a valid PNG file.');
        }
        
        // Show processing modal with cancel button
        const cancelToken = { cancelled: false };
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-secondary';
        cancelButton.onclick = () => {
            cancelToken.cancelled = true;
            showProcessingModal(false);
            showError('Operation cancelled by user');
        };

        showProcessingModal(true, 'Preparing to extract files...', cancelButton);
        updateProgress(0, 'Reading image...');
        
        // Create image element
        const img = new Image();
        const imgUrl = URL.createObjectURL(file);
        
        // Set up image load handler
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new AppError('Failed to load image.'));
            img.src = imgUrl;
        });
        
        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Clean up
        URL.revokeObjectURL(imgUrl);
        
        updateProgress(30, 'Extracting files...');
        
        // Extract files from canvas with progress and cancellation
        extractedFiles = await extractFilesFromCanvas(canvas, (progress, currentFile, totalFiles) => {
            const percent = 30 + Math.floor(progress * 60);
            let message = 'Extracting files...';
            
            if (currentFile !== undefined && totalFiles !== undefined) {
                message = `Extracting file ${currentFile + 1} of ${totalFiles} (${Math.round(progress * 100)}%)`;
            }
            
            updateProgress(percent, message);
            
            // Check for cancellation
            if (cancelToken.cancelled) {
                throw new Error('Operation cancelled');
            }
        });
        
        if (!extractedFiles || extractedFiles.length === 0) {
            throw new AppError('No embedded files found in the image.');
        }
        
        // Update UI with extracted files
        updateExtractedFilesList();
        
        // Show result section
        extractResult.classList.remove('hidden');
        
        // Show success message
        showSuccess(`Successfully extracted ${extractedFiles.length} file(s) from the image.`);
        
        // Hide processing modal
        showProcessingModal(false);
        
    } catch (error) {
        showProcessingModal(false);
        
        // Handle specific error cases
        if (error instanceof AppError) {
            showError(error.message);
        } else if (error.message === 'Operation cancelled') {
            // Don't show an error for user cancellation
            return;
        } else if (error.name === 'SecurityError') {
            showError('Security error: The operation is not allowed.');
        } else if (error.name === 'QuotaExceededError') {
            showError('Error: Not enough storage space to complete the operation.');
        } else if (error.message && error.message.includes('out of bounds')) {
            showError('Error: The image appears to be corrupted or not a valid embedded file.');
        } else {
            console.error('Error extracting files:', error);
            showError('An error occurred while extracting files. Please try again.');
        }
        
        // Reset state on error
        extractedFiles = [];
        updateExtractedFilesList();
    }
}

function updateExtractedFileInfo(fileData) {
    if (!fileData) return;
    
    const { filename, mimeType, data } = fileData;
    const fileSizeMB = (data.size / (1024 * 1024)).toFixed(2);
    
    // Update UI
    extractedFilename.textContent = filename || 'unknown';
    extractedMimetype.textContent = mimeType || 'application/octet-stream';
    extractedSize.textContent = `${fileSizeMB} MB (${data.size.toLocaleString()} bytes)`;
}

function updateExtractedFilesList() {
    if (!extractedFilesList) return;
    
    // Clear the list
    extractedFilesList.innerHTML = '';
    
    if (!extractedFiles || extractedFiles.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-message';
        emptyMsg.textContent = 'No files extracted';
        extractedFilesList.appendChild(emptyMsg);
        return;
    }
    
    // Add each file to the list
    extractedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.index = index;
        
        // File icon based on type
        const fileIcon = document.createElement('div');
        fileIcon.className = 'file-icon';
        fileIcon.innerHTML = getFileIcon(file.type);
        
        // File info
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = file.name || `file_${index + 1}`;
        
        const fileMeta = document.createElement('div');
        fileMeta.className = 'file-meta';
        fileMeta.textContent = `${formatFileSize(file.data.byteLength || 0)} • ${file.type || 'Unknown type'}`;
        
        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileMeta);
        
        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn-download';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadBtn.title = 'Download this file';
        downloadBtn.addEventListener('click', () => downloadFile(file));
        
        fileItem.appendChild(fileIcon);
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(downloadBtn);
        
        extractedFilesList.appendChild(fileItem);
    });
    
    // Show download all button if multiple files
    if (downloadAllBtn) {
        downloadAllBtn.style.display = extractedFiles.length > 1 ? 'inline-block' : 'none';
    }
}

function getFileIcon(mimeType) {
    const type = mimeType ? mimeType.split('/')[0] : '';
    
    switch (type) {
        case 'image':
            return '<i class="fas fa-file-image"></i>';
        case 'video':
            return '<i class="fas fa-file-video"></i>';
        case 'audio':
            return '<i class="fas fa-file-audio"></i>';
        case 'application':
            if (mimeType.includes('pdf')) return '<i class="fas fa-file-pdf"></i>';
            if (mimeType.includes('zip') || mimeType.includes('compressed')) return '<i class="fas fa-file-archive"></i>';
            if (mimeType.includes('word')) return '<i class="fas fa-file-word"></i>';
            if (mimeType.includes('excel')) return '<i class="fas fa-file-excel"></i>';
            if (mimeType.includes('powerpoint')) return '<i class="fas fa-file-powerpoint"></i>';
            return '<i class="fas fa-file-code"></i>';
        case 'text':
            return '<i class="fas fa-file-alt"></i>';
        default:
            return '<i class="fas fa-file"></i>';
    }
}

async function downloadFile(file) {
    const filename = file.name || 'downloaded_file';
    const cancelToken = { cancelled: false };
    
    // Create a cancel button for the modal
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.onclick = () => {
        cancelToken.cancelled = true;
        showProcessingModal(false);
        showError('Download cancelled');
    };
    
    try {
        // Show progress modal
        showProcessingModal(
            true, 
            `Preparing ${filename} for download...`,
            cancelButton
        );
        
        // Simulate a small delay to show the progress (actual download is instant)
        for (let i = 0; i <= 10; i++) {
            if (cancelToken.cancelled) {
                throw new Error('Download cancelled');
            }
            updateProgress(i * 10, 'Preparing download...');
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        
        if (cancelToken.cancelled) {
            throw new Error('Download cancelled');
        }
        
        // Create blob and download link
        const blob = new Blob([file.data], { type: file.type });
        const url = URL.createObjectURL(blob);
        
        // Create and trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        
        // Add event listener to clean up after download starts
        const cleanup = () => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showProcessingModal(false);
            
            // Only show success if not cancelled
            if (!cancelToken.cancelled) {
                showSuccess(`Downloaded ${filename}`);
            }
        };
        
        // Set up one-time click handler
        a.addEventListener('click', function handleClick() {
            // Small delay to ensure download starts before cleanup
            setTimeout(cleanup, 100);
            a.removeEventListener('click', handleClick);
        }, { once: true });
        
        // Trigger download
        a.click();
        
        // Fallback cleanup in case click handler doesn't fire
        setTimeout(cleanup, 2000);
        
    } catch (error) {
        showProcessingModal(false);
        
        if (error.message === 'Download cancelled') {
            // Don't show an error for user cancellation
            return;
        }
        
        console.error('Error downloading file:', error);
        
        if (error.name === 'SecurityError') {
            showError('Security error: The browser blocked the download.');
        } else if (error.name === 'QuotaExceededError') {
            showError('Error: Not enough disk space to save the file.');
        } else if (error.message && error.message.includes('network error')) {
            showError('Network error: Unable to complete the download.');
        } else {
            showError('Failed to download file. Please try again.');
        }
    }
}

async function handleDownloadAll() {
    if (!extractedFiles || extractedFiles.length === 0) {
        showError('No files to download');
        return;
    }
    
    // Set up cancellation
    const cancelToken = { cancelled: false };
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.onclick = () => {
        cancelToken.cancelled = true;
        showProcessingModal(false);
        showError('Download cancelled');
    };
    
    try {
        showProcessingModal(true, 'Preparing files for download...', cancelButton);
        
        if (extractedFiles.length === 1) {
            // If only one file, download it directly
            downloadFile(extractedFiles[0]);
            showProcessingModal(false);
            return;
        }
        
        // For multiple files, create a ZIP
        updateProgress(0, 'Preparing files...');
        
        // Create a new JSZip instance
        const zip = new JSZip();
        let fileCount = 0;
        const totalFiles = extractedFiles.length;
        
        // Add each file to the ZIP with progress updates
        for (const [index, file] of extractedFiles.entries()) {
            if (cancelToken.cancelled) {
                throw new Error('Download cancelled');
            }
            
            const filename = file.name || `file_${index + 1}`;
            updateProgress(
                (index / totalFiles) * 50, 
                `Adding ${filename} to archive... (${index + 1}/${totalFiles})`
            );
            
            // Add file to ZIP
            zip.file(filename, file.data);
            fileCount++;
        }
        
        if (cancelToken.cancelled) {
            throw new Error('Download cancelled');
        }
        
        // Generate the ZIP file with progress updates
        updateProgress(50, 'Creating ZIP archive...');
        
        const content = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
            platform: process.platform === 'win32' ? 'DOS' : 'UNIX'
        }, (metadata) => {
            // Update progress (50-100% for ZIP creation)
            const percent = 50 + (metadata.percent / 100) * 50;
            updateProgress(
                percent,
                `Compressing... (${Math.round(percent)}%)`
            );
            
            if (cancelToken.cancelled) {
                throw new Error('Download cancelled');
            }
        });
        
        if (cancelToken.cancelled) {
            throw new Error('Download cancelled');
        }
        
        // Create download link
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'extracted_files.zip';
        
        // Add link to document and trigger download
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showProcessingModal(false);
        }, 100);
        
        showSuccess(`Successfully downloaded ${fileCount} files as ZIP`);
        
    } catch (error) {
        showProcessingModal(false);
        
        if (error.message === 'Download cancelled') {
            // Don't show an error for user cancellation
            return;
        }
        
        console.error('Error creating ZIP:', error);
        
        if (error.message && error.message.includes('out of memory')) {
            showError('Error: Not enough memory to create the ZIP file. Try downloading fewer files at once.');
        } else if (error.message && error.message.includes('quota')) {
            showError('Error: Not enough disk space to save the ZIP file.');
        } else {
            showError('Failed to create download. Please try again.');
        }
    }
}

function handleDownloadExtracted() {
    if (!extractedFile) return;
    
    try {
        const { filename, data } = extractedFile;
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'extracted_file';
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to download extracted file. Please try again.');
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
