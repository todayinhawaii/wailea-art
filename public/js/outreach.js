(function () {
  document.querySelectorAll('.outreach-lead').forEach(card => {
    const id = card.dataset.id;
    const subjectInput = card.querySelector('.draft-subject-input');
    const bodyInput = card.querySelector('.draft-body-input');
    const statusEl = card.querySelector('.draft-status');
    const generateBtn = card.querySelector('.generate-draft-btn');
    const saveBtn = card.querySelector('.save-draft-btn');
    const sendBtn = card.querySelector('.send-outreach-btn');

    function setStatus(text, isError) {
      statusEl.textContent = text;
      statusEl.style.color = isError ? 'var(--danger)' : '#2f5c30';
    }

    if (generateBtn) {
      generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating…';
        setStatus('', false);
        try {
          const res = await fetch(`/admin/outreach/${id}/generate-draft`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
          subjectInput.value = data.subject;
          bodyInput.value = data.body;
          setStatus('✓ Draft generated. Review before sending.', false);
        } catch (err) {
          setStatus(err.message || 'Could not generate a draft.', true);
        } finally {
          generateBtn.disabled = false;
          generateBtn.textContent = '✨ Generate draft';
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          const formData = new URLSearchParams();
          formData.set('subject', subjectInput.value);
          formData.set('body', bodyInput.value);
          const res = await fetch(`/admin/outreach/${id}/save-draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
          });
          if (!res.ok) throw new Error('Could not save.');
          setStatus('✓ Draft saved.', false);
        } catch (err) {
          setStatus(err.message || 'Could not save the draft.', true);
        } finally {
          saveBtn.disabled = false;
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        if (!subjectInput.value.trim() || !bodyInput.value.trim()) {
          setStatus('Write or generate a draft before sending.', true);
          return;
        }
        if (!confirm('Send this email now? This goes out for real.')) return;

        // Save the current draft text first, in case they edited it since
        // the last save, so what gets sent always matches what's on screen.
        const formData = new URLSearchParams();
        formData.set('subject', subjectInput.value);
        formData.set('body', bodyInput.value);
        await fetch(`/admin/outreach/${id}/save-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });

        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        try {
          const res = await fetch(`/admin/outreach/${id}/send`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
          setStatus('✓ Sent!', false);
          setTimeout(() => window.location.reload(), 900);
        } catch (err) {
          setStatus(err.message || 'Could not send.', true);
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send email';
        }
      });
    }
  });
})();
