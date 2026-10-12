/* Minecraft Realm Map Editor v2 — companion to a uNmINeD OpenLayers web export.
   Can load version 1 JSON/drafts. Stores edits in this browser until Export JSON.
   ?edit=1 is NOT authentication and does NOT write to your hosted website. */
class RealmMapEditor {
  constructor(unmined, options = {}) {
    if (!unmined?.olMap || !unmined?.dataProjection || !unmined?.viewProjection || !window.ol) {
      throw new Error('Initialize RealmMapEditor after uNmINeD and OpenLayers have loaded.');
    }
    this.unmined = unmined;
    this.map = unmined.olMap;
    this.editMode = new URLSearchParams(window.location.search).has('edit');
    // Keep the original key so annotations already created with v1 remain available.
    this.storeKey = options.storeKey || 'realm-map-annotations-v1';
    this.publishedUrl = options.publishedUrl || './annotations.json';
    this.loading = true;
    this.activeTool = 'view';
    this.interaction = null;
    this.selectedFeature = null;
    this.showAllLabels = true;
    try { this.showAllLabels = window.localStorage.getItem('realm-map-show-labels-v2') !== 'false'; } catch (_) {}

    this.source = new ol.source.Vector({wrapX: false});
    this.layer = new ol.layer.Vector({source: this.source, style: feature => this.styleFor(feature)});
    this.map.addLayer(this.layer);
    for (const evt of ['addfeature', 'removefeature', 'changefeature']) {
      this.source.on(evt, () => this.saveDraft());
    }
    this.installStyles();
    this.setupUi();
    if (this.editMode) this.setupToolbar();
    this.map.on('singleclick', evt => this.onMapClick(evt));
    this.loadAnnotations();
  }

  coordToWorld(xy) {
    return ol.proj.transform(xy, this.unmined.viewProjection, this.unmined.dataProjection);
  }

  styleFor(feature) {
    const kind = feature.get('kind') || 'marker';
    const name = feature.get('name') || '';
    const color = this.safeColor(feature.get('color'));
    const showText = this.showAllLabels && feature.get('showLabel') !== false;
    return new ol.style.Style({
      fill: new ol.style.Fill({color: color + '35'}),
      stroke: new ol.style.Stroke({color, width: kind === 'route' ? 4 : 2.5}),
      image: new ol.style.Circle({
        radius: 7, fill: new ol.style.Fill({color}),
        stroke: new ol.style.Stroke({color: '#ffffff', width: 2})
      }),
      text: showText ? new ol.style.Text({
        text: name, font: 'bold 12px system-ui,sans-serif',
        offsetY: kind === 'marker' ? -16 : 0,
        fill: new ol.style.Fill({color: '#ffffff'}),
        stroke: new ol.style.Stroke({color: '#17212b', width: 4}), overflow: true
      }) : undefined
    });
  }

  safeColor(color) {
    return typeof color === 'string' && /^#[a-f\d]{6}$/i.test(color) ? color : '#f59e0b';
  }

  installStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #realm-map-toolbar, #realm-map-profile, #realm-map-label-control {
        box-sizing:border-box;position:fixed;z-index:10000;font:13px system-ui,Arial,sans-serif;
        background:#17212bf2;color:#fff;box-shadow:0 8px 24px #0007;border-radius:12px
      }
      #realm-map-toolbar {top:12px;right:12px;padding:12px;width:296px;max-height:46vh;overflow-y:auto}
      #realm-map-toolbar .realm-map-row {display:flex;flex-wrap:wrap;gap:5px;margin:9px 0}
      #realm-map-toolbar button,#realm-map-profile button,#realm-map-label-control {
        border:1px solid #667485;border-radius:6px;background:#273545;color:white;padding:7px 9px;cursor:pointer
      }
      #realm-map-toolbar button[aria-pressed="true"] {background:#166e92;border-color:#67c6ee}
      #realm-map-toolbar input[type=color] {width:36px;height:30px;vertical-align:middle;border:0;cursor:pointer;background:transparent}
      #realm-map-toolbar small {color:#c7d5df;line-height:1.35;display:block}
      #realm-map-toolbar label {cursor:pointer}
      #realm-map-label-control {top:12px;right:12px;padding:9px 12px}
      #realm-map-profile {top:12px;left:60px;width:min(350px,calc(100vw - 75px));max-height:calc(100vh - 24px);overflow-y:auto;padding:16px}
      #realm-map-profile[hidden] {display:none}
      #realm-map-profile .realm-map-profile-heading {display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
      #realm-map-profile h3 {font-size:17px;margin:0;line-height:1.3;overflow-wrap:anywhere}
      #realm-map-profile h4 {font-size:13px;margin:0 0 3px}
      #realm-map-profile .realm-map-muted {color:#c4d1db;font-size:12px;line-height:1.45}
      #realm-map-profile .realm-map-description {white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0;line-height:1.5}
      #realm-map-profile label.realm-map-field {display:flex;flex-direction:column;gap:4px;margin:9px 0}
      #realm-map-profile input[type=text],#realm-map-profile textarea {box-sizing:border-box;display:block;width:100%;color:#17212b;background:white;
        border:1px solid #99a8b2;border-radius:5px;padding:8px;font:13px system-ui,Arial,sans-serif}
      #realm-map-profile textarea {resize:vertical;min-height:90px}
      #realm-map-profile button.realm-map-close {padding:3px 8px;font-size:17px}
      #realm-map-profile .realm-map-property {margin:9px 0}
      #realm-map-profile input[type=color] {height:32px;width:50px;cursor:pointer}
      #realm-map-profile input[type=checkbox] {accent-color:#45beff}
      @media (max-width: 720px) {
        #realm-map-toolbar {top:auto;bottom:8px;right:8px;width:min(296px,calc(100vw - 16px));max-height:41vh}
        #realm-map-profile {top:8px;left:44px;width:min(340px,calc(100vw - 54px));max-height:47vh}
      }
    `;
    document.head.appendChild(style);
  }

  setupUi() {
    const profile = document.createElement('section');
    profile.id = 'realm-map-profile';
    profile.setAttribute('aria-label', 'Kingdom or location profile');
    profile.hidden = true;
    document.body.appendChild(profile);
    this.profile = profile;

    if (!this.editMode) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'realm-map-label-control';
      button.addEventListener('click', () => this.setLabels(!this.showAllLabels));
      document.body.appendChild(button);
      this.labelButton = button;
      this.updateLabelButton();
    }
  }

  setupToolbar() {
    const pane = document.createElement('aside');
    pane.id = 'realm-map-toolbar';
    pane.innerHTML = `
      <strong>Realm Map Editor</strong>
      <div class="realm-map-row">
        <button type="button" data-tool="view">Browse / Details</button>
        <button type="button" data-tool="marker">Marker</button>
        <button type="button" data-tool="territory">Boundary</button>
        <button type="button" data-tool="route">Road / Path</button>
        <button type="button" data-tool="edit">Move / Edit Shape</button>
        <button type="button" data-tool="delete">Delete</button>
      </div>
      <label>New item colour <input id="realm-map-color" type="color" value="#f59e0b"></label>
      <div class="realm-map-row">
        <button type="button" data-action="labels">Hide all labels</button>
        <button type="button" data-action="export">Export JSON</button>
        <button type="button" data-action="import">Import JSON</button>
        <button type="button" data-action="reset">Reset draft</button>
      </div>
      <input id="realm-map-file" type="file" accept=".json,application/json" hidden>
      <small>Click an existing boundary or marker in Browse / Details to rename it, add a description, or hide its label. Double-click to finish drawing. Export JSON to publish changes.</small>
    `;
    document.body.appendChild(pane);
    this.toolbar = pane;
    this.labelButton = pane.querySelector('[data-action="labels"]');
    this.updateLabelButton();
    pane.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      switch (b.dataset.action) {
        case 'labels': this.setLabels(!this.showAllLabels); break;
        case 'export': this.exportFile(); break;
        case 'import': pane.querySelector('#realm-map-file').click(); break;
        case 'reset': this.resetDraft(); break;
      }
    });
    pane.querySelector('#realm-map-file').addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed.features)) throw new Error('Missing features array');
        if (!window.confirm('Replace your current draft with the imported annotations?')) return;
        this.setAnnotations(parsed.features);
        this.saveDraft();
      } catch (err) { window.alert('Could not import JSON: ' + err.message); }
      finally { e.target.value = ''; }
    });
    this.setTool('view');
  }

  updateLabelButton() {
    if (this.labelButton) this.labelButton.textContent = this.showAllLabels ? 'Hide all labels' : 'Show all labels';
  }

  setLabels(value) {
    this.showAllLabels = Boolean(value);
    try { localStorage.setItem('realm-map-show-labels-v2', String(this.showAllLabels)); } catch (_) {}
    this.source.changed();
    this.updateLabelButton();
  }

  setTool(tool) {
    this.activeTool = tool;
    if (this.interaction) this.map.removeInteraction(this.interaction);
    this.interaction = null;
    this.closeProfile();
    document.querySelectorAll('#realm-map-toolbar button[data-tool]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    });
    if (tool === 'edit') {
      this.interaction = new ol.interaction.Modify({source: this.source});
    } else if (['marker', 'territory', 'route'].includes(tool)) {
      const type = {marker: 'Point', territory: 'Polygon', route: 'LineString'}[tool];
      this.interaction = new ol.interaction.Draw({source: this.source, type});
      this.interaction.on('drawend', ({feature}) => {
        const fallback = {marker: 'Marker', territory: 'Territory', route: 'Path'}[tool];
        const name = window.prompt('Name this ' + fallback.toLowerCase() + ':', fallback);
        if (name === null) {
          // The feature is added to the source after drawend fires.
          setTimeout(() => this.source.removeFeature(feature), 0);
          return;
        }
        feature.setProperties({
          kind: tool, name: name.trim() || fallback,
          owner: '', description: '', showLabel: true,
          color: document.getElementById('realm-map-color').value
        });
      });
    }
    if (this.interaction) this.map.addInteraction(this.interaction);
  }

  onMapClick(evt) {
    if (this.editMode && ['marker', 'territory', 'route', 'edit'].includes(this.activeTool)) return;
    const feature = this.map.forEachFeatureAtPixel(
      evt.pixel, (f, layer) => layer === this.layer ? f : undefined, {hitTolerance: 8}
    );
    if (this.activeTool === 'delete' && this.editMode) {
      if (feature && window.confirm(`Delete ${feature.get('name') || 'this item'}?`)) {
        if (this.selectedFeature === feature) this.closeProfile();
        this.source.removeFeature(feature);
      }
      return;
    }
    if (feature) this.openProfile(feature);
    else this.closeProfile();
  }

  closeProfile() {
    this.selectedFeature = null;
    if (this.profile) {
      this.profile.hidden = true;
      this.profile.replaceChildren();
    }
  }

  element(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  openProfile(feature) {
    this.selectedFeature = feature;
    const profile = this.profile;
    profile.replaceChildren();
    profile.hidden = false;
    const name = String(feature.get('name') || 'Unnamed');
    const kind = {marker: 'Location', territory: 'Kingdom / Territory', route: 'Road / Path'}[feature.get('kind')] || 'Place';
    const header = this.element('div', undefined, 'realm-map-profile-heading');
    header.appendChild(this.element('h3', name));
    const close = this.element('button', '×', 'realm-map-close');
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close profile');
    close.addEventListener('click', () => this.closeProfile());
    header.appendChild(close);
    profile.appendChild(header);
    profile.appendChild(this.element('div', kind, 'realm-map-muted'));

    const center = ol.extent.getCenter(feature.getGeometry().getExtent());
    const world = this.coordToWorld(center);
    const x = Math.round(world[0]), z = Math.round(world[1]);
    profile.appendChild(this.element('div', `Approximate centre: X ${x}, Z ${z}`, 'realm-map-muted'));

    if (!this.editMode) {
      const owner = feature.get('owner') || '';
      if (owner) profile.appendChild(this.element('div', `Ruler / Owner: ${owner}`, 'realm-map-property'));
      const description = feature.get('description') || '';
      if (description) profile.appendChild(this.element('p', description, 'realm-map-description'));
      else profile.appendChild(this.element('p', 'No description added yet.', 'realm-map-muted'));
      return;
    }

    const field = (title, value, limit, onInput) => {
      const label = this.element('label', undefined, 'realm-map-field');
      label.appendChild(this.element('span', title));
      const input = this.element('input');
      input.type = 'text';
      input.value = value || '';
      input.maxLength = limit;
      input.addEventListener('input', () => {
        if (this.selectedFeature === feature) onInput(input.value);
      });
      label.appendChild(input);
      profile.appendChild(label);
      return input;
    };
    field('Name', name, 160, value => {
      feature.set('name', value);
      header.querySelector('h3').textContent = value || 'Unnamed';
    });
    field('Ruler / Owner / Faction (optional)', feature.get('owner') || '', 160, value => feature.set('owner', value));

    const descLabel = this.element('label', undefined, 'realm-map-field');
    descLabel.appendChild(this.element('span', 'Description / Profile'));
    const textarea = this.element('textarea');
    textarea.value = feature.get('description') || '';
    textarea.maxLength = 4000;
    textarea.rows = 6;
    textarea.placeholder = 'A short history, ruler, capital, alliances, or anything else you want visitors to know.';
    textarea.addEventListener('input', () => {
      if (this.selectedFeature === feature) feature.set('description', textarea.value);
    });
    descLabel.appendChild(textarea);
    profile.appendChild(descLabel);

    const colorLabel = this.element('label', undefined, 'realm-map-field');
    colorLabel.appendChild(this.element('span', 'Boundary / Marker Colour'));
    const color = this.element('input');
    color.type = 'color';
    color.value = this.safeColor(feature.get('color'));
    color.addEventListener('input', () => feature.set('color', color.value));
    colorLabel.appendChild(color);
    profile.appendChild(colorLabel);

    const labelLine = this.element('label');
    const showLabel = this.element('input');
    showLabel.type = 'checkbox';
    showLabel.checked = feature.get('showLabel') !== false;
    showLabel.addEventListener('change', () => feature.set('showLabel', showLabel.checked));
    labelLine.append(showLabel, document.createTextNode(' Show this name on the map'));
    profile.appendChild(labelLine);
    profile.appendChild(this.element('p', 'Changes are saved to this browser automatically. Export JSON to publish them.', 'realm-map-muted'));
  }

  getAnnotations() {
    return this.source.getFeatures().map(f => {
      const geom = f.getGeometry().clone().transform(this.unmined.viewProjection, this.unmined.dataProjection);
      return {
        kind: f.get('kind') || 'marker',
        name: String(f.get('name') || ''),
        owner: String(f.get('owner') || ''),
        description: String(f.get('description') || ''),
        showLabel: f.get('showLabel') !== false,
        color: this.safeColor(f.get('color')),
        coordinates: geom.getCoordinates()
      };
    });
  }

  setAnnotations(items) {
    this.loading = true;
    this.closeProfile();
    this.source.clear();
    for (const entry of items) {
      if (!entry || !['marker', 'territory', 'route'].includes(entry.kind) ||
          typeof entry.name !== 'string' || !Array.isArray(entry.coordinates)) continue;
      try {
        const geom = entry.kind === 'marker' ? new ol.geom.Point(entry.coordinates)
          : entry.kind === 'territory' ? new ol.geom.Polygon(entry.coordinates)
          : new ol.geom.LineString(entry.coordinates);
        geom.transform(this.unmined.dataProjection, this.unmined.viewProjection);
        const feature = new ol.Feature({geometry: geom});
        feature.setProperties({
          kind: entry.kind,
          name: entry.name.slice(0, 160),
          owner: typeof entry.owner === 'string' ? entry.owner.slice(0, 160) : '',
          description: typeof entry.description === 'string' ? entry.description.slice(0, 4000) : '',
          showLabel: entry.showLabel !== false,
          color: this.safeColor(entry.color)
        });
        this.source.addFeature(feature);
      } catch (e) { console.warn('Skipped invalid annotation:', e); }
    }
    this.loading = false;
  }

  saveDraft() {
    if (this.loading || !this.editMode) return;
    try {
      window.localStorage.setItem(this.storeKey, JSON.stringify({version: 2, features: this.getAnnotations()}));
    } catch (e) { console.warn('Could not save local draft:', e); }
  }

  async loadAnnotations() {
    let published = {features: []};
    try {
      const res = await fetch(this.publishedUrl, {cache: 'no-store'});
      if (res.ok) published = await res.json();
    } catch (_) { console.info('No published annotations yet.'); }
    let data = published;
    if (this.editMode) {
      try { data = JSON.parse(window.localStorage.getItem(this.storeKey)) || published; }
      catch (_) { data = published; }
    }
    this.setAnnotations(Array.isArray(data.features) ? data.features : []);
  }

  exportFile() {
    const json = JSON.stringify({version: 2, features: this.getAnnotations()}, null, 2);
    const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'annotations.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async resetDraft() {
    if (!window.confirm('Discard browser edits and reload the published annotations.json?')) return;
    window.localStorage.removeItem(this.storeKey);
    await this.loadAnnotations();
  }
}
window.RealmMapEditor = RealmMapEditor;
