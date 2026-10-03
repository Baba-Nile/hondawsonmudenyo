/* Programme detail drawer + borehole register.
   Static content: the programme data is embedded in projects.html (#project-data).
   Fields without information are left out rather than invented. */
(function () {
  var dlg = document.getElementById('pdrawer'), raw = document.getElementById('project-data');
  if (!dlg || !raw || typeof dlg.showModal !== 'function') return;
  var D = JSON.parse(raw.textContent), body = document.getElementById('pd-body'), cat = document.getElementById('pd-cat'), opener = null;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var row = function (k, v) { return v ? '<div class="row"><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>' : ''; };

  function render(p) {
    var h = '';
    if (p.photos.length) h += '<figure class="photo"><img src="' + p.photos[0].src + '" alt="' + esc(p.photos[0].alt) + '" style="object-position:' + p.photos[0].pos + '"></figure>';
    h += '<h2 id="pd-name">' + esc(p.name) + '</h2>';
    if (p.figs.length) h += '<div class="figs">' + p.figs.map(function (f) { return '<div><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></div>'; }).join('') + '</div>';
    h += '<dl>' + row('What it does', p.does) + row('Who it serves', p.who) + row('Current scale', p.scale);
    if (p.areas && p.areas.length) h += row('Programme areas', p.areas.map(function (a) { return a[1] ? a[0] + ' (' + a[1].toLowerCase() + ')' : a[0]; }).join('; '));
    h += row('Category', p.cat) + row('Status', p.stage) + '</dl>';
    if (p.photos.length > 1) h += '<div class="gal">' + p.photos.slice(1).map(function (x) { return '<figure><div class="photo"><img src="' + x.src + '" alt="' + esc(x.alt) + '" loading="lazy" style="object-position:' + x.pos + '"></div><figcaption>' + esc(x.cap) + '</figcaption></figure>'; }).join('') + '</div>';
    h += '<p class="more-soon">Further details will be added as they are confirmed.</p>';
    h += '<button type="button" class="btn btn--primary" data-cx data-close>Raise a related topic</button>';
    return h;
  }
  function open(id, from) {
    var p = D[id]; if (!p) return;
    opener = from || null;
    cat.textContent = p.cat;
    body.innerHTML = render(p);
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('lock');
    dlg.scrollTop = 0;
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-project]');
    if (c) { e.preventDefault(); open(c.dataset.project, c); return; }
    if (e.target.closest('[data-close]') && dlg.open) dlg.close();
    else if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', function () {
    document.body.classList.remove('lock');
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (opener && opener.focus) opener.focus();
  });
  var hs = location.hash.slice(1);
  if (hs && D[hs] && !document.getElementById(hs)) open(hs);

  /* Borehole register. Add confirmed boreholes here; the table appears automatically.
     Each entry: { location: "", site: "School or community", status: "", year: "" } */
  var BOREHOLES = [];
  var reg = document.getElementById('bh-register');
  if (reg && BOREHOLES.length) {
    reg.innerHTML = '<table><thead><tr><th>Location</th><th>School / community</th><th>Status</th><th>Year</th></tr></thead><tbody>' +
      BOREHOLES.map(function (b) { return '<tr><td>' + esc(b.location || '') + '</td><td>' + esc(b.site || '') + '</td><td>' + esc(b.status || '') + '</td><td>' + esc(b.year || '') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
})();
