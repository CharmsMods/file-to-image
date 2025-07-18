// Error handling utilities

export function showError(message, duration = 5000) {
    const toast = document.getElementById('error-toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    
    // Auto-hide after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

export class AppError extends Error {
    constructor(message, cause = null) {
        super(message);
        this.name = 'AppError';
        this.cause = cause;
        
        // Show error to user
        showError(message);
        
        // Log to console for debugging
        console.error(`[AppError] ${message}`, cause);
    }
}
