// Extract tab functionality
import { showError, AppError } from '../utils/error.js';
import { decodeFileFromCanvas } from '../utils/canvas.js';

// DOM Elements
let pngInput, extractResult, extractedFilename, extractedMimetype, extractedSize, downloadExtractedBtn;
let extractedFile = null;

// Initialize the extract tab
export function initExtractTab() {
    // Get DOM elements
    pngInput = document.getElementById('png-input');
    extractResult = document.getElementById('extract-result');
    extractedFilename = document.getElementById('extracted-filename');
    extractedMimetype = document.getElementById('extracted-mimetype');
    extractedSize = document.getElementById('extracted-size');
    downloadExtractedBtn = document.getElementById('download-extracted-btn');
    
    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // PNG input change
    pngInput.addEventListener('change', handlePngSelect);
    
    // Download extracted file
    downloadExtractedBtn.addEventListener('click', handleDownloadExtracted);
}

async function handlePngSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Check if file is a PNG
        if (!file.type.match('image/png')) {
            throw new AppError('Please select a valid PNG file.');
        }
        
        // Show processing modal
        showProcessingModal(true);
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
        
        updateProgress(30, 'Extracting data...');
        
        // Extract file from canvas
        const result = await decodeFileFromCanvas(canvas, (progress) => {
            updateProgress(30 + Math.floor(progress * 60), 'Extracting data...');
        });
        
        if (!result) {
            throw new AppError('No embedded file found in the image.');
        }
        
        // Store extracted file
        extractedFile = result;
        
        // Update UI with extracted file info
        updateExtractedFileInfo(result);
        
        // Show result section
        extractResult.classList.remove('hidden');
        
        // Hide processing modal
        showProcessingModal(false);
        
    } catch (error) {
        showProcessingModal(false);
        if (!(error instanceof AppError)) {
            console.error('Error extracting file:', error);
            showError('An error occurred while extracting the file. Please try again.');
        }
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
