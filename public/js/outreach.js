(function () {
  const sidebar = document.getElementById('outreachSidebar');
  const editor = document.getElementById('outreachEditor');
  if (!sidebar || !editor) return; // empty-state page, nothing to wire up

  const dataEl = document.getElementById('leadsData');
  const leads = JSON.parse(dataEl.textContent);
  const leadsById = {};
  leads.forEach(l => { leadsById[l.id] = l; });

  const previewFrame = document.getElementById('outreachPreviewFrame');
  const openPreviewTab = document.getElementById('openPreviewTab');
  const anthropicConfigured = window.ANTHROPIC_CONFIGURED;

  let activeId = leads[0].id;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderEditor(lead) {
    editor.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <span class="checkbox-pill" style="cursor:default; font-weight:bold;">${escapeHtml(lead.priority || '—')}</span>
          <strong style="margin-left:8px;">${escapeHtml(lead.business_name)}</strong>
          <span style="color:var(--ink-soft); font-size:0.85rem;"> — ${escapeHtml(lead.location)}</span>
        </div>
        <span class="checkbox-pill" style="cursor:default;">status: ${escapeHtml(lead.status)}</span>
      </div>
      <p style="font-size:0.85rem; color:var(--ink-soft); margin:8px 0;">
        ${escapeHtml(lead.business_type)}${lead.contact_name ? ' &middot; Contact: ' + escapeHtml(lead.contact_name) : ''}
        ${lead.website ? ` &middot; <a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener">Website</a>` : ''}
      </p>
      <p style="font-size:0.85rem; color:var(--ink-soft); margin:0 0 8px;">${escapeHtml(lead.why_fit)}</p>
      ${!lead.email ? `<p style="font-size:0.82rem; background:#f0eee8; padding:8px 10px; border-radius:4px;">No direct email on file. ${escapeHtml(lead.notes)}</p>` : ''}
      <div class="draft-area" style="margin-top:10px;">
        <div class="field-group" style="margin-bottom:6px;">
          <label>Subject</label>
          <input type="text" id="draftSubjectInput" value="${escapeHtml(lead.draft_subject || '')}" placeholder="Generate a draft, or write your own">
        </div>
        <div class="field-group" style="margin-bottom:6px;">
          <label>Body</label>
          <textarea id="draftBodyInput" rows="6" placeholder="Generate a draft, or write your own">${escapeHtml(lead.draft_body || '')}</textarea>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${anthropicConfigured ? `<button class="btn btn-secondary btn-sm" id="generateDraftBtn" type="button">✨ Generate draft</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="saveDraftBtn" type="button">Save draft</button>
          ${lead.email ? `<button class="btn btn-primary btn-sm" id="sendOutreachBtn" type="button">Send email</button>` : ''}
          ${lead.status === 'sent' ? `<button class="btn btn-secondary btn-sm" id="markRepliedBtn" type="button">Mark as replied</button>` : ''}
          <button class="btn btn-sm" id="deleteLeadBtn" type="button" style="background:var(--danger); color:#fff;">Delete</button>
          <span id="draftStatusMsg" style="font-size:0.82rem;"></span>
        </div>
      </div>
    `;

    wireEditorButtons(lead);
  }

  function updatePreview(leadId) {
    const url = `/admin/outreach/${leadId}/preview`;
    previewFrame.src = url;
    openPreviewTab.href = url;
  }

  function selectLead(id) {
    activeId = id;
    const lead = leadsById[id];
    renderEditor(lead);
    updatePreview(id);

    document.querySelectorAll('.outreach-sidebar-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.id, 10) === id);
    });
  }

  sidebar.addEventListener('click', (e) => {
    const item = e.target.closest('.outreach-sidebar-item');
    if (!item) return;
    selectLead(parseInt(item.dataset.id, 10));
  });

  function wireEditorButtons(lead) {
    const subjectInput = document.getElementById('draftSubjectInput');
    const bodyInput = document.getElementById('draftBodyInput');
    const statusEl = document.getElementById('draftStatusMsg');
    const generateBtn = document.getElementById('generateDraftBtn');
    const saveBtn = document.getElementById('saveDraftBtn');
    const sendBtn = document.getElementById('sendOutreachBtn');
    const markRepliedBtn = document.getElementById('markRepliedBtn');
    const deleteBtn = document.getElementById('deleteLeadBtn');

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
          const res = await fetch(`/admin/outreach/${lead.id}/generate-draft`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
          subjectInput.value = data.subject;
          bodyInput.value = data.body;
          lead.draft_subject = data.subject;
          lead.draft_body = data.body;
          lead.status = 'drafted';
          updatePreview(lead.id);
          setStatus('✓ Draft generated. Review, then Preview or Send.', false);
        } catch (err) {
          setStatus(err.message || 'Could not generate a draft.', true);
        } finally {
          generateBtn.disabled = false;
          generateBtn.textContent = '✨ Generate draft';
        }
      });
    }

    async function saveDraft() {
      const formData = new URLSearchParams();
      formData.set('subject', subjectInput.value);
      formData.set('body', bodyInput.value);
      await fetch(`/admin/outreach/${lead.id}/save-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      lead.draft_subject = subjectInput.value;
      lead.draft_body = bodyInput.value;
      lead.status = 'drafted';
    }

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        await saveDraft();
        updatePreview(lead.id);
        setStatus('✓ Draft saved.', false);
      } catch (err) {
        setStatus('Could not save the draft.', true);
      } finally {
        saveBtn.disabled = false;
      }
    });

    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        if (!subjectInput.value.trim() || !bodyInput.value.trim()) {
          setStatus('Write or generate a draft before sending.', true);
          return;
        }
        if (!confirm('Send this email now? This goes out for real.')) return;

        await saveDraft();

        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        try {
          const res = await fetch(`/admin/outreach/${lead.id}/send`, { method: 'POST' });
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

    if (markRepliedBtn) {
      markRepliedBtn.addEventListener('click', () => {
        fetch(`/admin/outreach/${lead.id}/mark-replied`, { method: 'POST' }).then(() => window.location.reload());
      });
    }

    deleteBtn.addEventListener('click', () => {
      if (!confirm('Delete this lead? This cannot be undone.')) return;
      fetch(`/admin/outreach/${lead.id}/delete`, { method: 'POST' }).then(() => window.location.reload());
    });
  }

  // Show the first lead immediately — the template is visible the moment
  // this page loads, no extra click required.
  selectLead(activeId);
})();
