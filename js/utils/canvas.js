// Canvas utilities for encoding/decoding files to/from PNG

// Constants
const HEADER_SIZE = 64; // bytes reserved for main header
const FILE_HEADER_SIZE = 128; // bytes reserved for each file header
const CHUNK_SIZE = 1024 * 512; // 512KB chunks for processing

// File format:
// Main Header (64 bytes):
// - Magic number (4 bytes): 'F2P1' (File to PNG v1)
// - Version (1 byte): Format version (1)
// - File count (1 byte): Number of files (max 255)
// - Reserved (58 bytes): For future use
//
// For each file:
// File Header (128 bytes):
// - Filename length (2 bytes)
// - Filename (max 100 bytes, UTF-8)
// - MIME type length (1 byte)
// - MIME type (max 20 bytes, ASCII)
// - File size (4 bytes, unsigned int)
// - Data offset (4 bytes, from start of data section)
// - Reserved (1 byte)
//
// Data section:
// - File data (concatenated)

/**
 * Calculate the minimum canvas dimensions needed to store the data
 * @param {number} byteLength - Length of the data in bytes
 * @returns {{width: number, height: number}} - Canvas dimensions
 */
/**
 * Calculate the minimum canvas dimensions needed to store multiple files
 * @param {Array} files - Array of { name, type, data }
 * @returns {{width: number, height: number}} - Canvas dimensions
 */
export function calculateCanvasSizeForFiles(files) {
    // Calculate total data size
    let totalSize = HEADER_SIZE;
    
    // Add size for each file header and data
    files.forEach(file => {
        totalSize += FILE_HEADER_SIZE;
        totalSize += file.data.byteLength;
    });
    
    // Each pixel can store 3 bytes (RGB)
    const totalPixelsNeeded = Math.ceil(totalSize / 3);
    
    // Calculate width as the next perfect square that can fit the data
    const side = Math.ceil(Math.sqrt(totalPixelsNeeded));
    
    // Ensure width is even to prevent issues with some PNG encoders
    const width = side % 2 === 0 ? side : side + 1;
    const height = Math.ceil(totalPixelsNeeded / width);
    
    return { width, height };
}

// Keep the old function for backward compatibility
export function calculateCanvasSize(byteLength) {
    return calculateCanvasSizeForFiles([{ data: new ArrayBuffer(byteLength) }]);
}

/**
 * Encode multiple files into a canvas
 * @param {HTMLCanvasElement} canvas - The canvas element to draw to
 * @param {Array} files - Array of {name: string, type: string, data: ArrayBuffer}
 * @param {Function} [progressCallback] - Optional progress callback (0-1)
 * @returns {Promise<void>}
 */
export async function encodeFilesToCanvas(canvas, files, progressCallback) {
    // Create main header
    const header = new Uint8Array(HEADER_SIZE);
    const headerView = new DataView(header.buffer);
    
    // Magic number 'F2P1' (File to PNG v1)
    headerView.setUint8(0, 0x46); // 'F'
    headerView.setUint8(1, 0x32); // '2'
    headerView.setUint8(2, 0x50); // 'P'
    headerView.setUint8(3, 0x31); // '1'
    
    // Version 1
    headerView.setUint8(4, 1);
    
    // Number of files (max 255)
    const fileCount = Math.min(files.length, 255);
    headerView.setUint8(5, fileCount);
    
    // Calculate total size needed
    let totalSize = HEADER_SIZE;
    const fileHeaders = [];
    let dataOffset = 0;
    
    // Prepare file headers and calculate offsets
    for (let i = 0; i < fileCount; i++) {
        const file = files[i];
        const nameBytes = new TextEncoder().encode(file.name);
        const mimeBytes = new TextEncoder().encode(file.type || 'application/octet-stream');
        
        const fileHeader = new Uint8Array(FILE_HEADER_SIZE);
        const headerView = new DataView(fileHeader.buffer);
        
        // Filename length (2 bytes) and filename (max 100 bytes)
        const nameLength = Math.min(nameBytes.length, 100);
        headerView.setUint16(0, nameLength, true);
        fileHeader.set(nameBytes.subarray(0, nameLength), 2);
        
        // MIME type length (1 byte) and MIME type (max 20 bytes)
        const mimeLength = Math.min(mimeBytes.length, 20);
        headerView.setUint8(102, mimeLength);
        fileHeader.set(mimeBytes.subarray(0, mimeLength), 103);
        
        // File size and data offset
        const fileSize = file.data.byteLength;
        headerView.setUint32(123, fileSize, true);
        headerView.setUint32(127, dataOffset, true);
        
        fileHeaders.push(fileHeader);
        dataOffset += fileSize;
        totalSize += FILE_HEADER_SIZE + fileSize;
    }
    
    // Create a single buffer for all data
    const buffer = new Uint8Array(totalSize);
    let offset = 0;
    
    // Copy main header
    buffer.set(header, offset);
    offset += header.length;
    
    // Copy file headers
    for (const fileHeader of fileHeaders) {
        buffer.set(fileHeader, offset);
        offset += fileHeader.length;
    }
    
    // Copy file data
    for (let i = 0; i < fileCount; i++) {
        const file = files[i];
        buffer.set(new Uint8Array(file.data), offset);
        offset += file.data.byteLength;
        
        // Update progress
        if (progressCallback) {
            progressCallback(offset / totalSize);
        }
    }
    
    // Now encode the combined buffer into the canvas
    return encodeBufferToCanvas(canvas, buffer.buffer, progressCallback);
}

