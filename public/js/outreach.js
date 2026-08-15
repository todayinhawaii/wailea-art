(function () {
  const sidebar = document.getElementById('outreachSidebar');
  const editor = document.getElementById('outreachEditor');
  const previewFrame = document.getElementById('outreachPreviewFrame');
  if (!sidebar || !editor || !previewFrame) return;

  const contactsData = JSON.parse(document.getElementById('contactsData').textContent);
  const defaultTemplate = JSON.parse(document.getElementById('defaultTemplateData').textContent);
  const contactsById = {};
  contactsData.forEach(c => { contactsById[c.id] = c; });

  const anthropicConfigured = window.ANTHROPIC_CONFIGURED;
  let previewDebounce = null;
  let quill = null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Old saved contacts (from before the rich text editor existed) have
  // last_body stored as plain text with \n line breaks, not HTML. Detect
  // that case and convert it to simple paragraphs so it loads into the
  // editor correctly either way.
  function toEditorHtml(content) {
    if (!content) return '';
    if (/<(p|br|div|h[1-6]|strong|em|a)\b/i.test(content)) return content; // already HTML
    return content
      .split(/\n\s*\n/)
      .map(para => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function getBodyHtml() {
    return quill ? quill.root.innerHTML : '';
  }

  function setBodyHtml(html) {
    if (!quill) return;
    quill.setText('');
    quill.clipboard.dangerouslyPasteHTML(html || '');
  }

  async function updatePreview(bodyHtml) {
    try {
      const res = await fetch('/admin/outreach/render-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'body=' + encodeURIComponent(bodyHtml || '')
      });
      const html = await res.text();
      previewFrame.srcdoc = html;
    } catch (e) {
      // Preview is a nice-to-have; a failed refresh shouldn't block anything else.
    }
  }

  function renderEditor(contact) {
    const isNew = !contact;
    const email = isNew ? '' : contact.email;
    const label = isNew ? '' : contact.label;
    const subject = isNew ? (defaultTemplate.subject || '') : (contact.last_subject || '');
    const bodyHtml = isNew ? toEditorHtml(defaultTemplate.body || '') : toEditorHtml(contact.last_body || '');
    const replies = (!isNew && contact.replies) ? contact.replies : [];

    const repliesHtml = replies.length > 0 ? `
      <div style="margin-bottom:16px; border:1px solid var(--sand-line); border-radius:var(--radius); overflow:hidden;">
        <div style="background:#fdf6e3; padding:8px 12px; font-size:0.82rem; font-weight:bold; border-bottom:1px solid #e8d9a8;">
          📥 ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'} from ${escapeHtml(email)}
        </div>
        ${replies.map(r => `
          <div style="padding:12px; border-bottom:1px solid var(--sand-line);">
            <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:4px;">${r.received_at ? new Date(r.received_at).toLocaleString() : ''}</div>
            <div style="font-size:0.85rem; font-weight:bold; margin-bottom:4px;">${escapeHtml(r.subject)}</div>
            <div style="font-size:0.85rem; white-space:pre-wrap; margin-bottom:8px; max-height:150px; overflow-y:auto;">${escapeHtml(r.body)}</div>
            <button class="btn btn-secondary btn-sm reply-to-msg-btn" type="button" data-message-id="${escapeHtml(r.message_id || '')}" data-subject="${escapeHtml(r.subject)}">↩ Reply to this</button>
          </div>
        `).join('')}
      </div>
    ` : '';

    editor.innerHTML = `
      ${repliesHtml}
      <div class="field-group" style="margin-bottom:10px;">
        <label>To</label>
        <input type="email" id="toInput" value="${escapeHtml(email)}" placeholder="name@example.com">
      </div>
      <div class="field-group" style="margin-bottom:10px;">
        <label>Name / business (optional, helps AI personalize)</label>
        <input type="text" id="labelInput" value="${escapeHtml(label)}" placeholder="e.g. Lahaina Galleries">
      </div>
      <div class="field-group" style="margin-bottom:10px;">
        <label>Subject</label>
        <input type="text" id="draftSubjectInput" value="${escapeHtml(subject)}" placeholder="Click Generate below, or write your own">
      </div>
      <input type="hidden" id="inReplyToInput" value="">

      <div style="margin:14px 0;">
        ${anthropicConfigured ? `<button class="btn btn-primary btn-block" id="generateDraftBtn" type="button" style="font-size:0.95rem; padding:12px;">✨ Generate email with AI</button>` : `<p style="font-size:0.85rem; color:var(--ink-soft);">AI drafting isn't connected yet — write the email below by hand.</p>`}
      </div>

      <div class="field-group" style="margin-bottom:10px;">
        <label>Message</label>
        <p style="font-size:0.76rem; color:var(--ink-soft); margin:0 0 6px;">Type a link like www.wailea.art and it becomes clickable automatically when sent.</p>
        <div id="draftBodyEditor" style="background:#fff; min-height:160px;"></div>
      </div>

      <div style="margin:14px 0 6px;">
        <button class="btn btn-primary btn-block" id="sendOutreachBtn" type="button" style="font-size:0.95rem; padding:12px; background:var(--ocean-dark, #536b58);">Send email</button>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; flex-wrap:wrap; gap:8px;">
        <span id="draftStatusMsg" style="font-size:0.82rem;">${!isNew ? `Sent ${contact.times_sent}x to this address so far.` : ''}</span>
        <div style="display:flex; gap:8px;">
          ${!isNew ? `<button class="btn btn-secondary btn-sm" id="saveContactBtn" type="button">Save changes</button>
          <button class="btn btn-sm" id="deleteContactBtn" type="button" style="background:var(--danger); color:#fff;">Delete contact</button>` : ''}
        </div>
      </div>
    `;

    quill = new Quill('#draftBodyEditor', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [false, 2, 3] }],
          ['bold', 'italic', 'underline'],
          [{ color: [] }],
          ['link'],
          ['clean']
        ]
      }
    });
    if (bodyHtml) setBodyHtml(bodyHtml);

    wireEditorButtons(contact);
    updatePreview(getBodyHtml());
  }

  function selectContact(id) {
    document.querySelectorAll('.outreach-sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === String(id));
    });
    if (id === 'new') {
      renderEditor(null);
    } else {
      renderEditor(contactsById[id]);
    }
  }

  sidebar.addEventListener('click', (e) => {
    const item = e.target.closest('.outreach-sidebar-item');
    if (!item) return;
    selectContact(item.dataset.id === 'new' ? 'new' : parseInt(item.dataset.id, 10));
  });

  function wireEditorButtons(contact) {
    const toInput = document.getElementById('toInput');
    const labelInput = document.getElementById('labelInput');
    const subjectInput = document.getElementById('draftSubjectInput');
    const inReplyToInput = document.getElementById('inReplyToInput');
    const statusEl = document.getElementById('draftStatusMsg');
    const generateBtn = document.getElementById('generateDraftBtn');
    const sendBtn = document.getElementById('sendOutreachBtn');
    const saveBtn = document.getElementById('saveContactBtn');
    const deleteBtn = document.getElementById('deleteContactBtn');

    function setStatus(text, isError) {
      statusEl.textContent = text;
      statusEl.style.color = isError ? 'var(--danger)' : '#2f5c30';
    }

    document.querySelectorAll('.reply-to-msg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        inReplyToInput.value = btn.dataset.messageId || '';
        const origSubject = btn.dataset.subject || '';
        subjectInput.value = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`;
        setBodyHtml('');
        quill.focus();
        setStatus('Replying to this message — write your response below.', false);
        updatePreview('');
      });
    });

    // Live-update the preview as they type, debounced so it doesn't hammer the server.
    quill.on('text-change', () => {
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(() => updatePreview(getBodyHtml()), 400);
    });

    if (generateBtn) {
      generateBtn.addEventListener('click', async () => {
        if (!toInput.value.trim()) {
          setStatus('Enter an email address first.', true);
          return;
        }
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating…';
        setStatus('', false);
        try {
          const res = await fetch('/admin/outreach/generate-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `email=${encodeURIComponent(toInput.value)}&label=${encodeURIComponent(labelInput.value)}`
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
          subjectInput.value = data.subject;
          setBodyHtml(data.body);
          updatePreview(data.body);
          setStatus('✓ Draft generated. Review, then Send.', false);
        } catch (err) {
          setStatus(err.message || 'Could not generate a draft.', true);
        } finally {
          generateBtn.disabled = false;
          generateBtn.textContent = '✨ Generate email with AI';
        }
      });
    }

    sendBtn.addEventListener('click', async () => {
      const bodyHtml = getBodyHtml();
      const bodyIsEmpty = quill.getText().trim().length === 0;

      if (!toInput.value.trim()) {
        setStatus('Enter an email address first.', true);
        return;
      }
      if (!subjectInput.value.trim() || bodyIsEmpty) {
        setStatus('Write or generate a message before sending.', true);
        return;
      }
      if (!confirm(`Send this email to ${toInput.value}? This goes out for real.`)) return;

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/admin/outreach/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `email=${encodeURIComponent(toInput.value)}&label=${encodeURIComponent(labelInput.value)}&subject=${encodeURIComponent(subjectInput.value)}&body=${encodeURIComponent(bodyHtml)}&inReplyTo=${encodeURIComponent(inReplyToInput.value)}`
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        setStatus(`✓ Sent! (${data.timesSent}x total to this address). Reloading…`, false);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        setStatus(err.message || 'Could not send.', true);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send email';
      }
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          const res = await fetch(`/admin/outreach/contacts/${contact.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `email=${encodeURIComponent(toInput.value)}&label=${encodeURIComponent(labelInput.value)}`
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
          setStatus('✓ Contact updated.', false);
        } catch (err) {
          setStatus(err.message || 'Could not save changes.', true);
        }
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this saved contact? This cannot be undone.')) return;
        await fetch(`/admin/outreach/contacts/${contact.id}/delete`, { method: 'POST' });
        window.location.reload();
      });
    }
  }

  const checkRepliesBtn = document.getElementById('checkRepliesBtn');
  const checkRepliesStatus = document.getElementById('checkRepliesStatus');
  if (checkRepliesBtn) {
    checkRepliesBtn.addEventListener('click', async () => {
      checkRepliesBtn.disabled = true;
      checkRepliesBtn.textContent = 'Checking…';
      checkRepliesStatus.textContent = '';
      try {
        const res = await fetch('/admin/outreach/check-replies', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        if (data.newReplies > 0) {
          checkRepliesStatus.style.color = '#2f5c30';
          checkRepliesStatus.textContent = `✓ Found ${data.newReplies} new repl${data.newReplies === 1 ? 'y' : 'ies'}! Reloading…`;
          setTimeout(() => window.location.reload(), 1000);
        } else {
          checkRepliesStatus.style.color = 'var(--ink-soft)';
          checkRepliesStatus.textContent = 'No new replies right now.';
          checkRepliesBtn.disabled = false;
          checkRepliesBtn.textContent = '📥 Check for replies';
        }
      } catch (err) {
        checkRepliesStatus.style.color = 'var(--danger)';
        checkRepliesStatus.textContent = err.message || 'Could not check for replies.';
        checkRepliesBtn.disabled = false;
        checkRepliesBtn.textContent = '📥 Check for replies';
      }
    });
  }

  // Show the compose form immediately — the template is visible the moment
  // this page loads, no extra click required.
  selectContact('new');
})();
