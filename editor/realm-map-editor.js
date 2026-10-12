/* Minecraft Kingdom Atlas Editor v3 — companion to a uNmINeD OpenLayers web export.
   Can load version 1/2 JSON/drafts. Stores edits in this browser until Export JSON.
   ?edit=1 is NOT authentication and does NOT write to your hosted website. */
class RealmMapEditor {
  constructor(unmined, options = {}) {
    if (
      !unmined?.olMap ||
      !unmined?.dataProjection ||
      !unmined?.viewProjection ||
      !window.ol
    ) {
      throw new Error(
        "Initialize RealmMapEditor after uNmINeD and OpenLayers have loaded.",
      );
    }
    this.unmined = unmined;
    this.map = unmined.olMap;
    this.editMode =
      new URLSearchParams(window.location.search).get("edit") === "1";
    // Keep the original key so annotations already created with v1 remain available.
    this.storeKey = options.storeKey || "realm-map-annotations-v1";
    this.publishedUrl = options.publishedUrl || "./annotations.json";
    this.loading = true;
    this.originalGeometry = new WeakMap();
    this.history = [];
    this.future = [];
    this.document = AtlasData.migrate({ features: [] });
    this.activeTool = "view";
    this.interaction = null;
    this.selectedFeature = null;
    this.showAllLabels = false;
    this.browseAnnotationsVisible = false;
    try {
      this.showAllLabels =
        window.localStorage.getItem("realm-map-show-labels-v3") === "true";
      this.browseAnnotationsVisible =
        window.localStorage.getItem("realm-map-show-annotations-v3") === "true";
    } catch (_) {}

    this.source = new ol.source.Vector({ wrapX: false });
    this.layer = new ol.layer.Vector({
      source: this.source,
      style: (feature) => this.styleFor(feature),
    });
    this.showAnnotations = this.editMode || this.browseAnnotationsVisible;
    this.layer.setVisible(this.showAnnotations);
    this.map.addLayer(this.layer);
    for (const evt of ["addfeature", "removefeature", "changefeature"]) {
      this.source.on(evt, () => this.saveDraft());
    }
    this.installStyles();
    this.setupUi();
    if (this.editMode) this.setupToolbar();
    this.map.on("singleclick", (evt) => this.onMapClick(evt));
    this.setupDirectory();
    this.constrainMapView();
    this.map.on("change:size", () => this.constrainMapView());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.setTool("view");
        return;
      }
      if (
        this.editMode &&
        (e.ctrlKey || e.metaKey) &&
        !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) &&
        ["z", "y"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        this.restoreHistory(e.key.toLowerCase() === "y" || e.shiftKey);
      }
    });
    this.loadAnnotations();
  }

  coordToWorld(xy) {
    return ol.proj.transform(
      xy,
      this.unmined.viewProjection,
      this.unmined.dataProjection,
    );
  }

  styleFor(feature) {
    const kind = feature.get("kind") || "marker";
    const name = feature.get("name") || "";
    const color = this.safeColor(feature.get("color"));
    if (this.document.settings.layers[feature.get("layer")] === false)
      return null;
    const showText =
      this.showAllLabels &&
      (this.map.getView().getZoom() >= 2 || feature === this.selectedFeature) &&
      feature.get("showLabel") !== false;
    const hasIcon =
      kind === "marker" &&
      (feature.get("category") !== "custom" || feature.get("icon"));
    return new ol.style.Style({
      fill: new ol.style.Fill({ color: color + "35" }),
      stroke: new ol.style.Stroke({
        color,
        width: kind === "route" ? 4 : 2.5,
        lineDash:
          kind === "route"
            ? { railway: [8, 4], "boat route": [2, 6] }[feature.get("category")]
            : undefined,
      }),
      image:
        feature.get("kind") === "marker" && feature.get("category") !== "custom"
          ? new ol.style.RegularShape({
              points: 4,
              radius: 9,
              angle: Math.PI / 4,
              fill: new ol.style.Fill({ color }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 2 }),
            })
          : new ol.style.Circle({
              radius: 7,
              fill: new ol.style.Fill({ color }),
              stroke: new ol.style.Stroke({ color: "#ffffff", width: 2 }),
            }),
      text:
        showText || hasIcon
          ? new ol.style.Text({
              text:
                (hasIcon
                  ? (feature.get("icon") ||
                      AtlasData.categories[feature.get("category")] ||
                      "📍") + " "
                  : "") + (showText ? name : ""),
              font: "bold 12px system-ui,sans-serif",
              offsetY: kind === "marker" ? -16 : 0,
              fill: new ol.style.Fill({ color: "#ffffff" }),
              stroke: new ol.style.Stroke({ color: "#17212b", width: 4 }),
              overflow: true,
            })
          : undefined,
    });
  }

  safeColor(color) {
    return typeof color === "string" && /^#[a-f\d]{6}$/i.test(color)
      ? color
      : "#f59e0b";
  }

  installStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #realm-map-toolbar, #realm-map-profile, #realm-map-label-control {
        box-sizing:border-box;position:fixed;z-index:10000;font:13px system-ui,Arial,sans-serif;
        background:#17212bf2;color:#fff;box-shadow:0 8px 24px #0007;border-radius:12px
      }
      #realm-map-toolbar {top:64px;right:12px;padding:12px;width:296px;max-height:46vh;overflow-y:auto}
      #realm-map-toolbar .realm-map-row {display:flex;flex-wrap:wrap;gap:5px;margin:9px 0}
      #realm-map-toolbar button,#realm-map-profile button,#realm-map-label-control {
        border:1px solid #667485;border-radius:6px;background:#273545;color:white;padding:7px 9px;cursor:pointer
      }
      #realm-map-toolbar button[aria-pressed="true"] {background:#166e92;border-color:#67c6ee}
      #realm-map-toolbar input[type=color] {width:36px;height:30px;vertical-align:middle;border:0;cursor:pointer;background:transparent}
      #realm-map-toolbar small {color:#c7d5df;line-height:1.35;display:block}
      #realm-map-toolbar label {cursor:pointer}
      #realm-map-label-control {top:12px;right:64px;padding:9px 12px}
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
      button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible {outline:3px solid #67c6ee;outline-offset:2px}
      #atlas-directory button {background:#273545;color:white;border:1px solid #99a8b2;border-radius:5px;padding:6px;margin:2px}
      #atlas-directory input:not([type=checkbox]) {box-sizing:border-box;max-width:100%;display:block;margin:5px 0;padding:6px}
      @media (max-width: 720px) {
        #realm-map-toolbar {top:60px;bottom:auto;right:8px;width:min(296px,calc(100vw - 54px));max-height:28vh}
        #realm-map-profile {top:32vh;left:44px;width:min(340px,calc(100vw - 54px));max-height:34vh}
        #atlas-directory {max-height:25vh !important;max-width:calc(100vw - 36px) !important}
      }
    `;
    document.head.appendChild(style);
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./atlas-ui.css";
    document.head.appendChild(stylesheet);
    if (!document.querySelector('link[rel="icon"]')) {
      const icon = document.createElement("link");
      icon.rel = "icon";
      icon.type = "image/svg+xml";
      icon.href = "./grass-block.svg";
      document.head.appendChild(icon);
    }
  }

  updateCoordinates(coordinate) {
    if (!coordinate) return;
    const world = this.coordToWorld(coordinate);
    if (!world.every(Number.isFinite)) return;
    this.lastWorld = world;
    this.coordinates.textContent = `X ${Math.round(world[0])} · Z ${Math.round(world[1])}`;
    this.coordinates.setAttribute(
      "aria-label",
      `X ${Math.round(world[0])}, Z ${Math.round(world[1])}. Copy teleport command`,
    );
  }

  constrainMapView() {
    if (
      !ol.View ||
      !this.map.getLayers ||
      !this.map.getSize ||
      !this.map.setView
    )
      return;
    const original = this.map.getView();
    const terrain = this.map
      .getLayers()
      .getArray()
      .find((layer) => layer.getSource?.().getTileGrid?.());
    const bounds = terrain?.getSource().getTileGrid().getExtent();
    const size = this.map.getSize();
    if (!bounds || !size || size.some((n) => n <= 0)) return;
    this.mapBounds = bounds;
    this.baseMinZoom ??= original.getMinZoom();
    const minimum = Math.max(
      this.baseMinZoom,
      Math.ceil(
        original.getZoomForResolution(
          Math.min(
            (bounds[2] - bounds[0]) / size[0],
            (bounds[3] - bounds[1]) / size[1],
          ),
        ),
      ),
    );
    this.map.setView(
      new ol.View({
        projection: original.getProjection(),
        resolutions: original.getResolutions(),
        extent: bounds,
        center: original.getCenter(),
        zoom: Math.max(original.getZoom(), minimum),
        minZoom: minimum,
        maxZoom: original.getMaxZoom(),
        constrainOnlyCenter: false,
        showFullExtent: false,
        smoothResolutionConstraint: false,
        smoothExtentConstraint: false,
        constrainResolution: true,
        enableRotation: false,
      }),
    );
    this.map.getView().on("change:resolution", () => this.source.changed());
  }

  setupUi() {
    const profile = document.createElement("section");
    profile.id = "realm-map-profile";
    profile.setAttribute("aria-label", "Kingdom or location profile");
    profile.hidden = true;
    document.body.appendChild(profile);
    this.profile = profile;

    const header = this.element("header");
    header.id = "atlas-header";
    const brand = this.element("div", undefined, "atlas-brand");
    const block = this.element("img");
    block.src = "./grass-block.svg";
    block.alt = "";
    const title = this.element("div");
    title.append(
      this.element("strong", "Kingdom Atlas"),
      this.element("small", "Explore your world"),
    );
    brand.append(block, title);
    header.appendChild(brand);
    this.coordinates = this.element("button", "X 0 · Z 0");
    this.coordinates.id = "atlas-coordinates";
    this.coordinates.title = "Copy Minecraft teleport command";
    this.coordinates.addEventListener("click", () => {
      if (this.lastWorld)
        this.copyText(
          `/tp ${Math.round(this.lastWorld[0])} ~ ${Math.round(this.lastWorld[1])}`,
        );
    });
    header.appendChild(this.coordinates);
    const actions = this.element("div", undefined, "atlas-actions");
    const home = this.element("button", "⌂");
    home.id = "atlas-home";
    home.title = "World overview";
    home.setAttribute("aria-label", "World overview");
    home.addEventListener("click", () => {
      if (this.mapBounds)
        this.map
          .getView()
          .fit(this.mapBounds, { padding: [24, 24, 24, 24], duration: 250 });
    });
    actions.appendChild(home);
    this.annotationButton = this.element("button");
    this.annotationButton.type = "button";
    this.annotationButton.id = "atlas-annotation-control";
    this.annotationButton.addEventListener("click", () =>
      this.setAnnotationsVisible(!this.showAnnotations),
    );
    actions.appendChild(this.annotationButton);
    this.updateAnnotationsButton();
    header.appendChild(actions);
    document.body.appendChild(header);
    this.map.on("pointermove", (e) => {
      if (!e.dragging) this.updateCoordinates(e.coordinate);
    });
    this.map.on("moveend", () =>
      this.updateCoordinates(this.map.getView().getCenter()),
    );
    this.updateCoordinates(this.map.getView().getCenter());
    const editButton = this.element("button", "✎");
    editButton.type = "button";
    editButton.id = "atlas-edit-toggle";
    editButton.setAttribute("aria-label", "Enable editing");
    editButton.title = "Edit map annotations";
    editButton.addEventListener("click", () => this.toggleEditing());
    this.editButton = editButton;
    this.updateEditButton();
    actions.appendChild(editButton);
    {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "realm-map-label-control";
      button.addEventListener("click", () =>
        this.setLabels(!this.showAllLabels),
      );
      actions.prepend(button);
      this.labelButton = button;
      this.browseLabelButton = button;
      button.hidden = this.editMode;
      this.updateLabelButton();
    }
  }

  updateAnnotationsButton() {
    if (!this.annotationButton) return;
    this.annotationButton.textContent = this.showAnnotations
      ? "Hide annotations"
      : "Show annotations";
    this.annotationButton.setAttribute(
      "aria-pressed",
      String(this.showAnnotations),
    );
    this.annotationButton.title =
      "Toggle all kingdom boundaries, markers and routes";
  }

  setAnnotationsVisible(value, persist = true) {
    this.showAnnotations = Boolean(value);
    if (!this.showAnnotations) this.setTool("view");
    this.layer.setVisible(this.showAnnotations);
    this.updateAnnotationsButton();
    if (persist) {
      this.browseAnnotationsVisible = this.showAnnotations;
      try {
        localStorage.setItem(
          "realm-map-show-annotations-v3",
          String(this.showAnnotations),
        );
      } catch (_) {}
    }
  }

  updateEditButton() {
    this.editButton.textContent = this.editMode ? "✓" : "✎";
    this.editButton.setAttribute("aria-pressed", String(this.editMode));
    this.editButton.setAttribute(
      "aria-label",
      this.editMode
        ? "Finish editing and browse published map"
        : "Enable editing",
    );
    this.editButton.title = this.editMode
      ? "Finish editing (draft stays in this browser)"
      : "Edit map annotations";
  }

  async toggleEditing() {
    if (this.loading) {
      this.notice(
        "Wait for annotations to load, or resolve the loading error first.",
      );
      return;
    }
    if (this.editMode && this.saveDraft() === false) return;
    const directoryWasOpen = this.directory?.open;
    this.loading = true;
    this.setTool("view");
    this.editMode = !this.editMode;
    this.setAnnotationsVisible(
      this.editMode || this.browseAnnotationsVisible,
      false,
    );
    if (this.editMode) this.setupToolbar();
    else {
      this.toolbar?.remove();
      this.toolbar = null;
      this.labelButton = this.browseLabelButton;
    }
    this.browseLabelButton.hidden = this.editMode;
    if (this.worldDateLabel) this.worldDateLabel.hidden = !this.editMode;
    const url = new URL(location.href);
    if (this.editMode) url.searchParams.set("edit", "1");
    else url.searchParams.delete("edit");
    window.history.replaceState(null, "", url);
    this.updateEditButton();
    this.editButton.disabled = true;
    try {
      await this.loadAnnotations();
    } finally {
      this.editButton.disabled = false;
    }
    this.updateLabelButton();
    if (!this.loading && this.editMode)
      this.notice(
        "Editing a local draft. Choose Boundary to draw kingdoms, then Export for Publishing to download annotations.json. Your edits are not live until committed in GitHub.",
      );
    if (!this.loading && this.editMode) this.directory.open = directoryWasOpen;
  }

  setupToolbar() {
    const pane = document.createElement("aside");
    pane.id = "realm-map-toolbar";
    pane.innerHTML = `
      <strong>Realm Map Editor</strong>
      <button type="button" data-action="export" class="atlas-save">Export for Publishing</button>
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
        <button type="button" data-action="undo">Undo</button><button type="button" data-action="redo">Redo</button>
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
    pane.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      switch (b.dataset.action) {
        case "undo":
          this.restoreHistory(false);
          break;
        case "redo":
          this.restoreHistory(true);
          break;
        case "labels":
          this.setLabels(!this.showAllLabels);
          break;
        case "export":
          this.exportFile();
          break;
        case "import":
          pane.querySelector("#realm-map-file").click();
          break;
        case "reset":
          this.resetDraft();
          break;
      }
    });
    pane
      .querySelector("#realm-map-file")
      .addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          if (file.size > 8 * 1024 * 1024) throw Error("File exceeds 8 MiB");
          const parsed = AtlasData.parse(await file.text());
          if (!Array.isArray(parsed.features))
            throw new Error("Missing features array");
          if (
            !window.confirm(
              "Replace your current draft with the imported annotations?",
            )
          )
            return;
          this.setDocument(parsed);
          this.saveDraft();
        } catch (err) {
          window.alert("Could not import JSON: " + err.message);
        } finally {
          e.target.value = "";
        }
      });
    this.setTool("view");
  }

  updateLabelButton() {
    if (this.labelButton)
      this.labelButton.textContent = this.showAllLabels
        ? "Hide all labels"
        : "Show all labels";
  }

  setLabels(value) {
    this.showAllLabels = Boolean(value);
    try {
      localStorage.setItem(
        "realm-map-show-labels-v3",
        String(this.showAllLabels),
      );
    } catch (_) {}
    this.source.changed();
    this.updateLabelButton();
    this.saveDraft();
  }

  setTool(tool) {
    if (
      ["marker", "territory", "route", "edit", "delete"].includes(tool) &&
      !this.showAnnotations
    )
      this.setAnnotationsVisible(true, false);
    this.activeTool = tool;
    if (this.interaction) this.map.removeInteraction(this.interaction);
    this.interaction = null;
    this.closeProfile();
    document
      .querySelectorAll("#realm-map-toolbar button[data-tool]")
      .forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
      });
    if (tool === "edit") {
      this.interaction = new ol.interaction.Modify({ source: this.source });
      this.interaction.on("modifystart", () => {
        this.modifying = true;
      });
      this.interaction.on("modifyend", () => {
        this.modifying = false;
        this.saveDraft();
      });
    } else if (["marker", "territory", "route"].includes(tool)) {
      const type = {
        marker: "Point",
        territory: "Polygon",
        route: "LineString",
      }[tool];
      this.interaction = new ol.interaction.Draw({ source: this.source, type });
      this.interaction.on("drawend", ({ feature }) => {
        const fallback = {
          marker: "Marker",
          territory: "Territory",
          route: "Path",
        }[tool];
        const name = window.prompt(
          "Name this " + fallback.toLowerCase() + ":",
          fallback,
        );
        if (name === null) {
          // The feature is added to the source after drawend fires.
          setTimeout(() => this.source.removeFeature(feature), 0);
          return;
        }
        feature.setProperties({
          id: crypto.randomUUID(),
          category: tool === "route" ? "road" : "custom",
          layer:
            tool === "territory"
              ? "territories"
              : tool === "route"
                ? "transport"
                : "landmarks",
          kind: tool,
          name: name.trim() || fallback,
          owner: "",
          description: "",
          showLabel: true,
          color: document.getElementById("realm-map-color").value,
        });
      });
    }
    if (this.interaction) this.map.addInteraction(this.interaction);
  }

  onMapClick(evt) {
    if (
      this.editMode &&
      ["marker", "territory", "route", "edit"].includes(this.activeTool)
    )
      return;
    const feature = this.map.forEachFeatureAtPixel(
      evt.pixel,
      (f, layer) => (layer === this.layer ? f : undefined),
      { hitTolerance: 8 },
    );
    if (this.activeTool === "delete" && this.editMode) {
      if (
        feature &&
        window.confirm(`Delete ${feature.get("name") || "this item"}?`)
      ) {
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
    const name = String(feature.get("name") || "Unnamed");
    const kind =
      {
        marker: "Location",
        territory: "Kingdom / Territory",
        route: "Road / Path",
      }[feature.get("kind")] || "Place";
    const header = this.element("div", undefined, "realm-map-profile-heading");
    header.appendChild(this.element("h3", name));
    const close = this.element("button", "×", "realm-map-close");
    close.type = "button";
    close.title = "Close";
    close.setAttribute("aria-label", "Close profile");
    close.addEventListener("click", () => this.closeProfile());
    header.appendChild(close);
    profile.appendChild(header);
    profile.appendChild(this.element("div", kind, "realm-map-muted"));

    const center = ol.extent.getCenter(feature.getGeometry().getExtent());
    const world = this.coordToWorld(center);
    const x = Math.round(world[0]),
      z = Math.round(world[1]);
    profile.appendChild(
      this.element(
        "div",
        `Approximate centre: X ${x}, Z ${z}`,
        "realm-map-muted",
      ),
    );

    const tp = this.element("button", "Copy /tp");
    tp.addEventListener("click", () => this.copyText(`/tp ${x} ~ ${z}`));
    profile.appendChild(tp);
    const share = this.element("button", "Copy feature link");
    share.addEventListener("click", () => {
      const url = new URL(location.href);
      url.searchParams.delete("edit");
      url.hash = new URLSearchParams({ feature: feature.get("id") }).toString();
      this.copyText(url.href);
    });
    profile.appendChild(share);
    if (!this.editMode) {
      for (const key of [
        "category",
        "status",
        "kingdom",
        "settlementType",
        "foundedYear",
        "notes",
      ])
        if (feature.get(key))
          profile.appendChild(this.element("p", `${key}: ${feature.get(key)}`));
      const owner = feature.get("owner") || "";
      if (owner)
        profile.appendChild(
          this.element("div", `Ruler / Owner: ${owner}`, "realm-map-property"),
        );
      const description = feature.get("description") || "";
      if (description)
        profile.appendChild(
          this.element("p", description, "realm-map-description"),
        );
      else
        profile.appendChild(
          this.element("p", "No description added yet.", "realm-map-muted"),
        );
      return;
    }

    const field = (title, value, limit, onInput) => {
      const label = this.element("label", undefined, "realm-map-field");
      label.appendChild(this.element("span", title));
      const input = this.element("input");
      input.type = "text";
      input.value = value || "";
      input.maxLength = limit;
      input.addEventListener("input", () => {
        if (this.selectedFeature === feature) onInput(input.value);
      });
      label.appendChild(input);
      profile.appendChild(label);
      return input;
    };
    field("Name", name, 160, (value) => {
      feature.set("name", value);
      header.querySelector("h3").textContent = value || "Unnamed";
    });
    field(
      "Ruler / Owner / Faction (optional)",
      feature.get("owner") || "",
      160,
      (value) => feature.set("owner", value),
    );

    for (const key of [
      "status",
      "kingdom",
      "settlementType",
      "foundedYear",
      "notes",
      "icon",
    ])
      field(key, feature.get(key), key === "notes" ? 4000 : 160, (value) =>
        feature.set(key, value),
      );
    for (const [key, choices] of [
      ["category", Object.keys(AtlasData.categories)],
      ["layer", AtlasData.layers],
    ]) {
      const label = this.element("label", key, "realm-map-field");
      const select = this.element("select");
      for (const value of new Set([feature.get(key), ...choices]))
        if (value) {
          const option = this.element("option", value);
          option.value = value;
          select.appendChild(option);
        }
      select.value = feature.get(key);
      select.addEventListener("change", () => feature.set(key, select.value));
      label.appendChild(select);
      profile.appendChild(label);
    }
    const descLabel = this.element("label", undefined, "realm-map-field");
    descLabel.appendChild(this.element("span", "Description / Profile"));
    const textarea = this.element("textarea");
    textarea.value = feature.get("description") || "";
    textarea.maxLength = 4000;
    textarea.rows = 6;
    textarea.placeholder =
      "A short history, ruler, capital, alliances, or anything else you want visitors to know.";
    textarea.addEventListener("input", () => {
      if (this.selectedFeature === feature)
        feature.set("description", textarea.value);
    });
    descLabel.appendChild(textarea);
    profile.appendChild(descLabel);

    const colorLabel = this.element("label", undefined, "realm-map-field");
    colorLabel.appendChild(this.element("span", "Boundary / Marker Colour"));
    const color = this.element("input");
    color.type = "color";
    color.value = this.safeColor(feature.get("color"));
    color.addEventListener("input", () => feature.set("color", color.value));
    colorLabel.appendChild(color);
    profile.appendChild(colorLabel);

    const labelLine = this.element("label");
    const showLabel = this.element("input");
    showLabel.type = "checkbox";
    showLabel.checked = feature.get("showLabel") !== false;
    showLabel.addEventListener("change", () =>
      feature.set("showLabel", showLabel.checked),
    );
    labelLine.append(
      showLabel,
      document.createTextNode(" Show this name on the map"),
    );
    profile.appendChild(labelLine);
    profile.appendChild(
      this.element(
        "p",
        "Changes are saved to this browser automatically. Export JSON to publish them.",
        "realm-map-muted",
      ),
    );
  }

  getAnnotations() {
    return this.source.getFeatures().map((f) => {
      const geom = f
        .getGeometry()
        .clone()
        .transform(this.unmined.viewProjection, this.unmined.dataProjection);
      const properties = {};
      for (const key of ["id", "kind", "showLabel", ...AtlasData.fields])
        properties[key] = f.get(key);
      const original = this.originalGeometry.get(f);
      const coordinates =
        original && original.revision === f.getGeometry().getRevision()
          ? original.coordinates
          : geom.getCoordinates();
      return { ...properties, coordinates };
    });
  }

  setAnnotations(items) {
    const valid = AtlasData.migrate({ features: items }).features;
    // Build everything before touching the live source: projection failures are atomic too.
    const features = valid.map((entry) => {
      const geom =
        entry.kind === "marker"
          ? new ol.geom.Point(entry.coordinates)
          : entry.kind === "territory"
            ? new ol.geom.Polygon(entry.coordinates)
            : new ol.geom.LineString(entry.coordinates);
      geom.transform(this.unmined.dataProjection, this.unmined.viewProjection);
      if (!geom.getExtent().every(Number.isFinite))
        throw Error("Map projection produced invalid geometry");
      const feature = new ol.Feature({ geometry: geom });
      const { coordinates, ...properties } = entry;
      feature.setProperties(properties);
      this.originalGeometry.set(feature, {
        coordinates,
        revision: geom.getRevision(),
      });
      return feature;
    });
    this.loading = true;
    this.closeProfile();
    this.source.clear();
    this.source.addFeatures(features);
    this.loading = false;
  }

  snapshot() {
    return AtlasData.migrate({
      ...this.document,
      settings: { ...this.document.settings, labels: this.showAllLabels },
      features: this.getAnnotations(),
    });
  }

  setDocument(data, preserveDisplay = false) {
    const valid = AtlasData.migrate(data);
    this.setAnnotations(valid.features);
    this.document = valid;
    if (!preserveDisplay) {
      this.showAllLabels = valid.settings.labels;
      try {
        localStorage.setItem(
          "realm-map-show-labels-v3",
          String(this.showAllLabels),
        );
      } catch (_) {}
    }
    this.updateLabelButton();
    this.source.changed();
    this.refreshDirectory();
  }

  saveDraft() {
    if (this.loading || this.modifying || !this.editMode) return;
    try {
      const data = this.snapshot();
      data.annotationUpdatedAt = new Date().toISOString();
      const previous = this.lastSnapshot;
      const text = JSON.stringify(data);
      if (
        previous &&
        JSON.stringify({ ...JSON.parse(previous), annotationUpdatedAt: "" }) !==
          JSON.stringify({ ...data, annotationUpdatedAt: "" })
      ) {
        this.remember(this.history, previous);
        this.future = [];
      }
      this.document = data;
      this.lastSnapshot = text;
      this.refreshDirectory();
      window.localStorage.setItem(this.storeKey, text);
      return true;
    } catch (e) {
      this.notice(
        "Draft could not be saved: " +
          e.message +
          ". Export a backup before closing.",
      );
      return false;
    }
  }

  remember(history, text) {
    history.push(text);
    let size = history.reduce((sum, item) => sum + item.length, 0);
    while (
      history.length > 100 ||
      (size > 16 * 1024 * 1024 && history.length > 1)
    )
      size -= history.shift().length;
  }

  restoreHistory(redo) {
    const from = redo ? this.future : this.history,
      to = redo ? this.history : this.future;
    if (!from.length) return;
    this.remember(to, JSON.stringify(this.snapshot()));
    this.setDocument(AtlasData.parse(from.pop()));
    this.lastSnapshot = JSON.stringify(this.snapshot());
    try {
      localStorage.setItem(this.storeKey, this.lastSnapshot);
    } catch (e) {
      this.notice(e.message);
    }
  }

  async loadAnnotations() {
    let published = { features: [] };
    try {
      const res = await fetch(this.publishedUrl, { cache: "no-store" });
      if (res.ok) published = AtlasData.parse(await res.text());
      else if (res.status !== 404)
        throw Error("Published annotations HTTP " + res.status);
    } catch (e) {
      this.notice("Could not load published annotations: " + e.message);
      this.loading = true;
      return;
    }
    let data = published;
    if (this.editMode) {
      try {
        const text = window.localStorage.getItem(this.storeKey);
        data = text ? AtlasData.parse(text) : published;
      } catch (e) {
        this.notice(
          "Local draft is unreadable; original storage preserved. Import a backup or reset explicitly. " +
            e.message,
        );
        this.loading = true;
        return;
      }
    }
    try {
      this.setDocument(data, true);
    } catch (e) {
      this.notice(
        "Annotations were not replaced: " +
          e.message +
          ". Back up the original JSON/draft before repairing it.",
      );
      return;
    }
    this.lastSnapshot = JSON.stringify(this.snapshot());
    const params = new URLSearchParams(location.hash.slice(1));
    const feature = this.source
      .getFeatures()
      .find((f) => f.get("id") === params.get("feature"));
    if (feature) this.selectFeature(feature);
    else if (
      params.has("x") &&
      params.has("z") &&
      [params.get("x"), params.get("z")].every(
        (v) =>
          v.trim() !== "" &&
          Number.isFinite(Number(v)) &&
          Math.abs(Number(v)) <= 30000000,
      )
    ) {
      this.map
        .getView()
        .setCenter(
          ol.proj.transform(
            [Number(params.get("x")), Number(params.get("z"))],
            this.unmined.dataProjection,
            this.unmined.viewProjection,
          ),
        );
      const zoom = Number(params.get("zoom"));
      if (params.has("zoom") && Number.isFinite(zoom))
        this.map.getView().setZoom(Math.max(0, Math.min(20, zoom)));
    }
  }

  exportFile() {
    if (this.loading) {
      this.notice(
        "Resolve annotation loading errors before exporting. Original draft remains in browser storage.",
      );
      return;
    }
    try {
      const json = JSON.stringify(this.snapshot(), null, 2);
      AtlasData.parse(json);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const link = this.element("a");
      link.href = url;
      link.download = "annotations.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.notice(
        "Backup exported. To publish, replace public/annotations.json in GitHub and commit to main. Workers Builds deploys that commit. This browser draft is not live.",
      );
    } catch (e) {
      this.notice("Export failed: " + e.message);
    }
  }

  notice(text) {
    if (this.message) this.message.textContent = text;
    if (this.directory) this.directory.open = true;
  }
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.notice("Copied");
    } catch (_) {
      window.prompt("Copy this text:", text);
    }
  }
  selectFeature(feature) {
    this.setAnnotationsVisible(true, false);
    this.map.getView().fit(feature.getGeometry().getExtent(), {
      maxZoom: 6,
      padding: [80, 80, 80, 80],
      duration: 250,
    });
    this.openProfile(feature);
  }

  setupDirectory() {
    const panel = this.element("details");
    panel.id = "atlas-directory";

    panel.appendChild(this.element("summary", "World directory"));
    this.search = this.element("input");
    this.search.placeholder = "Search profiles";
    this.search.setAttribute("aria-label", "Search profiles");
    panel.appendChild(this.search);
    this.ownerFilter = this.element("input");
    this.ownerFilter.placeholder = "Filter owner / ruler";
    this.ownerFilter.setAttribute("aria-label", "Filter owner or ruler");
    panel.appendChild(this.ownerFilter);
    this.search.addEventListener("input", () => this.refreshDirectory());
    this.ownerFilter.addEventListener("input", () => this.refreshDirectory());
    for (const layer of AtlasData.layers) {
      const label = this.element("label", layer);
      const input = this.element("input");
      input.type = "checkbox";
      input.checked = true;
      input.dataset.layer = layer;
      input.addEventListener("change", () => {
        this.document.settings.layers[layer] = input.checked;
        this.source.changed();
        this.saveDraft();
      });
      label.prepend(input);
      panel.appendChild(label);
      panel.appendChild(this.element("br"));
    }
    this.results = this.element("div", undefined, "atlas-results");
    panel.appendChild(this.results);
    this.dates = this.element("p");
    panel.appendChild(this.dates);
    this.message = this.element("p");
    this.message.setAttribute("role", "status");
    panel.appendChild(this.message);
    const link = this.element("button", "Copy map view link");
    link.addEventListener("click", () => {
      const world = this.coordToWorld(this.map.getView().getCenter());
      const url = new URL(location.href);
      url.searchParams.delete("edit");
      url.hash = new URLSearchParams({
        x: world[0],
        z: world[1],
        zoom: this.map.getView().getZoom(),
      }).toString();
      this.copyText(url.href);
    });
    panel.appendChild(link);
    {
      const dateLabel = this.element(
        "label",
        "World export date (terrain only)",
      );
      const date = this.element("input");
      date.type = "date";
      date.addEventListener("change", () => {
        this.document.worldExportDate = date.value;
        this.saveDraft();
      });
      date.dataset.worldDate = "";
      dateLabel.appendChild(date);
      dateLabel.hidden = !this.editMode;
      this.worldDateLabel = dateLabel;
      panel.appendChild(dateLabel);
    }
    this.map.on("singleclick", (e) => {
      this.updateCoordinates(e.coordinate);
    });
    this.map.getView().on("change:resolution", () => this.source.changed());
    document.body.appendChild(panel);
    this.directory = panel;
  }

  refreshDirectory() {
    if (!this.results) return;
    this.results.replaceChildren();
    for (const input of this.directory.querySelectorAll("[data-layer]"))
      input.checked =
        this.document.settings.layers[input.dataset.layer] !== false;
    const date = this.directory.querySelector("[data-world-date]");
    if (date) date.value = this.document.worldExportDate.slice(0, 10);
    const query = this.search.value.toLowerCase(),
      owner = this.ownerFilter.value.toLowerCase();
    for (const feature of this.source
      .getFeatures()
      .filter(
        (f) =>
          ["name", "description", "owner", "category"].some((k) =>
            String(f.get(k) || "")
              .toLowerCase()
              .includes(query),
          ) &&
          String(f.get("owner") || "")
            .toLowerCase()
            .includes(owner),
      )
      .slice(0, 100)) {
      const button = this.element(
        "button",
        `${AtlasData.categories[feature.get("category")] || "📍"} ${feature.get("name") || "Unnamed"}`,
      );
      button.addEventListener("click", () => this.selectFeature(feature));
      this.results.appendChild(button);
    }
    this.dates.textContent = `World export: ${this.document.worldExportDate || "unknown"} · Annotations: ${this.document.annotationUpdatedAt || "unknown"}`;
  }

  async resetDraft() {
    if (
      !window.confirm(
        "Discard browser edits and reload the published annotations.json?",
      )
    )
      return;
    if (this.lastSnapshot) this.remember(this.history, this.lastSnapshot);
    try {
      window.localStorage.removeItem(this.storeKey);
    } catch (e) {
      this.notice(e.message);
      return;
    }
    await this.loadAnnotations();
  }
}
window.RealmMapEditor = RealmMapEditor;
