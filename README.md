# File to PNG Converter

A browser-based application that allows you to embed any file into a PNG image and extract it back. This is a client-side only application that runs entirely in your browser.

## Features

- **File Embedding**: Convert any file into a PNG image
- **File Extraction**: Extract the original file from a PNG image
- **Client-Side Processing**: All processing happens in your browser, no server required
- **Progress Tracking**: Real-time progress indicators for encoding/decoding
- **Responsive Design**: Works on both desktop and mobile devices
- **No External Dependencies**: Pure HTML, CSS, and JavaScript

## How It Works

1. **Embedding a File**:
   - The file is read as an ArrayBuffer
   - A header is created containing metadata (filename, MIME type, file size)
   - The file data is converted to RGB values and embedded into a canvas
   - The canvas is converted to a PNG image which can be downloaded

2. **Extracting a File**:
   - The PNG image is loaded into a canvas
   - The RGB values are read from the canvas
   - The header is parsed to extract metadata
   - The original file is reconstructed and made available for download

## Browser Compatibility

This application requires a modern browser with support for:
- ES6 Modules
- FileReader API
- Canvas API
- Web Workers (for better performance with large files)

## Getting Started

1. Clone this repository or download the source files
2. Open `index.html` in a modern web browser
3. Use the interface to embed or extract files

## Usage

### Embedding a File
1. Click on the "Choose a file to embed" button
2. Select a file from your computer
3. The application will process the file and display a preview
4. Click "Download PNG" to save the image

### Extracting a File
1. Click on the "Extract" tab
2. Click on "Choose a PNG to extract"
3. Select a PNG image that was created by this application
4. The original file will be extracted and made available for download

## File Size Limitations

- The default maximum file size is 10MB
- This can be adjusted in the settings
- Files larger than 5MB will be processed using a Web Worker to prevent UI freezes

## Security Considerations

- All processing happens in your browser
- No files are uploaded to any server
- The application uses a Content Security Policy (CSP) for added security

## License

This project is open source and available under the [MIT License](LICENSE).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
