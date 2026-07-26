(function () {
  const BULK_MIN_QTY = 10;

  const modal = document.getElementById('buyModal');
  const closeBtn = document.getElementById('closeModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalDimensions = document.getElementById('modalDimensions');
  const modeToggle = document.getElementById('modeToggle');
  const packagingGroup = document.getElementById('packagingGroup');
  const packagingToggle = document.getElementById('packagingToggle');
  const qtyInput = document.getElementById('qtyInput');
  const qtyHint = document.getElementById('qtyHint');
  const orderTotal = document.getElementById('orderTotal');
  const modalError = document.getElementById('modalError');
  const checkoutBtn = document.getElementById('checkoutBtn');

  let current = null; // { id, title, retail, bulkPkg, bulkNoPkg }
  let mode = 'retail';
  let packaging = true;

  function fmt(n) { return '$' + n.toFixed(2); }

  function unitPrice() {
    if (!current) return 0;
    if (mode === 'retail') return current.retail;
    return packaging ? current.bulkPkg : current.bulkNoPkg;
  }

  function recalc() {
    let qty = parseInt(qtyInput.value, 10) || 0;
    if (mode === 'bulk' && qty < BULK_MIN_QTY) {
      qtyHint.textContent = `Bulk pricing requires a minimum of ${BULK_MIN_QTY} pieces.`;
    } else {
      qtyHint.textContent = '';
    }
    const total = unitPrice() * Math.max(qty, 0);
    orderTotal.textContent = fmt(isNaN(total) ? 0 : total);
  }

  function openModal(data) {
    current = data;
    mode = 'retail';
    packaging = true;
    qtyInput.value = 1;
    modalError.classList.add('hidden');

    modalTitle.textContent = data.title;
    modalDimensions.textContent = data.dimensions || '';
    [...modeToggle.children].forEach(b => b.classList.toggle('active', b.dataset.mode === 'retail'));
    [...packagingToggle.children].forEach(b => b.classList.toggle('active', b.dataset.packaging === '1'));
    packagingGroup.classList.add('hidden');

    recalc();
    modal.classList.add('open');
  }

  function closeModal() {
    modal.classList.remove('open');
    current = null;
  }

  document.querySelectorAll('.js-open-buy').forEach(btn => {
    btn.addEventListener('click', () => {
      openModal({
        id: btn.dataset.id,
        title: btn.dataset.title,
        dimensions: btn.dataset.dimensions,
        retail: parseFloat(btn.dataset.retail),
        bulkPkg: parseFloat(btn.dataset.bulkPkg),
        bulkNoPkg: parseFloat(btn.dataset.bulkNopkg)
      });
    });
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  modeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    mode = btn.dataset.mode;
    [...modeToggle.children].forEach(b => b.classList.toggle('active', b === btn));
    packagingGroup.classList.toggle('hidden', mode !== 'bulk');
    if (mode === 'bulk' && (parseInt(qtyInput.value, 10) || 0) < BULK_MIN_QTY) {
      qtyInput.value = BULK_MIN_QTY;
    }
    recalc();
  });

  packagingToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    packaging = btn.dataset.packaging === '1';
    [...packagingToggle.children].forEach(b => b.classList.toggle('active', b === btn));
    recalc();
  });

  qtyInput.addEventListener('input', recalc);

  checkoutBtn.addEventListener('click', async () => {
    if (!current) return;
    const qty = parseInt(qtyInput.value, 10) || 0;

    if (mode === 'bulk' && qty < BULK_MIN_QTY) {
      modalError.textContent = `Bulk orders require a minimum of ${BULK_MIN_QTY} pieces.`;
      modalError.classList.remove('hidden');
      return;
    }
    if (qty < 1) {
      modalError.textContent = 'Please enter a valid quantity.';
      modalError.classList.remove('hidden');
      return;
    }

    modalError.classList.add('hidden');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Redirecting…';

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworkId: current.id,
          mode,
          packaging,
          quantity: qty
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      window.location.href = data.url;
    } catch (err) {
      modalError.textContent = err.message;
      modalError.classList.remove('hidden');
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Checkout with Stripe';
    }
  });
})();