/**
 * Internal function to encode a buffer into a canvas
 * @private
 */
async function encodeBufferToCanvas(canvas, arrayBuffer, progressCallback) {
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
    
    // Process in chunks to avoid UI freeze
    return new Promise((resolve) => {
        const processChunk = (start) => {
            const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength * 8 / 6);
            
            for (let i = start; i < end; i++) {
                const byteIndex = Math.floor(i * 3 / 4);
                const bitOffset = (i * 6) % 8;
                
                if (byteIndex + 1 < arrayBuffer.byteLength) {
                    const byte1 = dataView.getUint8(byteIndex);
                    const byte2 = dataView.getUint8(byteIndex + 1);
                    const value = ((byte1 << 8) | byte2) >> (10 - bitOffset) & 0x3F;
                    
                    const pixelIndex = i * 4;
                    data[pixelIndex] = (value >> 4) * 51;     // R
                    data[pixelIndex + 1] = ((value >> 2) & 0x3) * 85; // G
                    data[pixelIndex + 2] = (value & 0x3) * 85;       // B
                    data[pixelIndex + 3] = 255; // Alpha (fully opaque)
                }
            }
            
            // Update progress
            if (progressCallback) {
                progressCallback(end / (arrayBuffer.byteLength * 8 / 6));
            }
            
            // Process next chunk or finish
            if (end < arrayBuffer.byteLength * 8 / 6) {
                requestAnimationFrame(() => processChunk(end));
            } else {
                // Draw the final image
                ctx.putImageData(imageData, 0, 0);
                resolve();
            }
        };
        
        // Start processing
        processChunk(0);
    });
}

/**
 * Encode a single file into a canvas (legacy function)
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
 * Extract multiple files from a canvas
 * @param {HTMLCanvasElement} canvas - The canvas element containing the encoded data
 * @param {Function} [progressCallback] - Optional progress callback (0-1)
 * @returns {Promise<Array<{data: ArrayBuffer, name: string, type: string}>>}
 */
export async function extractFilesFromCanvas(canvas, progressCallback) {
    return new Promise((resolve, reject) => {
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                throw new Error('Could not get 2D context');
            }
            
            // Get image data from canvas
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Extract raw data from canvas
            extractDataFromCanvas(canvas, progressCallback)
                .then(arrayBuffer => {
                    const dataView = new DataView(arrayBuffer);
                    
                    // Check magic number
                    if (dataView.getUint8(0) !== 0x46 || // 'F'
                        dataView.getUint8(1) !== 0x32 || // '2'
                        dataView.getUint8(2) !== 0x50 || // 'P'
                        dataView.getUint8(3) !== 0x31) { // '1'
                        throw new Error('Invalid file format: Missing or invalid magic number');
                    }
                    
                    // Check version
                    const version = dataView.getUint8(4);
                    if (version !== 1) {
                        throw new Error(`Unsupported version: ${version}. This app only supports version 1.`);
                    }
                    
                    // Get number of files
                    const fileCount = dataView.getUint8(5);
                    if (fileCount === 0) {
                        throw new Error('No files found in the image');
                    }
                    
                    const files = [];
                    let offset = HEADER_SIZE;
                    
                    // Read file headers
                    for (let i = 0; i < fileCount; i++) {
                        if (offset + FILE_HEADER_SIZE > arrayBuffer.byteLength) {
                            console.warn('Unexpected end of data while reading file headers');
                            break;
                        }
                        
                        // Read filename length (2 bytes)
                        const nameLength = dataView.getUint16(offset, true);
                        
                        // Read filename (up to 100 bytes)
                        const nameBytes = new Uint8Array(arrayBuffer, offset + 2, Math.min(100, nameLength));
                        const name = new TextDecoder().decode(nameBytes);
                        
                        // Read MIME type length (1 byte)
                        const mimeLength = dataView.getUint8(offset + 102);
                        
                        // Read MIME type (up to 20 bytes)
                        const mimeBytes = new Uint8Array(arrayBuffer, offset + 103, Math.min(20, mimeLength));
                        const type = mimeLength > 0 ? new TextDecoder().decode(mimeBytes) : 'application/octet-stream';
                        
                        // Read file size and data offset (4 bytes each)
                        const size = dataView.getUint32(offset + 123, true);
                        const dataOffset = dataView.getUint32(offset + 127, true);
                        
                        // Calculate actual data position
                        const dataStart = HEADER_SIZE + (fileCount * FILE_HEADER_SIZE) + dataOffset;
                        const dataEnd = dataStart + size;
                        
                        if (dataEnd > arrayBuffer.byteLength) {
                            console.warn(`File ${name} data extends beyond buffer`);
                            continue;
                        }
                        
                        // Extract file data
                        const fileData = arrayBuffer.slice(dataStart, dataEnd);
                        
                        files.push({
                            name,
                            type,
                            data: fileData
                        });
                        
                        offset += FILE_HEADER_SIZE;
                        
                        // Update progress if callback provided
                        if (progressCallback) {
                            progressCallback((i + 1) / (fileCount + 1));
                        }
                    }
                    
                    if (files.length === 0) {
                        throw new Error('No valid files found in the image');
                    }
                    
                    resolve(files);
                    
                })
                .catch(error => {
                    console.error('Error extracting files:', error);
                    reject(new Error(`Failed to extract files: ${error.message}`));
                });
                
        } catch (error) {
            console.error('Error in extractFilesFromCanvas:', error);
            reject(new Error(`Failed to extract files: ${error.message}`));
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
