// Embed tab functionality
import { showError, AppError } from '../utils/error.js';
import { readFileAsArrayBuffer } from '../utils/file.js';
import { createWorker, terminateWorker } from '../utils/worker.js';
import { calculateCanvasSize, encodeFileToCanvas } from '../utils/canvas.js';

// Constants
const DEFAULT_MAX_SIZE_MB = 10;
const WORKER_CHUNK_SIZE = 1024 * 1024 * 2; // 2MB chunks for worker

// DOM Elements
let fileInput, maxSizeInput, previewCanvas, downloadBtn, showRawBtn, rawDataTextarea;
let currentFile = null;

// Initialize the embed tab
export function initEmbedTab() {
    // Get DOM elements
    fileInput = document.getElementById('file-input');
    maxSizeInput = document.getElementById('max-size');
    previewCanvas = document.getElementById('preview-canvas');
    downloadBtn = document.getElementById('download-btn');
    showRawBtn = document.getElementById('show-raw-btn');
    rawDataTextarea = document.getElementById('raw-data');
    
    // Set default max size
    maxSizeInput.value = DEFAULT_MAX_SIZE_MB;
    
    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Download button
    downloadBtn.addEventListener('click', handleDownload);
    
    // Show raw data button
    showRawBtn.addEventListener('click', toggleRawData);
    
    // Copy to clipboard
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyToClipboard);
    }
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // Check file size
        const maxSizeMB = parseInt(maxSizeInput.value) || DEFAULT_MAX_SIZE_MB;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        
        if (file.size > maxSizeBytes) {
            throw new AppError(`File is too large. Maximum size is ${maxSizeMB}MB.`);
        }
        
        currentFile = file;
        
        // Show processing modal
        showProcessingModal(true);
        updateProgress(0, 'Reading file...');
        
        // Read file as ArrayBuffer
        const arrayBuffer = await readFileAsArrayBuffer(file);
        
        // Calculate canvas size
        const { width, height } = calculateCanvasSize(arrayBuffer.byteLength);
        
        // Update progress
        updateProgress(30, 'Encoding data to image...');
        
        // Encode file to canvas
        await encodeFileToCanvas(previewCanvas, arrayBuffer, file.name, file.type, (progress) => {
            updateProgress(30 + Math.floor(progress * 60), 'Encoding data to image...');
        });
        
        // Show preview and download button
        document.querySelector('.preview-container').classList.remove('hidden');
        
        // Update file info
        updateFileInfo(file);
        
        // Hide processing modal
        showProcessingModal(false);
        
    } catch (error) {
        showProcessingModal(false);
        if (!(error instanceof AppError)) {
            console.error('Error processing file:', error);
            showError('An error occurred while processing the file. Please try again.');
        }
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
    if (!previewCanvas) return;
    
    try {
        // Convert canvas to blob
        const blob = await new Promise((resolve) => {
            previewCanvas.toBlob(resolve, 'image/png');
        });
        
        if (!blob) {
            throw new AppError('Failed to create image. Please try again.');
        }
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile ? `${currentFile.name}.png` : 'file.png';
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to download image. Please try again.');
    }
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
