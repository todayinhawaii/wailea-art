(function () {
  const list = document.getElementById('sortableList');
  if (!list) return;

  const saveBtn = document.getElementById('saveOrderBtn');
  const statusEl = document.getElementById('orderSaveStatus');

  let draggedItem = null;
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
      draggedItem = item;
      setTimeout(() => item.classList.add('dragging'), 0);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedItem = null;
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
    const orderedIds = [...list.querySelectorAll('.sortable-item')].map(el => parseInt(el.dataset.id, 10));

    if (manual && saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
    }

    try {
      const res = await fetch('/admin/artworks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
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
})();
