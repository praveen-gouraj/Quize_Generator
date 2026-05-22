/* ========================================
   GLOBAL UTILITIES
   ======================================== */

// Initialize theme from localStorage
function initTheme() {
  const isDark = localStorage.getItem('darkMode') !== 'false';
  if (!isDark) {
    document.body.classList.add('light-mode');
  }
  updateThemeIcon();
}

// Toggle dark/light theme
function toggleTheme() {
  const isDark = document.body.classList.toggle('light-mode');
  localStorage.setItem('darkMode', isDark ? 'false' : 'true');
  updateThemeIcon();
}

// Update theme toggle button icon
function updateThemeIcon() {
  const themeBtn = document.querySelector('[data-theme-toggle]');
  if (themeBtn) {
    const isDark = !document.body.classList.contains('light-mode');
    themeBtn.textContent = isDark ? '☀️' : '🌙';
  }
}

// Toggle sidebar on mobile
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
}

// Show notification toast
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'error' ? '#ff7088' : type === 'warning' ? '#ffa500' : '#64e39a'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999;
    animation: slideIn 300ms ease;
  `;
  
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOut 300ms ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Copy text to clipboard
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/* ========================================
   FORM & INTERACTION HANDLERS
   ======================================== */

document.addEventListener('DOMContentLoaded', function () {
  // Initialize theme
  initTheme();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
      }
    }
  });

  // Theme toggle button
  const themeToggle = document.querySelector('[data-theme-toggle]');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Sidebar toggle button
  const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
  }

  // Dashboard page: tabs for file/text/article/youtube
  const tabs = document.querySelectorAll('.source-tabs .source-tab');
  if (tabs.length) {
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const source = tab.dataset.source;
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        const contents = document.querySelectorAll('.tab-content');
        contents.forEach(c => c.classList.remove('active'));
        const activeContent = document.getElementById(`tab-${source}`);
        if (activeContent) {
          activeContent.classList.add('active');
        }
        
        // Update hidden input
        const sourceInput = document.getElementById('source_type');
        if (sourceInput) {
          sourceInput.value = source;
        }
      });
    });
  }

  // File input handler
  const fileInput = document.getElementById('study_material');
  const fileName = document.getElementById('file_name');
  if (fileInput && fileName) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        fileName.textContent = fileInput.files[0].name;
      }
    });
  }

  // Drag and drop zone
  const uploadZone = document.querySelector('.upload-zone');
  if (uploadZone) {
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

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

    uploadZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (fileInput) {
        fileInput.files = files;
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
      }
    }, false);

    uploadZone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  // Quiz page: progress tracking
  const quizForm = document.getElementById('quizForm');
  if (quizForm) {
    const updateProgress = () => {
      const questions = document.querySelectorAll('.question-card');
      const answered = document.querySelectorAll('input[type="radio"]:checked').length;
      
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');
      
      if (progressFill) {
        progressFill.style.width = ((answered / questions.length) * 100) + '%';
      }
      if (progressText) {
        progressText.textContent = `${answered}/${questions.length} answered`;
      }
    };

    quizForm.addEventListener('change', updateProgress);
    updateProgress();

    // Form validation on submit
    quizForm.addEventListener('submit', (e) => {
      const unanswered = document.querySelectorAll('.question-card').length - 
                         document.querySelectorAll('input[type="radio"]:checked').length;
      
      if (unanswered > 0) {
        e.preventDefault();
        showNotification(`Please answer all ${unanswered} remaining questions`, 'error');
      }
    });
  }

  // Result page: PDF and share buttons
  document.querySelectorAll('.btn-download-pdf').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const quizId = this.dataset.quizId;
      if (quizId) {
        window.location.href = `/download-pdf/${quizId}`;
      }
    });
  });

  document.querySelectorAll('.btn-share-quiz').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const quizId = this.dataset.quizId;
      if (quizId) {
        fetch(`/api/share-quiz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quiz_id: quizId })
        })
        .then(r => r.json())
        .then(data => {
          if (data.share_link) {
            copyToClipboard(data.share_link);
            showNotification('Share link copied! 🔗');
          }
        })
        .catch(() => showNotification('Failed to share', 'error'));
      }
    });
  });

  // History page: filtering and sorting
  const sortBy = document.getElementById('sortBy');
  const difficultyFilter = document.getElementById('difficultyFilter');
  const searchInput = document.getElementById('searchInput');

  const filterAndSort = () => {
    const cards = document.querySelectorAll('.history-card');
    const sortValue = sortBy?.value || 'date-desc';
    const diffValue = difficultyFilter?.value || '';
    const searchValue = searchInput?.value.toLowerCase() || '';

    cards.forEach(card => {
      const difficulty = card.dataset.difficulty;
      const matchesDiff = !diffValue || difficulty === diffValue;
      const matchesSearch = !searchValue || card.textContent.toLowerCase().includes(searchValue);
      card.style.display = (matchesDiff && matchesSearch) ? 'grid' : 'none';
    });
  };

  if (sortBy) sortBy.addEventListener('change', filterAndSort);
  if (difficultyFilter) difficultyFilter.addEventListener('change', filterAndSort);
  if (searchInput) searchInput.addEventListener('input', filterAndSort);

  // Settings page: toggle switches
  document.querySelectorAll('.toggle-switch').forEach(toggle => {
    const setting = toggle.dataset.setting;
    if (setting) {
      const saved = localStorage.getItem(`setting-${setting}`);
      if (saved === 'true') {
        toggle.classList.add('active');
      }
    }

    toggle.addEventListener('click', function() {
      this.classList.toggle('active');
      const setting = this.dataset.setting;
      if (setting) {
        localStorage.setItem(`setting-${setting}`, this.classList.contains('active'));
      }
    });
  });
});

// Animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
