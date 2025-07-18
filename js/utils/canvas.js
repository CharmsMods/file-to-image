// Canvas utilities for encoding/decoding files to/from PNG

// Constants
const HEADER_SIZE = 32; // bytes reserved for header
const CHUNK_SIZE = 1024 * 512; // 512KB chunks for processing

/**
 * Calculate the minimum canvas dimensions needed to store the data
 * @param {number} byteLength - Length of the data in bytes
 * @returns {{width: number, height: number}} - Canvas dimensions
 */
export function calculateCanvasSize(byteLength) {
    // Each pixel can store 3 bytes (RGB)
    const totalPixelsNeeded = Math.ceil((byteLength + HEADER_SIZE) / 3);
    
    // Calculate width as the next perfect square that can fit the data
    // This helps maintain a more square aspect ratio
    const side = Math.ceil(Math.sqrt(totalPixelsNeeded));
    
    // Ensure width is even to prevent issues with some PNG encoders
    const width = side % 2 === 0 ? side : side + 1;
    const height = Math.ceil(totalPixelsNeeded / width);
    
    return { width, height };
}

/**
 * Encode file data into a canvas
 * @param {HTMLCanvasElement} canvas - The canvas element to draw to
 * @param {ArrayBuffer} arrayBuffer - The file data as ArrayBuffer
 * @param {string} filename - Original filename
 * @param {string} mimeType - File MIME type
 * @param {Function} [progressCallback] - Optional progress callback (0-1)
 * @returns {Promise<void>}
 */
export async function encodeFileToCanvas(canvas, arrayBuffer, filename, mimeType, progressCallback) {
    return new Promise((resolve, reject) => {
        try {
            const dataView = new DataView(arrayBuffer);
            const { width, height } = calculateCanvasSize(arrayBuffer.byteLength);
            
            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                throw new Error('Could not get 2D context');
            }
            
            // Create image data
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            // Encode header (first 32 bytes)
            const header = new Uint8Array(HEADER_SIZE);
            const headerView = new DataView(header.buffer);
            
            // Store filename length (2 bytes)
            const filenameBytes = new TextEncoder().encode(filename);
            headerView.setUint16(0, filenameBytes.length, true);
            
            // Store filename (up to 20 bytes)
            const maxFilenameLength = 20;
            const filenameToStore = filenameBytes.slice(0, maxFilenameLength);
            header.set(filenameToStore, 2);
            
            // Store MIME type length (2 bytes) and MIME type (up to 8 bytes)
            const mimeBytes = new TextEncoder().encode(mimeType);
            headerView.setUint16(22, mimeBytes.length, true);
            
            const maxMimeLength = 8;
            const mimeToStore = mimeBytes.slice(0, maxMimeLength);
            header.set(mimeToStore, 24);
            
            // Store total data length (4 bytes)
            headerView.setUint32(28, arrayBuffer.byteLength, true);
            
            // Combine header and file data
            const combined = new Uint8Array(HEADER_SIZE + arrayBuffer.byteLength);
            combined.set(header);
            combined.set(new Uint8Array(arrayBuffer), HEADER_SIZE);
            
            // Process in chunks to avoid UI freeze
            const processChunk = (start) => {
                const end = Math.min(start + CHUNK_SIZE, combined.length);
                
                for (let i = start; i < end; i += 3) {
                    const pixelIndex = (i / 3) * 4;
                    const r = i < combined.length ? combined[i] : 0;
                    const g = i + 1 < combined.length ? combined[i + 1] : 0;
                    const b = i + 2 < combined.length ? combined[i + 2] : 0;
                    
                    data[pixelIndex] = r;     // R
                    data[pixelIndex + 1] = g; // G
                    data[pixelIndex + 2] = b; // B
                    data[pixelIndex + 3] = 255; // Alpha (fully opaque)
                }
                
                // Update progress
                if (progressCallback) {
                    progressCallback(end / combined.length);
                }
                
                // Process next chunk or finish
                if (end < combined.length) {
                    requestAnimationFrame(() => processChunk(end));
                } else {
                    // Draw the final image
                    ctx.putImageData(imageData, 0, 0);
                    resolve();
                }
            };
            
            // Start processing
            processChunk(0);
            
        } catch (error) {
            console.error('Error encoding to canvas:', error);
            reject(new Error('Failed to encode file to canvas'));
        }
    });
}

