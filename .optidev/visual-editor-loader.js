function p(a = {}) {
  const { cdnUrl: r, enableInProduction: d = !1 } = a, t = process.env.VITE_VISUAL_EDITOR_CDN || r || "https://visual-editor.optidev.ai/index.js";
  return {
    name: "vite-plugin-visual-editor-loader",
    transformIndexHtml(i, l) {
      const n = l.server !== void 0, o = `
  <!-- System theme detection (runs before first paint) -->
  <script>
    (function(){
      var q=window.matchMedia("(prefers-color-scheme:dark)");
      function a(d){document.documentElement.classList.toggle("dark",d)}
      a(q.matches);
      q.addEventListener("change",function(e){a(e.matches)});
    })();
  <\/script>`;
      if (!n && !d)
        return i.replace("</head>", `${o}
</head>`);
      let e;
      n ? e = process.env.VITE_VISUAL_EDITOR_DEV || t : e = t;
      const s = `
  <style id="ve-media-control-parts">
    [data-hide-playpause]::-webkit-media-controls-play-button { display: none !important; }
    [data-hide-track]::-webkit-media-controls-timeline { display: none !important; }
    [data-hide-track]::-webkit-media-controls-timeline-container { display: none !important; }
    [data-hide-time]::-webkit-media-controls-current-time-display { display: none !important; }
    [data-hide-time]::-webkit-media-controls-time-remaining-display { display: none !important; }
    [data-hide-volume]::-webkit-media-controls-mute-button { display: none !important; }
    [data-hide-volume]::-webkit-media-controls-volume-slider { display: none !important; }
    [data-hide-overflow]::-webkit-media-controls-overflow-button { display: none !important; }
    [data-hide-overflow]::-webkit-media-controls-panel { overflow: hidden !important; }
    [data-hide-overflow]::-webkit-media-controls-enclosure { overflow: hidden !important; }
  </style>`, c = `
  <!-- OptiEdge Visual Editor (only loads when in iframe) -->
  <script type="module">
    // Only initialize if running in iframe
    if (window.self !== window.parent) {
      import('${e}')
        .then(module => {
          if (module.init) {
            module.init();
          }
        })
        .catch(err => {
          console.warn('[Visual Editor] Failed to load:', err);
        });
    }
  <\/script>`;
      return i.replace(
        "</head>",
        `${o}
${s}
${c}
</head>`
      );
    }
  };
}
export {
  p as default,
  p as visualEditorLoader
};
