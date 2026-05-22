// ==================== THEME TOGGLE ====================
const body = document.body;

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
        body.classList.remove('dark-mode');
    } else {
        body.classList.add('dark-mode');
        body.classList.remove('light-mode');
    }
    updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

function toggleTheme() {
    const isDark = body.classList.contains('dark-mode');
    const newTheme = isDark ? 'light' : 'dark';
    
    body.classList.toggle('dark-mode');
    body.classList.toggle('light-mode');
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}

// ==================== SIDEBAR NAVIGATION ====================
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');

function toggleSidebar() {
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

if (hamburger) {
    hamburger.addEventListener('click', toggleSidebar);
}

// Close sidebar when clicking on nav items
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        // Update active state
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        this.classList.add('active');
        
        if (window.innerWidth <= 1024 && sidebar) {
            sidebar.classList.remove('open');
        }
    });
});

// ==================== DRAG & DROP ====================
const uploadZone = document.querySelector('.upload-zone');

if (uploadZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.remove('dragover');
        }, false);
    });

    uploadZone.addEventListener('drop', handleDropZone, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDropZone(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.files = files;
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
            
            // Show file name
            const fileNameEl = document.querySelector('.file-name');
            if (fileNameEl) {
                fileNameEl.textContent = files[0].name;
            }
        }
    }
}

// ==================== SOURCE TABS ====================
const sourceTabs = document.querySelectorAll('.source-tab');
sourceTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        const tabName = this.dataset.tab;
        
        // Update active tab styling
        sourceTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.querySelector(`#${tabName}`);
        if (activeContent) {
            activeContent.classList.add('active');
        }
        
        // Update source type field
        const sourceTypeField = document.querySelector('input[name="source_type"]');
        if (sourceTypeField) {
            sourceTypeField.value = tabName.replace('-content', '');
        }
    });
});

// ==================== FILE INPUT HANDLING ====================
const fileInputs = document.querySelectorAll('input[type="file"]');
fileInputs.forEach(input => {
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const fileName = e.target.files[0].name;
            const fileNameEl = document.querySelector('.file-name');
            if (fileNameEl) {
                fileNameEl.textContent = fileName;
                fileNameEl.classList.add('block');
            }
        }
    });
});

// ==================== QUIZ TIMER ====================
let quizTimer = null;

function initQuizTimer(duration = 3600) {
    const timerEl = document.querySelector('.quiz-timer');
    if (!timerEl) return;
    
    let timeLeft = duration;
    
    quizTimer = setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        const timerDisplay = document.querySelector('.timer-display') || timerEl.lastChild;
        if (timerDisplay) {
            timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Change color based on time remaining
            if (timeLeft <= 60) {
                timerEl.classList.add('timer-critical');
                timerEl.classList.remove('timer-warning');
            } else if (timeLeft <= 300) {
                timerEl.classList.add('timer-warning');
                timerEl.classList.remove('timer-critical');
            }
        }
        
        if (timeLeft <= 0) {
            clearInterval(quizTimer);
            autoSubmitQuiz();
        }
    }, 1000);
}

function autoSubmitQuiz() {
    const quizForm = document.querySelector('.quiz-form, form[name="quizForm"]');
    if (quizForm) {
        showNotification('Time\'s up! Auto-submitting your quiz...', 'warning');
        setTimeout(() => quizForm.submit(), 2000);
    }
}

// ==================== PROGRESS BAR ====================
function updateProgressBar() {
    const questions = document.querySelectorAll('.question-card, .option-item');
    const answered = document.querySelectorAll('input[type="radio"]:checked').length;
    const total = document.querySelectorAll('input[type="radio"]').length / 4 || 1;
    
    const percentage = (answered / total) * 100;
    const progressFill = document.querySelector('.progress-fill');
    if (progressFill) {
        progressFill.style.width = percentage + '%';
    }
    
    const progressText = document.querySelector('.progress-text');
    if (progressText) {
        progressText.textContent = `${answered}/${Math.ceil(total)} answered`;
    }
}

