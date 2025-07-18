// Web Worker utilities for offloading heavy processing

// Worker context for encoding files to PNG
const ENCODE_WORKER_CODE = `
self.onmessage = function(e) {
    const { fileData, width, height, chunkSize, header } = e.data;
    const totalPixels = width * height;
    const pixels = new Uint8ClampedArray(totalPixels * 4);
    
    // Fill with white background
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 255;     // R
        pixels[i + 1] = 255; // G
        pixels[i + 2] = 255; // B
        pixels[i + 3] = 255; // A (fully opaque)
    }
    
    // Process data in chunks
    const processChunk = (start, end) => {
        for (let i = start; i < end; i++) {
            const pixelIndex = Math.floor(i / 3) * 4 + (i % 3);
            if (pixelIndex < pixels.length) {
                pixels[pixelIndex] = fileData[i];
            }
        }
        
        // Report progress
        if ((end % chunkSize) === 0 || end >= fileData.length) {
            self.postMessage({
                type: 'progress',
                progress: end / fileData.length
            });
        }
        
        // Process next chunk or finish
        if (end < fileData.length) {
            setTimeout(() => {
                processChunk(end, Math.min(end + chunkSize, fileData.length));
            }, 0);
        } else {
            self.postMessage({
                type: 'complete',
                pixels: pixels.buffer,
                width,
                height
            }, [pixels.buffer]);
        }
    };
    
    // Start processing
    processChunk(0, Math.min(chunkSize, fileData.length));
};
`;

// Worker context for decoding files from PNG
const DECODE_WORKER_CODE = `
self.onmessage = function(e) {
    const { imageData, headerSize, dataLength, chunkSize } = e.data;
    const data = new Uint8Array(imageData);
    const result = new Uint8Array(dataLength);
    let bytesProcessed = 0;
    
    // Process data in chunks
    const processChunk = (start, end) => {
        for (let i = start; i < end; i++) {
            const pixelIndex = Math.floor((i + headerSize) / 3) * 4 + ((i + headerSize) % 3);
            if (i < dataLength && pixelIndex < data.length) {
                result[i] = data[pixelIndex];
                bytesProcessed++;
            }
        }
        
        // Report progress
        if ((bytesProcessed % chunkSize) === 0 || bytesProcessed >= dataLength) {
            self.postMessage({
                type: 'progress',
                progress: bytesProcessed / dataLength
            });
        }
        
        // Process next chunk or finish
        if (bytesProcessed < dataLength) {
            setTimeout(() => {
                processChunk(end, Math.min(end + chunkSize, dataLength));
            }, 0);
        } else {
            self.postMessage({
                type: 'complete',
                data: result.buffer
            }, [result.buffer]);
        }
    };
    
    // Start processing
    processChunk(0, Math.min(chunkSize, dataLength));
};
`;

// Create a Blob URL for a worker
function createWorkerBlobURL(workerCode) {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
}

// Create a new worker
let encodeWorker = null;
let decodeWorker = null;

export function createWorker(type = 'encode') {
    if (type === 'encode') {
        if (!encodeWorker) {
            const workerUrl = createWorkerBlobURL(ENCODE_WORKER_CODE);
            encodeWorker = new Worker(workerUrl);
        }
        return encodeWorker;
    } else {
        if (!decodeWorker) {
            const workerUrl = createWorkerBlobURL(DECODE_WORKER_CODE);
            decodeWorker = new Worker(workerUrl);
        }
        return decodeWorker;
    }
}

export function terminateWorker(type = 'encode') {
    if (type === 'encode' && encodeWorker) {
        encodeWorker.terminate();
        encodeWorker = null;
    } else if (decodeWorker) {
        decodeWorker.terminate();
        decodeWorker = null;
    }
}

export function terminateAllWorkers() {
    terminateWorker('encode');
    terminateWorker('decode');
}
