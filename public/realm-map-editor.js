/* Minecraft Realm Map Editor: companion to a uNmINeD OpenLayers web export.
   Uses only OpenLayers bundled with the exported uNmINeD map.
   Edits remain in THIS browser until exported and deployed as annotations.json.
   URL ?edit=1 enables local authoring; this is NOT authentication. */
class RealmMapEditor {
  constructor(unmined, options = {}) {
    if (!unmined?.olMap || !unmined?.dataProjection || !unmined?.viewProjection || !window.ol) {
      throw new Error('Load this after the uNmINeD map has been initialized.');
    }
    this.unmined = unmined;
    this.map = unmined.olMap;
    this.editMode = new URLSearchParams(location.search).has('edit');
    this.storeKey = options.storeKey || 'realm-map-annotations-v1';
    this.publishedUrl = options.publishedUrl || './annotations.json';
    this.source = new ol.source.Vector({wrapX: false});
    this.layer = new ol.layer.Vector({source: this.source, style: (feature) => this.styleFor(feature)});
    this.map.addLayer(this.layer);
    this.activeTool = 'view';
    this.interaction = null;
    this.loading = true;
    this.source.on('addfeature', () => this.saveDraft());
    this.source.on('removefeature', () => this.saveDraft());
    this.source.on('changefeature', () => this.saveDraft());
    if (this.editMode) this.setupToolbar();
    this.map.on('singleclick', (evt) => {
      if (this.activeTool !== 'delete') return;
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => layer === this.layer ? f : undefined, {hitTolerance: 8});
      if (feature && window.confirm(`Delete ${feature.get('name') || 'this item'}?`)) this.source.removeFeature(feature);
    });
    this.loadAnnotations();
  }
  coordToMap(xz) {
    return ol.proj.transform(xz, this.unmined.dataProjection, this.unmined.viewProjection);
  }
  coordToWorld(xy) {
    return ol.proj.transform(xy, this.unmined.viewProjection, this.unmined.dataProjection);
  }
  styleFor(feature) {
    const kind = feature.get('kind') || 'marker';
    const name = feature.get('name') || '';
    const raw = feature.get('color') || '#f59e0b';
    const color = /^#[a-f\d]{6}$/i.test(raw) ? raw : '#f59e0b';
    return new ol.style.Style({
      fill: new ol.style.Fill({color: color + '32'}),
      stroke: new ol.style.Stroke({color, width: kind === 'route' ? 4 : 2.5}),
      image: new ol.style.Circle({radius: 7, fill: new ol.style.Fill({color}), stroke: new ol.style.Stroke({color: '#ffffff', width: 2})}),
      text: new ol.style.Text({text: name, font: 'bold 12px sans-serif', offsetY: kind === 'marker' ? -16 : 0,
        fill: new ol.style.Fill({color: '#ffffff'}), stroke: new ol.style.Stroke({color: '#17212b', width: 4}), overflow: true})
    });
  }
  setupToolbar() {
    const css = document.createElement('style');
    css.textContent = `
      #realm-map-toolbar {position:fixed;z-index:10000;top:12px;right:12px;background:#17212bef;color:#fff;
        padding:12px;border-radius:12px;max-width:290px;box-shadow:0 8px 24px #0007;font:13px system-ui,sans-serif}
      #realm-map-toolbar .realm-map-row {display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}
      #realm-map-toolbar button {border:1px solid #657181;border-radius:6px;background:#273545;color:white;padding:7px 9px;cursor:pointer}
      #realm-map-toolbar button[aria-pressed="true"] {background:#167ba2;border-color:#56c2ed}
      #realm-map-toolbar input[type=color] {width:38px;height:32px;vertical-align:middle;background:transparent;border:0;cursor:pointer}
      #realm-map-toolbar small {display:block;color:#cad7e0;line-height:1.4}
      @media(max-width:520px){#realm-map-toolbar {top:auto;bottom:10px;right:10px;left:10px;max-width:none}}
    `;
    document.head.appendChild(css);
    const pane = document.createElement('aside');
    pane.id = 'realm-map-toolbar';
    pane.innerHTML = `
      <strong>Realm Map Editor</strong>
      <div class="realm-map-row">
        <button type="button" data-tool="view">Browse</button>
        <button type="button" data-tool="marker">Marker</button>
        <button type="button" data-tool="territory">Boundary</button>
        <button type="button" data-tool="route">Road / Path</button>
        <button type="button" data-tool="edit">Move / Edit</button>
        <button type="button" data-tool="delete">Delete</button>
      </div>
      <label>New item colour <input id="realm-map-color" type="color" value="#f59e0b"></label>
      <div class="realm-map-row">
        <button type="button" data-action="export">Export JSON</button>
        <button type="button" data-action="import">Import JSON</button>
        <button type="button" data-action="reset">Reset draft</button>
      </div>
      <input id="realm-map-file" type="file" accept=".json,application/json" hidden>
      <small>Double-click to finish polygons/paths. Edits save in this browser; Export JSON and publish the file to share.</small>
    `;
    document.body.appendChild(pane);
    pane.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      if (b.dataset.action === 'export') this.exportFile();
      if (b.dataset.action === 'import') pane.querySelector('#realm-map-file').click();
      if (b.dataset.action === 'reset') this.resetDraft();
    });
    pane.querySelector('#realm-map-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed.features)) throw new Error('Invalid annotation file');
        this.setAnnotations(parsed.features);
        this.saveDraft();
      } catch (err) { alert('Could not import: ' + err.message); }
      e.target.value = '';
    });
    this.setTool('view');
  }
  setTool(tool) {
    this.activeTool = tool;
    if (this.interaction) this.map.removeInteraction(this.interaction);
    this.interaction = null;
    document.querySelectorAll('#realm-map-toolbar button[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    if (tool === 'edit') {
      this.interaction = new ol.interaction.Modify({source: this.source});
    } else if (['marker', 'territory', 'route'].includes(tool)) {
      const type = {marker: 'Point', territory: 'Polygon', route: 'LineString'}[tool];
      this.interaction = new ol.interaction.Draw({source: this.source, type});
      this.interaction.on('drawend', ({feature}) => {
        const proposed = {marker:'Marker',territory:'Territory',route:'Path'}[tool];
        const name = window.prompt('Name this ' + proposed.toLowerCase() + ':', proposed);
        if (name === null) { setTimeout(() => this.source.removeFeature(feature), 0); return; }
        feature.setProperties({kind: tool, name: name.trim() || proposed, color: document.getElementById('realm-map-color').value});
      });
    }
    if (this.interaction) this.map.addInteraction(this.interaction);
  }
  getAnnotations() {
    return this.source.getFeatures().map(f => {
      const geom = f.getGeometry().clone().transform(this.unmined.viewProjection, this.unmined.dataProjection);
      return {kind: f.get('kind'), name: f.get('name'), color: f.get('color'), coordinates: geom.getCoordinates()};
    });
  }
  setAnnotations(items) {
    this.loading = true;
    this.source.clear();
    for (const entry of items) {
      if (!entry || !['marker', 'territory', 'route'].includes(entry.kind) || typeof entry.name !== 'string' || !Array.isArray(entry.coordinates)) continue;
      try {
        const geom = entry.kind === 'marker' ? new ol.geom.Point(entry.coordinates)
          : entry.kind === 'territory' ? new ol.geom.Polygon(entry.coordinates) : new ol.geom.LineString(entry.coordinates);
        geom.transform(this.unmined.dataProjection, this.unmined.viewProjection);
        const f = new ol.Feature({geometry: geom});
        f.setProperties({kind: entry.kind, name: entry.name.slice(0, 160), color: entry.color});
        this.source.addFeature(f);
      } catch (e) { console.warn('Skipped invalid annotation:', e); }
    }
    this.loading = false;
  }
  saveDraft() {
    if (this.loading || !this.editMode) return;
    try { localStorage.setItem(this.storeKey, JSON.stringify({version: 1, features: this.getAnnotations()})); }
    catch (e) { console.warn('Could not save local annotation draft:', e); }
  }
  async loadAnnotations() {
    let published = {features: []};
    try {
      const res = await fetch(this.publishedUrl, {cache: 'no-store'});
      if (res.ok) published = await res.json();
    } catch (e) { console.info('No published annotations yet.'); }
    let data = published;
    if (this.editMode) {
      try { data = JSON.parse(localStorage.getItem(this.storeKey)) || published; }
      catch (e) { data = published; }
    }
    this.setAnnotations(Array.isArray(data.features) ? data.features : []);
  }
  exportFile() {
    const json = JSON.stringify({version: 1, features: this.getAnnotations()}, null, 2);
    const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'annotations.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async resetDraft() {
    if (!confirm('Discard local changes and reload the published annotations?')) return;
    localStorage.removeItem(this.storeKey);
    await this.loadAnnotations();
  }
}
window.RealmMapEditor = RealmMapEditor;
