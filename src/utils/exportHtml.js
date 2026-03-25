/**
 * 导出为独立 HTML 文件
 * 生成一个包含数据和 deck.gl 渲染的自包含 HTML，无需服务器即可打开
 */
export function exportStandaloneHtml(locations, flows, config, viewState, mapStyle) {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN ||
        'pk.eyJ1IjoibmkxbzEiLCJhIjoiY2t3ZDgzMmR5NDF4czJ1cm84Z3NqOGt3OSJ9.yOYP6pxDzXzhbHfyk3uORg';
    const mapboxUser = process.env.REACT_APP_MAPBOX_USER || 'ni1o1';

    // 限制内联数据量，超大数据集只取 Top N
    const maxFlows = 50000;
    const trimmedFlows = flows.length > maxFlows ? flows.slice(0, maxFlows) : flows;

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ODview - 交通出行可视化</title>
<script src="https://unpkg.com/deck.gl@8.9.35/dist.min.js"><\/script>
<script src="https://unpkg.com/maplibre-gl@2.4.0/dist/maplibre-gl.js"><\/script>
<link href="https://unpkg.com/maplibre-gl@2.4.0/dist/maplibre-gl.css" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${config.darkMode ? '#141414' : '#fff'}; overflow: hidden; font-family: -apple-system, sans-serif; }
  #container { width: 100vw; height: 100vh; position: relative; }
  .info-bar {
    position: absolute; top: 12px; left: 12px; z-index: 10;
    background: ${config.darkMode ? 'rgba(20,20,20,0.85)' : 'rgba(255,255,255,0.9)'};
    color: ${config.darkMode ? '#ddd' : '#333'};
    padding: 10px 16px; border-radius: 6px; font-size: 13px; line-height: 1.6;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  }
  .info-bar h3 { margin: 0 0 4px 0; font-size: 15px; }
  .info-bar span { opacity: 0.7; }
</style>
</head>
<body>
<div id="container"></div>
<div class="info-bar">
  <h3>ODview</h3>
  <div>${locations.length} 个节点 / ${trimmedFlows.length} 条流向</div>
  <span>配色: ${config.colorScheme} | 生成时间: ${new Date().toLocaleDateString()}</span>
</div>
<script>
const DATA = {
  locations: ${JSON.stringify(locations)},
  flows: ${JSON.stringify(trimmedFlows)}
};

const INITIAL_VIEW = ${JSON.stringify({
    longitude: viewState.longitude,
    latitude: viewState.latitude,
    zoom: viewState.zoom,
    pitch: viewState.pitch || 0,
    bearing: viewState.bearing || 0,
})};

const CONFIG = ${JSON.stringify({
    colorScheme: config.colorScheme,
    opacity: config.opacity,
    darkMode: config.darkMode,
    animationEnabled: config.animationEnabled,
    clusteringEnabled: config.clusteringEnabled,
    locationTotalsEnabled: config.locationTotalsEnabled,
    fadeEnabled: config.fadeEnabled,
    fadeOpacityEnabled: config.fadeOpacityEnabled,
    fadeAmount: config.fadeAmount,
})};

// 简化版渲染 —— 使用 deck.gl 的 ArcLayer 近似 OD 流线
// (独立 HTML 不依赖 flowmap.gl，用 ArcLayer 替代)
const { Deck, ArcLayer, ScatterplotLayer } = deck;

const arcLayer = new ArcLayer({
  id: 'arcs',
  data: DATA.flows,
  getSourcePosition: d => {
    const loc = DATA.locations.find(l => l.id === d.origin);
    return loc ? [loc.lon, loc.lat] : [0, 0];
  },
  getTargetPosition: d => {
    const loc = DATA.locations.find(l => l.id === d.dest);
    return loc ? [loc.lon, loc.lat] : [0, 0];
  },
  getSourceColor: CONFIG.darkMode ? [0, 180, 255, 180] : [0, 120, 200, 160],
  getTargetColor: CONFIG.darkMode ? [80, 255, 200, 180] : [40, 200, 140, 160],
  getWidth: d => Math.max(1, Math.sqrt(d.count) * 0.3),
  pickable: true,
  autoHighlight: true,
});

const scatterLayer = new ScatterplotLayer({
  id: 'locations',
  data: DATA.locations,
  getPosition: d => [d.lon, d.lat],
  getRadius: d => Math.max(200, Math.sqrt(d.count) * 30),
  getFillColor: CONFIG.darkMode ? [0, 160, 255, 200] : [0, 100, 180, 180],
  pickable: true,
});

new Deck({
  container: 'container',
  initialViewState: INITIAL_VIEW,
  controller: true,
  layers: [arcLayer, scatterLayer],
  getTooltip: ({object}) => {
    if (!object) return null;
    if (object.count !== undefined && object.origin) return 'Count: ' + object.count.toLocaleString();
    if (object.id) return 'ID: ' + object.id + ' | Count: ' + (object.count || 0).toLocaleString();
    return null;
  }
});
<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `odview_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    return true;
}