// ==================== QUIZ OPTION SELECTION ====================
const quizOptions = document.querySelectorAll('.option-item input[type="radio"]');
quizOptions.forEach(option => {
    option.addEventListener('change', function() {
        // Remove selected class from siblings
        const questionCard = this.closest('.question-card');
        if (questionCard) {
            questionCard.querySelectorAll('.option-item').forEach(item => {
                item.classList.remove('selected');
            });
            this.closest('.option-item').classList.add('selected');
        }
        
        updateProgressBar();
        
        // Show instant feedback if enabled
        const feedbackToggle = document.querySelector('.instant-feedback-toggle');
        if (feedbackToggle && feedbackToggle.checked) {
            showInstantFeedback(this);
        }
    });
});

function showInstantFeedback(radioInput) {
    const optionItem = radioInput.closest('.option-item');
    const questionCard = radioInput.closest('.question-card');
    
    // Get correct answer (would come from server/data attribute)
    const correctAnswer = questionCard?.dataset.correctAnswer;
    const selectedValue = radioInput.value;
    
    if (selectedValue === correctAnswer) {
        optionItem.classList.add('correct');
        optionItem.classList.remove('incorrect');
    } else {
        optionItem.classList.add('incorrect');
        optionItem.classList.remove('correct');
    }
}

// ==================== QUESTION NAVIGATION ====================
const nextBtn = document.querySelector('.btn-next');
const prevBtn = document.querySelector('.btn-prev');
const questionCards = document.querySelectorAll('.question-card');
let currentQuestion = 0;

if (nextBtn) {
    nextBtn.addEventListener('click', showNextQuestion);
}

if (prevBtn) {
    prevBtn.addEventListener('click', showPreviousQuestion);
}

function showNextQuestion() {
    if (currentQuestion < questionCards.length - 1) {
        questionCards[currentQuestion].classList.remove('active');
        currentQuestion++;
        questionCards[currentQuestion].classList.add('active');
        scrollToQuestion();
    }
}

function showPreviousQuestion() {
    if (currentQuestion > 0) {
        questionCards[currentQuestion].classList.remove('active');
        currentQuestion--;
        questionCards[currentQuestion].classList.add('active');
        scrollToQuestion();
    }
}

function scrollToQuestion() {
    const activeQuestion = questionCards[currentQuestion];
    if (activeQuestion) {
        activeQuestion.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ==================== COPY TO CLIPBOARD ====================
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied to clipboard!');
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Copied to clipboard!');
    });
}

const copyButtons = document.querySelectorAll('.btn-copy, [data-copy]');
copyButtons.forEach(btn => {
    btn.addEventListener('click', function() {
        const text = this.dataset.copy || this.textContent;
        copyToClipboard(text);
    });
});

// ==================== NOTIFICATIONS ====================
function showNotification(message, type = 'message') {
    const container = document.querySelector('.flash-stack') || createFlashContainer();
    
    const flash = document.createElement('div');
    flash.className = `flash flash-${type}`;
    flash.innerHTML = `
        <span>${message}</span>
    `;
    
    container.appendChild(flash);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 300);
    }, 5000);
}

function createFlashContainer() {
    const container = document.createElement('div');
    container.className = 'flash-stack';
    const mainContent = document.querySelector('.main-content') || document.body;
    mainContent.insertBefore(container, mainContent.firstChild);
    return container;
}

// ==================== FORM VALIDATION ====================
const quizForms = document.querySelectorAll('form');
quizForms.forEach(form => {
    form.addEventListener('submit', (e) => {
        // Validate required fields
        const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
                showNotification(`Please fill in all required fields`, 'error');
            }
        });
        
        // Validate quiz answers
        if (form.querySelector('input[type="radio"]')) {
            const unanswered = form.querySelectorAll('.question-card').length - 
                             form.querySelectorAll('input[type="radio"]:checked').length / 4;
            
            if (unanswered > 0) {
                isValid = false;
                showNotification(`Please answer all ${unanswered} remaining questions`, 'error');
            }
        }
        
        if (!isValid) {
            e.preventDefault();
        }
    });
});

