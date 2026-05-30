/*
 * ETP Holdings Update - Custom View SPA (App 106)  [no-build prototype]
 *
 * Single uploadable file. Uses React 18 + htm via CDN globals (add these JS URLs
 * BEFORE this file in App 106 -> JavaScript and CSS Customization):
 *   https://unpkg.com/react@18/umd/react.production.min.js
 *   https://unpkg.com/react-dom@18/umd/react-dom.production.min.js
 *   https://unpkg.com/htm@3/dist/htm.umd.js
 * Pair with ETP_Holdings_Update_CustomView.css. Data via kintone.api (no bundle).
 *
 * Scope (first cut): read-only Record Details (with Fetch Next) + Session History.
 * App 23 is only READ here; nothing about App 23 is modified.
 */
(function () {
  'use strict';

  var THIS_APP = 106;
  var ST = { QUEUE: 'In Queue' };

  // App 106 field codes used by the views.
  var F = {
    id: '$id', a23id: 'app23_record_id', status: 'status', etpName: 'etp_name',
    identifier: 'identifier', issuer: 'issuer', portfolioType: 'portfolio_type',
    holdingsType: 'etp_holdings_type', holdingsUrl: 'holdings_url',
    inEdit: 'in_edit', order: 'order_seq', lastBy: 'last_updated_by', lastAt: 'last_updated_at',
    reviewDt: 'holding_review_dt',
    secTable: 'securities_table', s_cusip: 'sec_cusip', s_isin: 'sec_isin', s_symbol: 'sec_symbol',
    table: 'holdings_table', t_assetType: 'asset_type', t_underlying: 'underlying_asset',
    t_pct: 'breakdown_pct', t_asOf: 'as_of_date'
  };

  function api(path, method, params) { return kintone.api(kintone.api.url(path, true), method, params); }
  function val(rec, code) { return (rec && rec[code] && rec[code].value != null) ? rec[code].value : ''; }
  function firstSecVal(rec, code) {
    var t = rec && rec[F.secTable] && rec[F.secTable].value;
    if (t && t.length) { var c = t[0].value[code]; return (c && c.value) || ''; }
    return '';
  }
  function userName(rec, code) {
    var u = rec && rec[code] && rec[code].value;
    return (u && u.length) ? u.map(function (x) { return x.name; }).join(', ') : '';
  }
  function fmtDt(s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(); }
  function pct(v) { var n = parseFloat(v); return isNaN(n) ? '' : n + '%'; }

  function start() {
    var html = htm.bind(React.createElement);
    var useState = React.useState, useEffect = React.useEffect, useCallback = React.useCallback;

    // ---- API layer -------------------------------------------------------
    function fetchNextQueued() {
      var q = F.status + ' in ("' + ST.QUEUE + '") and ' + F.inEdit + ' in ("No") order by ' + F.order + ' asc limit 1';
      return api('/k/v1/records', 'GET', { app: THIS_APP, query: q }).then(function (r) { return r.records[0] || null; });
    }

    // ---- Field cell ------------------------------------------------------
    function Field(props) {
      return html`<div class=${'etp-field' + (props.wide ? ' span-2' : '')}>
        <span class="etp-field-label">${props.label}</span>
        <div class="etp-field-value">${props.children != null ? props.children : (props.value || '-')}</div>
      </div>`;
    }

    // ---- Record Details view --------------------------------------------
    function RecordDetails(props) {
      var rec = props.record;
      if (!rec) {
        return html`<div class="etp-card"><div class="etp-empty">No record loaded. Click <b>Fetch Next Record</b> to begin.</div></div>`;
      }
      var rows = (rec[F.table] && rec[F.table].value) || [];
      var url = val(rec, F.holdingsUrl);
      return html`<div class="etp-view">
        <div class="etp-card">
          <div class="etp-card-head">
            <h3 class="etp-card-title">${val(rec, F.etpName) || 'Record ' + val(rec, F.id)}</h3>
            <div class="etp-card-actions">
              <button class="etp-btn etp-btn-primary" disabled=${props.loading} onClick=${props.onFetchNext}>
                ${props.loading ? 'Loading...' : 'Fetch Next Record'}
              </button>
            </div>
          </div>
          <div class="etp-field-grid">
            <${Field} label="Primary Business Name" value=${val(rec, F.etpName)} />
            <${Field} label="Symbol" value=${val(rec, F.identifier) || firstSecVal(rec, F.s_symbol)} />
            <${Field} label="CUSIP" value=${firstSecVal(rec, F.s_cusip)} />
            <${Field} label="ISIN" value=${firstSecVal(rec, F.s_isin)} />
            <${Field} label="Portfolio Type" value=${val(rec, F.portfolioType)} />
            <${Field} label="Holdings Type" value=${val(rec, F.holdingsType)} />
            <${Field} label="Holdings URL" wide=${true}>
              ${url ? html`<a href=${url} target="_blank" rel="noopener">${url}</a>` : '-'}
            <//>
          </div>
        </div>

        <div class="etp-card">
          <div class="etp-card-head"><h3 class="etp-card-title">Holdings Breakdown</h3></div>
          ${rows.length ? html`<table class="etp-table">
            <thead><tr><th>Asset Breakdown</th><th>Underlying Cryptoasset</th><th class="num">Breakdown %</th><th>As of Date</th></tr></thead>
            <tbody>${rows.map(function (row, i) {
              var v = row.value;
              return html`<tr key=${i}>
                <td>${(v[F.t_assetType] && v[F.t_assetType].value) || '-'}</td>
                <td>${(v[F.t_underlying] && v[F.t_underlying].value) || '-'}</td>
                <td class="num">${pct(v[F.t_pct] && v[F.t_pct].value)}</td>
                <td>${fmtDt(v[F.t_asOf] && v[F.t_asOf].value)}</td>
              </tr>`;
            })}</tbody>
          </table>` : html`<div class="etp-empty">No holdings on this record.</div>`}
        </div>

        <div class="etp-card">
          <div class="etp-card-head"><h3 class="etp-card-title">Review Notes</h3></div>
          <textarea class="etp-notes" placeholder="Notes for this review... (prototype: not yet persisted - needs a backing field)"></textarea>
        </div>
      </div>`;
    }

    // ---- Session History view -------------------------------------------
    function SessionHistory(props) {
      var items = props.items || [];
      if (!items.length) return html`<div class="etp-card"><div class="etp-empty">No records reviewed this session yet.</div></div>`;
      return html`<div class="etp-view"><div class="etp-card">
        <div class="etp-card-head"><h3 class="etp-card-title">Updated this session</h3></div>
        <table class="etp-table">
          <thead><tr><th>Queue Type</th><th>Record ID</th><th>Primary Business Name</th><th>Holdings Type</th><th>Portfolio Type</th><th>Issuer</th><th>Review Date & Time</th><th>Updated By</th></tr></thead>
          <tbody>${items.map(function (rec, i) {
            return html`<tr key=${i}>
              <td><span class=${'etp-pill is-' + (val(rec, F.status).toLowerCase().indexOf('queue') > -1 ? 'queue' : 'assigned')}>${val(rec, F.status) || '-'}</span></td>
              <td>${val(rec, F.a23id) || val(rec, F.id)}</td>
              <td>${val(rec, F.etpName)}</td>
              <td>${val(rec, F.holdingsType)}</td>
              <td>${val(rec, F.portfolioType)}</td>
              <td>${val(rec, F.issuer)}</td>
              <td>${fmtDt(val(rec, F.reviewDt) || val(rec, F.lastAt))}</td>
              <td>${userName(rec, F.lastBy)}</td>
            </tr>`;
          })}</tbody>
        </table>
      </div></div>`;
    }

    // ---- Main app (view switching) --------------------------------------
    function App() {
      var s = useState('details'), view = s[0], setView = s[1];
      var r = useState(null), record = r[0], setRecord = r[1];
      var l = useState(false), loading = l[0], setLoading = l[1];
      var h = useState([]), history = h[0], setHistory = h[1];

      var onFetchNext = useCallback(function () {
        setLoading(true);
        fetchNextQueued().then(function (rec) {
          setLoading(false);
          if (!rec) { alert('No records left in the queue.'); return; }
          setRecord(rec);
          setHistory(function (prev) { return prev.concat([rec]); });
        }).catch(function (e) { setLoading(false); alert('Fetch failed: ' + (e && e.message || e)); });
      }, []);

      // expose the active view setter to the toolbar (mounted separately)
      useEffect(function () { window.__etpSetView = setView; return function () { window.__etpSetView = null; }; }, []);
      useEffect(function () { window.__etpView = view; }, [view]);

      return html`<div class="etp-app">
        ${view === 'details'
          ? html`<${RecordDetails} record=${record} loading=${loading} onFetchNext=${onFetchNext} />`
          : html`<${SessionHistory} items=${history} />`}
      </div>`;
    }

    // ---- Toolbar (separate React tree in the header space) ---------------
    function Toolbar() {
      var s = useState('details'), active = s[0], setActive = s[1];
      var go = function (v) { setActive(v); if (window.__etpSetView) window.__etpSetView(v); };
      return html`<div class="etp-bar">
        <button class=${'etp-tab' + (active === 'details' ? ' is-active' : '')} onClick=${function () { go('details'); }}>Record Details</button>
        <button class=${'etp-tab' + (active === 'history' ? ' is-active' : '')} onClick=${function () { go('history'); }}>Updated Records</button>
      </div>`;
    }

    // ---- Mount -----------------------------------------------------------
    var root = document.getElementById('etp-custom-app-root');
    if (root && !root.__etpMounted) { root.__etpMounted = true; ReactDOM.createRoot(root).render(html`<${App} />`); }

    var headSpace = kintone.app.getHeaderSpaceElement && kintone.app.getHeaderSpaceElement();
    if (headSpace && !headSpace.querySelector('.etp-bar')) {
      var tb = document.createElement('div');
      headSpace.appendChild(tb);
      ReactDOM.createRoot(tb).render(html`<${Toolbar} />`);
    }
  }

  // Wait for React / htm globals (added as CDN URLs in the customization settings).
  function ready() { return window.React && window.ReactDOM && window.htm; }
  kintone.events.on('app.record.index.show', function (event) {
    if (ready()) { start(); }
    else {
      var n = 0, t = setInterval(function () { if (ready() || ++n > 40) { clearInterval(t); if (ready()) start(); } }, 75);
    }
    return event;
  });
})();
