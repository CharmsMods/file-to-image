/**
 * Text to Image Clipboard Module
 * Converts text to an image and copies it to the clipboard
 */

export class TextToImageClipboard {
    constructor(options = {}) {
        // Default options
        this.options = {
            containerId: 'text-to-image-container',
            inputId: 'text-to-image-input',
            canvasId: 'text-to-image-canvas',
            backgroundColor: '#1e1e1e',
            textColor: '#ffffff',
            font: '16px monospace',
            padding: 20,
            onCopySuccess: null,
            onCopyError: null,
            ...options
        };

        // DOM elements
        this.container = null;
        this.input = null;
        this.canvas = null;
        this.ctx = null;

        // Initialize
        this.initialize();
    }

    initialize() {
        this.createElements();
        this.setupEventListeners();
    }

    createElements() {
        // Create container if it doesn't exist
        this.container = document.getElementById(this.options.containerId);
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = this.options.containerId;
            this.container.className = 'text-to-image-container';
            document.body.appendChild(this.container);
        }

        // Create input element
        this.input = document.getElementById(this.options.inputId);
        if (!this.input) {
            this.input = document.createElement('textarea');
            this.input.id = this.options.inputId;
            this.input.className = 'text-to-image-input';
            this.input.placeholder = 'Type or paste text here and press Enter to copy as image...';
            this.container.appendChild(this.input);
        }

        // Create canvas (hidden)
        this.canvas = document.getElementById(this.options.canvasId);
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = this.options.canvasId;
            this.canvas.style.display = 'none';
            document.body.appendChild(this.canvas);
        }
        this.ctx = this.canvas.getContext('2d');
    }

    setupEventListeners() {
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.copyToClipboard();
            }
            // Allow Shift+Enter for new lines
        });
    }

    async copyToClipboard() {
        const text = this.input.value.trim();
        if (!text) return;

        try {
            // Render text to canvas
            this.renderTextToCanvas(text);
            
            // Convert canvas to blob
            const blob = await new Promise((resolve) => {
                this.canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/png');
            });

            // Copy to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': blob
                })
            ]);

            // Success callback
            if (typeof this.options.onCopySuccess === 'function') {
                this.options.onCopySuccess();
            } else {
                this.showNotification('Image copied to clipboard!', 'success');
            }
        } catch (error) {
            console.error('Failed to copy image:', error);
            if (typeof this.options.onCopyError === 'function') {
                this.options.onCopyError(error);
            } else {
                this.showNotification('Failed to copy image to clipboard', 'error');
            }
        }
    }

    renderTextToCanvas(text) {
        const { padding, backgroundColor, textColor, font } = this.options;
        const ctx = this.ctx;
        
        // Set font
        ctx.font = font;
        ctx.textBaseline = 'top';
        
        // Split text into lines and calculate dimensions
        const lines = text.split('\n');
        const lineHeight = parseInt(font, 10) * 1.2; // 1.2 is line height
        
        // Calculate text dimensions
        let maxWidth = 0;
        lines.forEach(line => {
            const metrics = ctx.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        });
        
        // Set canvas dimensions with padding
        const canvasWidth = maxWidth + (padding * 2);
        const canvasHeight = (lineHeight * lines.length) + (padding * 2);
        
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        
        // Draw background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw text
        ctx.fillStyle = textColor;
        ctx.font = font;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, padding, padding + (index * lineHeight));
        });
    }

    showNotification(message, type = 'info') {
        // Remove existing notification if any
        const existing = document.querySelector('.text-to-image-notification');
        if (existing) existing.remove();
        
        // Create and show new notification
        const notification = document.createElement('div');
        notification.className = `text-to-image-notification ${type}`;
        notification.textContent = message;
        
        // Style notification
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 20px',
            borderRadius: '4px',
            color: '#fff',
            backgroundColor: type === 'error' ? '#f44336' : '#4CAF50',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            zIndex: '1000',
            transition: 'opacity 0.3s',
            opacity: '0',
            pointerEvents: 'none'
        });
        
        document.body.appendChild(notification);
        
        // Trigger reflow
        void notification.offsetWidth;
        
        // Fade in
        notification.style.opacity = '1';
        
        // Auto hide after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Public methods
    setOptions(options) {
        this.options = { ...this.options, ...options };
    }

    destroy() {
        // Clean up event listeners
        if (this.input) {
            this.input.removeEventListener('keydown', this.boundHandleKeyDown);
        }
        
        // Remove elements
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}

// Auto-initialize if data-auto-init is present
document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll('[data-text-to-image]');
    containers.forEach(container => {
        // Initialize with container-specific options if needed
        new TextToImageClipboard({
            containerId: container.id || 'text-to-image-container'
        });
    });
});
