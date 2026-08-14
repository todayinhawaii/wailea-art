(function () {
  function setupSortableList({ listId, saveBtnId, statusId, endpoint, bodyKey, parseAsInt }) {
    const list = document.getElementById(listId);
    if (!list) return;

    const saveBtn = document.getElementById(saveBtnId);
    const statusEl = document.getElementById(statusId);

    let statusTimeout = null;

    function showStatus(message, isError) {
      if (!statusEl) return;
      clearTimeout(statusTimeout);
      statusEl.textContent = message;
      statusEl.style.color = isError ? 'var(--danger)' : '#2f5c30';
      statusEl.style.opacity = '1';
      statusTimeout = setTimeout(() => { statusEl.style.opacity = '0'; }, 3000);
    }

    list.querySelectorAll('.sortable-item').forEach(item => {
      item.addEventListener('dragstart', () => {
        setTimeout(() => item.classList.add('dragging'), 0);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        saveOrder();
      });
    });

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = getDragAfterElement(list, e.clientY);
      const dragging = list.querySelector('.dragging');
      if (!dragging) return;
      if (afterElement == null) {
        list.appendChild(dragging);
      } else {
        list.insertBefore(dragging, afterElement);
      }
    });

    function getDragAfterElement(container, y) {
      const items = [...container.querySelectorAll('.sortable-item:not(.dragging)')];
      return items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
    }

    async function saveOrder(manual) {
      const ids = [...list.querySelectorAll('.sortable-item')].map(el => {
        const raw = el.dataset.id;
        return parseAsInt && raw !== 'all' ? parseInt(raw, 10) : raw;
      });

      if (manual && saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [bodyKey]: ids })
        });
        if (!res.ok) throw new Error('Server returned an error');
        const data = await res.json();
        if (!data || !data.ok) throw new Error('Save did not confirm');

        showStatus('✓ Order saved', false);
      } catch (err) {
        console.error('Failed to save order', err);
        showStatus('Could not save the new order — please try again.', true);
      } finally {
        if (manual && saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save order';
        }
      }
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => saveOrder(true));
    }

    // To top / To bottom — move the item instantly in the page itself and
    // auto-save, so the browser never reloads and the page never scrolls
    // or jumps. The person's view stays exactly where it was.
    list.querySelectorAll('.move-top-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.sortable-item');
        if (!item) return;
        list.insertBefore(item, list.firstChild);
        saveOrder();
      });
    });

    list.querySelectorAll('.move-bottom-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.sortable-item');
        if (!item) return;
        list.appendChild(item);
        saveOrder();
      });
    });
  }

  setupSortableList({
    listId: 'sortableList',
    saveBtnId: 'saveOrderBtn',
    statusId: 'orderSaveStatus',
    endpoint: '/admin/artworks/reorder',
    bodyKey: 'orderedIds',
    parseAsInt: true
  });

  setupSortableList({
    listId: 'categorySortableList',
    saveBtnId: 'saveCategoryOrderBtn',
    statusId: 'categoryOrderSaveStatus',
    endpoint: '/admin/categories/reorder',
    bodyKey: 'orderedItems',
    parseAsInt: false
  });

  setupSortableList({
    listId: 'postsSortableList',
    saveBtnId: 'savePostOrderBtn',
    statusId: 'postOrderSaveStatus',
    endpoint: '/admin/posts/reorder',
    bodyKey: 'orderedIds',
    parseAsInt: true
  });

  // ---------- Bulk select & delete artworks ----------
  (function () {
    const selectAll = document.getElementById('selectAllArtworks');
    const checkboxes = () => [...document.querySelectorAll('.artwork-select-checkbox')];
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const countEl = document.getElementById('selectedCount');
    if (!selectAll || !deleteBtn) return;

    function updateDeleteButton() {
      const checked = checkboxes().filter(cb => cb.checked);
      countEl.textContent = checked.length;
      deleteBtn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
      selectAll.checked = checked.length > 0 && checked.length === checkboxes().length;
    }

    selectAll.addEventListener('change', () => {
      checkboxes().forEach(cb => { cb.checked = selectAll.checked; });
      updateDeleteButton();
    });

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('artwork-select-checkbox')) updateDeleteButton();
    });

    // Shift-click to select a whole range at once, same as Finder/Explorer.
    let lastClickedIndex = null;
    document.addEventListener('click', (e) => {
      if (!e.target.classList.contains('artwork-select-checkbox')) return;

      const boxes = checkboxes();
      const currentIndex = boxes.indexOf(e.target);

      if (e.shiftKey && lastClickedIndex !== null) {
        const [start, end] = [lastClickedIndex, currentIndex].sort((a, b) => a - b);
        const shouldCheck = e.target.checked;
        for (let i = start; i <= end; i++) {
          boxes[i].checked = shouldCheck;
        }
        updateDeleteButton();
      }

      lastClickedIndex = currentIndex;
    });

    // Prevent checkbox clicks from starting a drag on the parent card.
    checkboxes().forEach(cb => {
      cb.addEventListener('mousedown', (e) => e.stopPropagation());
    });

    deleteBtn.addEventListener('click', async () => {
      const ids = checkboxes().filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));
      if (ids.length === 0) return;
      if (!confirm(`Delete ${ids.length} piece${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting…';

      try {
        const res = await fetch('/admin/artworks/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids })
        });
        if (!res.ok) throw new Error('Server returned an error');
        window.location.reload();
      } catch (err) {
        console.error('Bulk delete failed', err);
        alert('Could not delete the selected pieces. Please try again.');
        deleteBtn.disabled = false;
        deleteBtn.textContent = `Delete selected (${ids.length})`;
      }
    });
  })();

  // ---------- Bulk select, delete & email messages ----------
  (function () {
    const selectAll = document.getElementById('selectAllMessages');
    const checkboxes = () => [...document.querySelectorAll('.message-select-checkbox')];
    const deleteBtn = document.getElementById('deleteSelectedMessagesBtn');
    const emailBtn = document.getElementById('emailSelectedMessagesBtn');
    const countEl = document.getElementById('selectedMessagesCount');
    const countForEmailEl = document.getElementById('selectedMessagesCountForEmail');
    const composer = document.getElementById('messageEmailComposer');
    const subjectInput = document.getElementById('marketingEmailSubject');
    const bodyInput = document.getElementById('marketingEmailBody');
    const sendBtn = document.getElementById('sendMarketingEmailBtn');
    const cancelBtn = document.getElementById('cancelMarketingEmailBtn');
    const statusEl = document.getElementById('marketingEmailStatus');
    const blockBtn = document.getElementById('blockSelectedMessagesBtn');
    const countForBlockEl = document.getElementById('selectedMessagesCountForBlock');
    if (!selectAll || !deleteBtn) return;

    function selectedIds() {
      return checkboxes().filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));
    }

    function updateButtons() {
      const ids = selectedIds();
      countEl.textContent = ids.length;
      countForEmailEl.textContent = ids.length;
      countForBlockEl.textContent = ids.length;
      deleteBtn.style.display = ids.length > 0 ? 'inline-flex' : 'none';
      emailBtn.style.display = ids.length > 0 ? 'inline-flex' : 'none';
      blockBtn.style.display = ids.length > 0 ? 'inline-flex' : 'none';
      selectAll.checked = ids.length > 0 && ids.length === checkboxes().length;
      if (ids.length === 0) composer.classList.add('hidden');
    }

    selectAll.addEventListener('change', () => {
      checkboxes().forEach(cb => { cb.checked = selectAll.checked; });
      updateButtons();
    });

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('message-select-checkbox')) updateButtons();
    });

    let lastClickedIndex = null;
    document.addEventListener('click', (e) => {
      if (!e.target.classList.contains('message-select-checkbox')) return;
      const boxes = checkboxes();
      const currentIndex = boxes.indexOf(e.target);
      if (e.shiftKey && lastClickedIndex !== null) {
        const [start, end] = [lastClickedIndex, currentIndex].sort((a, b) => a - b);
        const shouldCheck = e.target.checked;
        for (let i = start; i <= end; i++) boxes[i].checked = shouldCheck;
        updateButtons();
      }
      lastClickedIndex = currentIndex;
    });

    deleteBtn.addEventListener('click', async () => {
      const ids = selectedIds();
      if (ids.length === 0) return;
      if (!confirm(`Delete ${ids.length} message${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting…';
      try {
        const res = await fetch('/admin/messages/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids })
        });
        if (!res.ok) throw new Error('Server returned an error');
        window.location.reload();
      } catch (err) {
        console.error('Bulk delete failed', err);
        alert('Could not delete the selected messages. Please try again.');
        deleteBtn.disabled = false;
        deleteBtn.textContent = `Delete selected (${ids.length})`;
      }
    });

    emailBtn.addEventListener('click', () => {
      composer.classList.remove('hidden');
      statusEl.textContent = '';
    });

    blockBtn.addEventListener('click', async () => {
      const ids = selectedIds();
      if (ids.length === 0) return;
      if (!confirm(`Block the sender${ids.length === 1 ? '' : 's'} of ${ids.length} selected message${ids.length === 1 ? '' : 's'}? You'll never see messages or emails from them again unless you unblock later.`)) return;

      blockBtn.disabled = true;
      blockBtn.textContent = 'Blocking…';
      try {
        const res = await fetch('/admin/messages/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids })
        });
        if (!res.ok) throw new Error('Server returned an error');
        window.location.reload();
      } catch (err) {
        console.error('Block failed', err);
        alert('Could not block the selected sender(s). Please try again.');
        blockBtn.disabled = false;
        blockBtn.textContent = `🚫 Block sender (${ids.length})`;
      }
    });

    cancelBtn.addEventListener('click', () => {
      composer.classList.add('hidden');
    });

    sendBtn.addEventListener('click', async () => {
      const ids = selectedIds();
      const subject = subjectInput.value.trim();
      const body = bodyInput.value.trim();

      if (ids.length === 0) return;
      if (!subject || !body) {
        statusEl.textContent = 'Please write both a subject and a message.';
        statusEl.style.color = 'var(--danger)';
        return;
      }
      if (!confirm(`Send this email to ${ids.length} recipient${ids.length === 1 ? '' : 's'}?`)) return;

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      statusEl.textContent = '';

      try {
        const res = await fetch('/admin/messages/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, subject, body })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');

        statusEl.style.color = '#2f5c30';
        statusEl.textContent = `✓ Sent to ${data.sent} of ${data.total}` + (data.failed ? ` (${data.failed} failed)` : '') + '.';
        subjectInput.value = '';
        bodyInput.value = '';
      } catch (err) {
        console.error('Marketing email failed', err);
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = err.message || 'Could not send the email. Please try again.';
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send email';
      }
    });
  })();

  // ---------- Bulk-publish pending Printify products ----------
  (function () {
    const selectAllPending = document.getElementById('selectAllPendingPrintify');
    const publishBtn = document.getElementById('bulkPublishPendingBtn');
    if (!selectAllPending || !publishBtn) return;

    const countEl = document.getElementById('bulkPublishCount');
    const statusEl = document.getElementById('bulkPublishStatus');
    const categorySelect = document.getElementById('bulkPublishCategory');
    const totalPendingCount = parseInt(selectAllPending.parentElement.textContent.match(/\d+/)[0], 10) || 0;

    function visibleCheckboxes() {
      return [...document.querySelectorAll('.pending-printify-checkbox')];
    }

    function updateButton() {
      if (selectAllPending.checked) {
        countEl.textContent = totalPendingCount;
        publishBtn.disabled = false;
        return;
      }
      const checked = visibleCheckboxes().filter(cb => cb.checked);
      countEl.textContent = checked.length;
      publishBtn.disabled = checked.length === 0;
    }

    selectAllPending.addEventListener('change', () => {
      visibleCheckboxes().forEach(cb => { cb.checked = selectAllPending.checked; });
      updateButton();
    });

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('pending-printify-checkbox')) {
        if (!e.target.checked) selectAllPending.checked = false;
        updateButton();
      }
    });

    publishBtn.addEventListener('click', async () => {
      const usingSelectAll = selectAllPending.checked;
      const ids = usingSelectAll ? [] : visibleCheckboxes().filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));
      const count = usingSelectAll ? totalPendingCount : ids.length;
      if (count === 0) return;

      const categoryId = categorySelect ? categorySelect.value : '';
      const categoryName = categorySelect && categoryId ? categorySelect.options[categorySelect.selectedIndex].text : 'no category';

      if (!confirm(`Publish ${count} product${count === 1 ? '' : 's'} with ${categoryName}? This makes them live on your "Our Store" page.`)) return;

      publishBtn.disabled = true;
      publishBtn.textContent = 'Publishing…';
      statusEl.textContent = '';

      try {
        const res = await fetch('/admin/store-products/bulk-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids: usingSelectAll ? undefined : ids,
            selectAllPending: usingSelectAll,
            categoryId: categoryId || null
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');

        statusEl.style.color = '#2f5c30';
        statusEl.textContent = `✓ Published ${data.published}. Reloading…`;
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        console.error('Bulk publish failed', err);
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = err.message || 'Could not publish. Please try again.';
        publishBtn.disabled = false;
        publishBtn.textContent = `Publish selected (${count})`;
      }
    });
  })();
})();
