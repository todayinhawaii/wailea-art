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
})();
