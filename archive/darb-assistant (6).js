(() => {
  'use strict';

  // --- Config -------------------------------------------------------------
  // Each user stores their own free key (aistudio.google.com/apikey) locally.
  const MODEL = 'gemini-3.5-flash';          // options: gemini-3.5-flash (default), gemini-3.1-pro (higher quality, slower/pricier), gemini-2.5-flash (fallback)
  const STORE_KEY = 'darbAiGeminiKey';
  const ALLOWED_GROUP = 'Research Admins';   // only members of this group see the button (match by group name or code)
  const ENDPOINT = (key) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  const PRESETS = [
    { label: 'Clean up', instr: 'Fix spelling, grammar, and punctuation only. Do not change meaning, facts, figures, or terminology. Return only the corrected text.' },
    { label: 'Formal',   instr: 'Rewrite in a neutral, formal regulatory tone for a compliance database. Keep all facts. Return only the rewritten text.' },
    { label: 'Bullets',  instr: 'Reformat into a plain-text list using hyphen bullets (one item per line, starting "- "). No markdown. Return only the list.' },
    { label: 'Holdings', instr: 'The input is a list of crypto holdings, given either as pasted text (often with each asset duplicated: name, name with ticker, then weight) or as an attached image of a holdings breakdown. Output one line per asset as "Name (TICKER) - weight%". Include an asset only where its name/ticker/weight is clearly legible; where a box shows only an icon and a percentage with no text label, write "UNVERIFIED (weight%)". Do NOT fabricate, estimate, or identify assets from logos or icons; if a value is absent, write "[missing]". Return only the list.' },
  ];

  const EVENTS = ['app.record.edit.show', 'app.record.create.show'];
  let currentImage = null; // { mimeType, data }

  kintone.events.on(EVENTS, async (event) => {
    if (document.getElementById('darb-ai-fab')) return event;
    if (!(await userInAllowedGroup())) return event;
    injectStyles();
    buildUI();
    return event;
  });

  // Returns true only if the logged-in user belongs to ALLOWED_GROUP.
  // Fails closed: if membership can't be confirmed, the button stays hidden.
  async function userInAllowedGroup() {
    try {
      const code = kintone.getLoginUser().code;
      const url = kintone.api.url('/v1/user/groups.json', true);
      const resp = await kintone.api(url, 'GET', { code });
      return (resp.groups || []).some((g) => g.name === ALLOWED_GROUP || g.code === ALLOWED_GROUP);
    } catch (e) {
      return false;
    }
  }

  // --- Styles -------------------------------------------------------------
  function injectStyles() {
    const css = `
      #darb-ai-fab { position: fixed; right: 24px; bottom: 24px; z-index: 9998;
        width: 48px; height: 48px; border-radius: 24px; cursor: pointer;
        background: #19a18d; color: #fff; border: none; font-size: 14px; font-weight: 600;
        box-shadow: 0 2px 8px rgba(0,0,0,.25); }
      #darb-ai-panel { position: fixed; right: 24px; bottom: 84px; z-index: 9999;
        width: 360px; max-height: 78vh; display: none; flex-direction: column;
        background: #fff; border: 1px solid #e3e7e8; border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,.18);
        font-family: 'Calibri','Segoe UI',sans-serif; font-size: 13px; color: #333; }
      #darb-ai-panel.open { display: flex; }
      #darb-ai-panel.expanded { right: auto; bottom: auto; left: 50%; top: 50%;
        transform: translate(-50%, -50%); width: min(860px, 92vw); height: 84vh; max-height: 84vh; }
      #darb-ai-panel.expanded .darb-ai-body { flex: 1; display: flex; flex-direction: column; }
      #darb-ai-panel.expanded #darb-ai-input { min-height: 130px; }
      #darb-ai-panel.expanded .darb-ai-out { flex: 1; display: flex; flex-direction: column; }
      #darb-ai-panel.expanded #darb-ai-output { flex: 1; }
      .darb-ai-head { padding: 10px 12px; font-weight: 600; border-bottom: 1px solid #eef1f2;
        display: flex; justify-content: space-between; align-items: center; }
      .darb-ai-head .tools span { cursor: pointer; color: #999; margin-left: 12px; font-size: 13px; }
      .darb-ai-body { padding: 12px; overflow-y: auto; }
      .darb-ai-body textarea { width: 100%; box-sizing: border-box; resize: vertical;
        border: 1px solid #e3e7e8; border-radius: 4px; padding: 8px; font-family: inherit; font-size: 13px;
        background: #fff !important; color: #333 !important; -webkit-text-fill-color: #333; }
      .darb-ai-presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
      .darb-ai-presets button { border: 1px solid #d6dbdc; background: #f7f9fa; border-radius: 4px;
        padding: 4px 9px; font-size: 12px; cursor: pointer; color: #333; }
      .darb-ai-presets button:hover { background: #eef1f2; }
      .darb-ai-attach { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 12px; color: #666; }
      .darb-ai-attach button { border: 1px dashed #c2cacb; background: #fff; border-radius: 4px;
        padding: 4px 9px; font-size: 12px; cursor: pointer; color: #555; }
      .darb-ai-row { display: flex; gap: 6px; margin-top: 6px; }
      .darb-ai-row input { flex: 1; border: 1px solid #e3e7e8; border-radius: 4px; padding: 6px 8px; font-family: inherit;
        background: #fff !important; color: #333 !important; -webkit-text-fill-color: #333; }
      .darb-ai-run { background: #19a18d; color: #fff; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
      .darb-ai-out { margin-top: 10px; }
      .darb-ai-out textarea { background: #fafbfc !important; }
      .darb-ai-copy { margin-top: 6px; background: #6b7a7e; color: #fff; border: none; border-radius: 4px;
        padding: 5px 12px; cursor: pointer; font-size: 12px; }
      .darb-ai-status { font-size: 12px; color: #888; margin-top: 6px; min-height: 14px; }
      .darb-ai-lbl { font-size: 10.5px; color: #999; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: .4px; }
      .darb-ai-keybox { padding: 14px 12px; font-size: 13px; }
      .darb-ai-keybox input { width: 100%; box-sizing: border-box; border: 1px solid #e3e7e8;
        border-radius: 4px; padding: 7px 8px; margin: 8px 0; font-family: inherit;
        background: #fff !important; color: #333 !important; -webkit-text-fill-color: #333; }
      .darb-ai-keybox a { color: #19a18d; }
      .darb-ai-keybox button { background: #19a18d; color: #fff; border: none; border-radius: 4px;
        padding: 6px 14px; cursor: pointer; }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // --- UI -----------------------------------------------------------------
  function buildUI() {
    const fab = document.createElement('button');
    fab.id = 'darb-ai-fab';
    fab.textContent = 'AI';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'darb-ai-panel';
    document.body.appendChild(panel);

    fab.onclick = () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) render(panel);
    };
    render(panel);
  }

  function render(panel) {
    getKey() ? renderAssistant(panel) : renderKeyEntry(panel);
  }

  function renderKeyEntry(panel) {
    panel.innerHTML = `
      <div class="darb-ai-head"><span>Profile assistant</span>
        <span class="darb-ai-x" style="cursor:pointer;color:#999;">&times;</span></div>
      <div class="darb-ai-keybox">
        <div>Paste your personal Gemini API key. It is stored only in this browser and is sent directly to Google - never to a shared server.</div>
        <input id="darb-ai-key" type="password" placeholder="AIza..." />
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a free key</a>
          <button id="darb-ai-savekey">Save</button>
        </div>
      </div>`;
    panel.querySelector('.darb-ai-x').onclick = () => panel.classList.remove('open');
    panel.querySelector('#darb-ai-savekey').onclick = () => {
      const v = panel.querySelector('#darb-ai-key').value.trim();
      if (v) { setKey(v); renderAssistant(panel); }
    };
  }

  function renderAssistant(panel) {
    panel.innerHTML = `
      <div class="darb-ai-head">
        <span>Profile assistant</span>
        <span class="tools"><span class="darb-ai-expand" title="Expand / shrink">&#10530;</span><span class="darb-ai-settings" title="Change or remove key">&#9881;</span><span class="darb-ai-x" title="Close">&times;</span></span>
      </div>
      <div class="darb-ai-body">
        <div class="darb-ai-lbl">Source text (leave empty for an image-only task)</div>
        <textarea id="darb-ai-input" rows="4" placeholder="Paste the text to transform... or just paste a screenshot anywhere in this panel"></textarea>
        <div class="darb-ai-attach">
          <button id="darb-ai-attachbtn">Attach image</button>
          <span id="darb-ai-imgname"></span>
          <input id="darb-ai-file" type="file" accept="image/*" style="display:none;" />
        </div>
        <div id="darb-ai-thumb"></div>
        <div class="darb-ai-lbl">Pick an action</div>
        <div class="darb-ai-presets"></div>
        <div class="darb-ai-row">
          <input id="darb-ai-custom" type="text" placeholder="...or type your own instruction here" />
          <button class="darb-ai-run">Run</button>
        </div>
        <div class="darb-ai-status"></div>
        <div class="darb-ai-out">
          <textarea id="darb-ai-output" rows="6" placeholder="Result appears here..." readonly></textarea>
          <button class="darb-ai-copy">Copy</button>
        </div>
      </div>`;

    const presetWrap = panel.querySelector('.darb-ai-presets');
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p.label;
      b.onclick = () => run(p.instr);
      presetWrap.appendChild(b);
    });

    panel.querySelector('.darb-ai-x').onclick = () => panel.classList.remove('open');
    panel.querySelector('.darb-ai-expand').onclick = () => panel.classList.toggle('expanded');
    panel.querySelector('.darb-ai-settings').onclick = () => {
      if (confirm('Remove the saved Gemini key from this browser? You will need to paste a key again to use the assistant.')) {
        clearKey();
        renderKeyEntry(panel);
      }
    };
    panel.querySelector('.darb-ai-run').onclick = () => {
      const c = panel.querySelector('#darb-ai-custom').value.trim();
      run(c || 'Fix spelling, grammar, and punctuation. Return only the corrected text.');
    };
    panel.querySelector('.darb-ai-copy').onclick = () => {
      const out = panel.querySelector('#darb-ai-output').value;
      if (out) navigator.clipboard.writeText(out);
      setStatus('Copied.');
    };

    const fileInput = panel.querySelector('#darb-ai-file');
    panel.querySelector('#darb-ai-attachbtn').onclick = () => fileInput.click();
    fileInput.onchange = (e) => { if (e.target.files[0]) loadImage(e.target.files[0]); };
    panel.addEventListener('paste', (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); loadImage(item.getAsFile()); }
    });
  }

  // --- Image handling -----------------------------------------------------
  function loadImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      currentImage = { mimeType: file.type || 'image/png', data: url.split(',')[1] };
      const tag = document.getElementById('darb-ai-imgname');
      if (tag) tag.innerHTML = `<span style="color:#19a18d;">image attached</span> <span style="cursor:pointer;color:#c33;" id="darb-ai-imgx">&times;</span>`;
      const thumb = document.getElementById('darb-ai-thumb');
      if (thumb) thumb.innerHTML = `<img src="${url}" style="max-width:100%;max-height:90px;border:1px solid #e3e7e8;border-radius:4px;margin:4px 0;" />`;
      const x = document.getElementById('darb-ai-imgx');
      if (x) x.onclick = () => { currentImage = null; tag.textContent = ''; if (thumb) thumb.innerHTML = ''; };
    };
    reader.readAsDataURL(file);
  }

  // --- Key store ----------------------------------------------------------
  function getKey() { return localStorage.getItem(STORE_KEY); }
  function setKey(v) { localStorage.setItem(STORE_KEY, v); }
  function clearKey() { localStorage.removeItem(STORE_KEY); }

  function setStatus(msg) {
    const el = document.querySelector('.darb-ai-status');
    if (el) el.textContent = msg;
  }

  // --- Call Gemini --------------------------------------------------------
  async function run(instruction) {
    const key = getKey();
    if (!key) { setStatus('Enter your key first.'); return; }
    const text = (document.getElementById('darb-ai-input') || {}).value?.trim() || '';
    if (!text && !currentImage) { setStatus('Add text or an image first.'); return; }
    setStatus('Working...');

    const parts = [{ text: instruction + (text ? `\n\n---\nTEXT:\n${text}` : '') }];
    if (currentImage) parts.push({ inlineData: currentImage });

    try {
      const res = await fetch(ENDPOINT(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2 } })
      });
      const data = await res.json();
      if (res.status === 429) {
        const retry = retrySeconds(data);
        setStatus(retry
          ? `Rate limit reached - wait about ${retry}s and try again.`
          : 'Rate limit reached - wait a moment and try again (daily cap resets at 08:00 UTC / 10:00 Paris).');
        return;
      }
      if (res.status === 400 || res.status === 404) {
        setStatus('Request rejected - check the API key or model name. (' + (data.error?.message || res.status) + ')');
        return;
      }
      if (data.error) { setStatus('Error: ' + (data.error.message || 'request rejected')); return; }
      const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      document.getElementById('darb-ai-output').value = out.trim();
      setStatus('Done.');
    } catch (e) {
      setStatus('Request failed - check your connection and try again.');
    }
  }

  // Pull a suggested wait time (seconds) out of a 429 response, if present.
  function retrySeconds(data) {
    try {
      const det = data.error?.details || [];
      const ri = det.find((d) => (d['@type'] || '').includes('RetryInfo'));
      const s = ri?.retryDelay && parseInt(ri.retryDelay, 10);
      return s && !isNaN(s) ? s : null;
    } catch (e) {
      return null;
    }
  }
})();