// ==================== PDF DOWNLOAD ====================
const downloadPdfBtn = document.querySelector('.btn-download-pdf');
if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const quizId = this.dataset.quizId;
        if (quizId) {
            fetch(`/download-pdf/${quizId}`)
                .then(response => {
                    if (response.ok) {
                        return response.blob();
                    }
                    throw new Error('Failed to download PDF');
                })
                .then(blob => {
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `quiz-${quizId}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    showNotification('PDF downloaded successfully!');
                })
                .catch(error => {
                    console.error('Error:', error);
                    showNotification('Failed to download PDF', 'error');
                });
        }
    });
}

// ==================== SHARE QUIZ ====================
const shareBtn = document.querySelector('.btn-share-quiz');
if (shareBtn) {
    shareBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const quizId = this.dataset.quizId;
        if (quizId) {
            fetch(`/api/share-quiz`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ quiz_id: quizId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.share_link) {
                    copyToClipboard(data.share_link);
                    showNotification('Share link copied to clipboard!');
                } else {
                    showNotification('Failed to generate share link', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotification('Error sharing quiz', 'error');
            });
        }
    });
}

// ==================== SETTINGS TOGGLES ====================
const toggleSwitches = document.querySelectorAll('.toggle-switch');
toggleSwitches.forEach(toggle => {
    toggle.addEventListener('click', function() {
        this.classList.toggle('active');
        
        // Save preference
        const settingName = this.dataset.setting;
        if (settingName) {
            const isActive = this.classList.contains('active');
            localStorage.setItem(`setting-${settingName}`, isActive);
        }
    });
});

// Load saved toggle states
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        const settingName = toggle.dataset.setting;
        if (settingName) {
            const saved = localStorage.getItem(`setting-${settingName}`);
            if (saved === 'true') {
                toggle.classList.add('active');
            }
        }
    });
});

// ==================== ACCESSIBILITY ====================
// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar) {
        sidebar.classList.remove('open');
    }
});

// Skip to main content link
const skipLink = document.createElement('a');
skipLink.href = '#content';
skipLink.className = 'skip-link';
skipLink.textContent = 'Skip to main content';
skipLink.style.cssText = `
    position: absolute;
    top: -40px;
    left: 0;
    background: #57c7ff;
    color: #031018;
    padding: 8px 16px;
    z-index: 100;
`;
skipLink.addEventListener('focus', function() {
    this.style.top = '0';
});
skipLink.addEventListener('blur', function() {
    this.style.top = '-40px';
});
document.body.insertBefore(skipLink, document.body.firstChild);

// ==================== RESPONSIVE BEHAVIOR ====================
window.addEventListener('resize', () => {
    if (window.innerWidth > 1024 && sidebar) {
        sidebar.classList.remove('open');
    }
});

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Initialize progress bar
    updateProgressBar();
    
    // Initialize timer if quiz page
    const quizTimerEl = document.querySelector('.quiz-timer');
    if (quizTimerEl) {
        const duration = parseInt(quizTimerEl.dataset.duration || '3600');
        initQuizTimer(duration);
    }
    
    // Show first question
    if (questionCards.length > 0) {
        questionCards[0].classList.add('active');
    }
    
    // Add animation to cards
    const cards = document.querySelectorAll('.card, .question-card, .history-card');
    cards.forEach((card, index) => {
        card.style.animation = `fadeIn 0.3s ease ${index * 0.1}s both`;
    });
});

// ==================== HELPER FUNCTIONS ====================
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// Add fadeIn animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);
