(function () {
  // ---------- Gallery card carousels ----------
  document.querySelectorAll('.card-img[data-multi]').forEach(carousel => {
    const slides = [...carousel.querySelectorAll('.carousel-slide')];
    const dots = [...carousel.querySelectorAll('.carousel-dot')];
    let current = 0;

    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle('active', i === current));
      dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
    }

    const prevBtn = carousel.querySelector('.carousel-arrow-prev');
    const nextBtn = carousel.querySelector('.carousel-arrow-next');

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); show(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); show(current + 1); });

    dots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        show(parseInt(dot.dataset.index, 10));
      });
    });
  });

  // ---------- Click-to-enlarge lightbox ----------
  // Shows the same original, full-resolution image file just larger on
  // screen — never a stretched-up thumbnail, so it stays crisp.
  (function () {
    const overlay = document.getElementById('lightboxOverlay');
    if (!overlay) return;

    const imageEl = document.getElementById('lightboxImage');
    const closeBtn = document.getElementById('lightboxClose');
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');

    let images = [];
    let index = 0;

    function render() {
      imageEl.src = images[index];
      const showNav = images.length > 1;
      prevBtn.style.display = showNav ? 'flex' : 'none';
      nextBtn.style.display = showNav ? 'flex' : 'none';
    }

    function open(imgList, startIndex) {
      images = imgList;
      index = startIndex;
      render();
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    function step(delta) {
      index = (index + delta + images.length) % images.length;
      render();
    }

    document.querySelectorAll('.card-img').forEach(card => {
      card.addEventListener('click', () => {
        const slides = [...card.querySelectorAll('.carousel-slide')];
        const srcs = slides.length ? slides.map(s => s.src) : [card.querySelector('img').src];
        const activeIndex = Math.max(0, slides.findIndex(s => s.classList.contains('active')));
        open(srcs, activeIndex);
      });
    });

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); step(1); });

    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });
  })();

  (function () {
  if (!document.getElementById('buyModal')) return;

  const BULK_MIN_QTY = 10;

  const modal = document.getElementById('buyModal');
  const closeBtn = document.getElementById('closeModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalDimensions = document.getElementById('modalDimensions');
  const modeToggle = document.getElementById('modeToggle');
  const packagingGroup = document.getElementById('packagingGroup');
  const packagingToggle = document.getElementById('packagingToggle');
  const packagingNote = document.getElementById('packagingNote');
  const qtyInput = document.getElementById('qtyInput');
  const qtyHint = document.getElementById('qtyHint');
  const orderTotal = document.getElementById('orderTotal');
  const modalError = document.getElementById('modalError');
  const checkoutBtn = document.getElementById('checkoutBtn');

  let current = null; // { id, title, retail, bulkPkg, bulkNoPkg }
  let mode = 'retail';
  let packaging = true;

  function fmt(n) { return '$' + n.toFixed(2); }
  function formatUnit(n) { return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); }

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
    modalDimensions.textContent = [data.dimensions, data.material].filter(Boolean).join(' · ');
    [...modeToggle.children].forEach(b => b.classList.toggle('active', b.dataset.mode === 'retail'));
    [...packagingToggle.children].forEach(b => b.classList.toggle('active', b.dataset.packaging === '1'));
    packagingGroup.classList.add('hidden');

    const pkgTotal = (data.bulkPkg * BULK_MIN_QTY).toFixed(2);
    const nopkgTotal = (data.bulkNoPkg * BULK_MIN_QTY).toFixed(2);
    packagingNote.textContent = `${BULK_MIN_QTY}x${formatUnit(data.bulkPkg)} = $${pkgTotal}. Packaging includes a protective plastic sleeve, support backing, and a white card envelope. Choosing "no packaging" reduces the price — ${BULK_MIN_QTY}x${formatUnit(data.bulkNoPkg)} = $${nopkgTotal} — but ships each individual print unprotected, although we group them together in a safe protective box.`;

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
        material: btn.dataset.material,
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

  // ---------- Store buy modal (simpler: just quantity, no retail/bulk toggle) ----------
  (function () {
    const storeModal = document.getElementById('storeBuyModal');
    if (!storeModal) return;

    const storeCloseBtn = document.getElementById('storeCloseModal');
    const storeModalTitle = document.getElementById('storeModalTitle');
    const storeQtyInput = document.getElementById('storeQtyInput');
    const storeOrderTotal = document.getElementById('storeOrderTotal');
    const storeModalError = document.getElementById('storeModalError');
    const storeCheckoutBtn = document.getElementById('storeCheckoutBtn');

    let storeCurrent = null;

    function storeRecalc() {
      const qty = parseInt(storeQtyInput.value, 10) || 0;
      const total = storeCurrent ? storeCurrent.price * Math.max(qty, 0) : 0;
      storeOrderTotal.textContent = '$' + total.toFixed(2);
    }

    function storeOpenModal(data) {
      storeCurrent = data;
      storeQtyInput.value = 1;
      storeModalError.classList.add('hidden');
      storeModalTitle.textContent = data.title;
      storeRecalc();
      storeModal.classList.add('open');
    }

    function storeCloseModal() {
      storeModal.classList.remove('open');
      storeCurrent = null;
    }

    document.querySelectorAll('.js-open-store-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        storeOpenModal({
          id: btn.dataset.id,
          title: btn.dataset.title,
          price: parseFloat(btn.dataset.price)
        });
      });
    });

    storeCloseBtn.addEventListener('click', storeCloseModal);
    storeModal.addEventListener('click', (e) => { if (e.target === storeModal) storeCloseModal(); });
    storeQtyInput.addEventListener('input', storeRecalc);

    storeCheckoutBtn.addEventListener('click', async () => {
      if (!storeCurrent) return;
      const qty = parseInt(storeQtyInput.value, 10) || 0;

      if (qty < 1) {
        storeModalError.textContent = 'Please enter a valid quantity.';
        storeModalError.classList.remove('hidden');
        return;
      }

      storeModalError.classList.add('hidden');
      storeCheckoutBtn.disabled = true;
      storeCheckoutBtn.textContent = 'Redirecting…';

      try {
        const res = await fetch('/api/store-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: storeCurrent.id,
            quantity: qty
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        window.location.href = data.url;
      } catch (err) {
        storeModalError.textContent = err.message;
        storeModalError.classList.remove('hidden');
        storeCheckoutBtn.disabled = false;
        storeCheckoutBtn.textContent = 'Checkout with Stripe';
      }
    });
  })();
})();
