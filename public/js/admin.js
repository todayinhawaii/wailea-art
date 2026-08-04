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
})();