/**
 * Decode file data from a canvas
 * @param {HTMLCanvasElement} canvas - The canvas containing the encoded data
 * @param {Function} [progressCallback] - Optional progress callback (0-1)
 * @returns {Promise<{filename: string, mimeType: string, data: Blob}>} - Decoded file data
 */
export async function decodeFileFromCanvas(canvas, progressCallback) {
    return new Promise((resolve, reject) => {
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                throw new Error('Could not get 2D context');
            }
            
            // Get image data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Read header (first 32 bytes = 11 pixels)
            const header = new Uint8Array(HEADER_SIZE);
            let headerBytesRead = 0;
            
            // Extract header bytes from image data
            for (let i = 0; i < 11 * 4 && headerBytesRead < HEADER_SIZE; i += 4) {
                const pixelIndex = i;
                if (headerBytesRead < HEADER_SIZE) header[headerBytesRead++] = data[pixelIndex];     // R
                if (headerBytesRead < HEADER_SIZE) header[headerBytesRead++] = data[pixelIndex + 1]; // G
                if (headerBytesRead < HEADER_SIZE) header[headerBytesRead++] = data[pixelIndex + 2]; // B
                // Skip alpha channel
            }
            
            const headerView = new DataView(header.buffer);
            
            // Read filename length (2 bytes)
            const filenameLength = headerView.getUint16(0, true);
            
            // Read filename (up to 20 bytes)
            const filenameBytes = header.slice(2, 2 + Math.min(20, filenameLength));
            const filename = new TextDecoder().decode(filenameBytes);
            
            // Read MIME type length (2 bytes) and MIME type (up to 8 bytes)
            const mimeLength = headerView.getUint16(22, true);
            const mimeBytes = header.slice(24, 24 + Math.min(8, mimeLength));
            const mimeType = mimeLength > 0 ? new TextDecoder().decode(mimeBytes) : 'application/octet-stream';
            
            // Read total data length (4 bytes)
            const dataLength = headerView.getUint32(28, true);
            
            if (dataLength <= 0 || dataLength > (canvas.width * canvas.height * 3) - HEADER_SIZE) {
                throw new Error('Invalid data length in header');
            }
            
            // Calculate total pixels needed (including header)
            const totalPixelsNeeded = Math.ceil((dataLength + HEADER_SIZE) / 3);
            const totalPixelsAvailable = canvas.width * canvas.height;
            
            if (totalPixelsNeeded > totalPixelsAvailable) {
                throw new Error('Image does not contain enough data');
            }
            
            // Create buffer for the extracted data
            const extractedData = new Uint8Array(dataLength);
            let bytesExtracted = 0;
            
            // Process in chunks to avoid UI freeze
            const processChunk = (startPixel) => {
                const endPixel = Math.min(startPixel + Math.ceil(CHUNK_SIZE / 3), totalPixelsNeeded);
                
                for (let i = startPixel; i < endPixel; i++) {
                    const pixelIndex = i * 4;
                    const dataIndex = (i * 3) - HEADER_SIZE;
                    
                    // Skip header pixels
                    if (dataIndex < 0) continue;
                    
                    // Extract RGB components
                    if (bytesExtracted < dataLength) extractedData[bytesExtracted++] = data[pixelIndex];     // R
                    if (bytesExtracted < dataLength) extractedData[bytesExtracted++] = data[pixelIndex + 1]; // G
                    if (bytesExtracted < dataLength) extractedData[bytesExtracted++] = data[pixelIndex + 2]; // B
                }
                
                // Update progress
                if (progressCallback) {
                    progressCallback(bytesExtracted / dataLength);
                }
                
                // Process next chunk or finish
                if (endPixel < totalPixelsNeeded) {
                    requestAnimationFrame(() => processChunk(endPixel));
                } else {
                    // Create blob from extracted data
                    const blob = new Blob([extractedData], { type: mimeType });
                    resolve({
                        filename,
                        mimeType,
                        data: blob
                    });
                }
            };
            
            // Start processing from the first pixel after the header
            const startPixel = Math.ceil(HEADER_SIZE / 3);
            processChunk(startPixel);
            
        } catch (error) {
            console.error('Error decoding from canvas:', error);
            reject(new Error('Failed to decode file from canvas'));
        }
    });
}
