document.addEventListener('DOMContentLoaded', () => {
  // Sidebar toggle
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('collapseBtn');
  const proGenerating = document.getElementById('pro-generating');

  if (menuBtn && sidebar) menuBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
  if (collapseBtn && sidebar) collapseBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

  // Drag & Drop
  const dropzone = document.getElementById('dropzone');
  const proFile = document.getElementById('pro_file');
  const chooseFile = document.getElementById('chooseFile');
  const dropHelper = document.getElementById('dropHelper');
  const tabs = document.querySelectorAll('.pro-tabs .tab');
  const sourceType = document.getElementById('pro_source_type');
  const panes = {
    text: document.getElementById('pane-text'),
    article: document.getElementById('pane-article'),
    youtube: document.getElementById('pane-youtube'),
  };

  function showGenerating(){ if (proGenerating) proGenerating.classList.remove('hidden'); }
  function hideGenerating(){ if (proGenerating) proGenerating.classList.add('hidden'); }

  if (chooseFile && proFile) chooseFile.addEventListener('click', (e) => proFile.click());

  function setPane(source) {
    Object.values(panes).forEach((pane) => {
      if (pane) pane.classList.remove('active');
    });
    if (panes[source]) panes[source].classList.add('active');
    if (sourceType) sourceType.value = source === 'file' ? 'file' : source === 'text' ? 'text' : 'text';
  }

  if (tabs.length) {
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const source = tab.dataset.source || 'file';
        setPane(source);
      });
    });
  }

  setPane('file');

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault(); dropzone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files && files.length) {
        // simple visual feedback, real upload handled via form submit / fetch
        const name = files[0].name;
        if (dropHelper) dropHelper.textContent = `Selected: ${name}`;
      }
    });
  }

  if (proFile) proFile.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f && dropHelper) dropHelper.textContent = `Selected: ${f.name}`;
  });

  // Generate button demo
  const genBtn = document.getElementById('genBtn');
  if (genBtn) genBtn.addEventListener('click', (e) => {
    showGenerating();
  });
});
