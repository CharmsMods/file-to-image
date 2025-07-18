// Main application entry point
import { showError } from './utils/error.js';
import { initTabs } from './modules/tabs.js';
import { initEmbedTab } from './modules/embed.js';
import { initExtractTab } from './modules/extract.js';

// Check for required browser features
function checkBrowserCompatibility() {
    const requiredFeatures = {
        'FileReader': typeof FileReader !== 'undefined',
        'Blob': typeof Blob !== 'undefined',
        'URL': typeof URL !== 'undefined' && 'createObjectURL' in URL,
        'Canvas': (() => {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext && canvas.getContext('2d'));
        })(),
        'Web Workers': typeof Worker !== 'undefined',
        'Typed Arrays': typeof Uint8Array !== 'undefined',
    };

    const unsupported = Object.entries(requiredFeatures)
        .filter(([_, supported]) => !supported)
        .map(([feature]) => feature);

    if (unsupported.length > 0) {
        showError(`Your browser is missing required features: ${unsupported.join(', ')}. Please use a modern browser.`);
        return false;
    }

    return true;
}

// Initialize the application
function initApp() {
    if (!checkBrowserCompatibility()) {
        return;
    }

    // Initialize tabs
    initTabs();
    
    // Initialize tab-specific functionality
    initEmbedTab();
    initExtractTab();
}

// Start the app when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
