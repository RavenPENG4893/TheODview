/**
 * 数据导出工具集
 */

// 下载 JSON 文件
export const downloadJSON = (data, fileName) => {
    var cache = [];
    const json = JSON.stringify(data, function (key, value) {
        if (typeof value === 'object' && value !== null) {
            if (cache.indexOf(value) !== -1) {
                return;
            }
            cache.push(value);
        }
        return value
    }, 2);
    cache = null;
    const blob = new Blob([json], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
}

// 兼容旧调用
export const downloadFile = downloadJSON;

// 下载 CSV 文件
export const downloadCSV = (data, fileName) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row =>
            headers.map(h => {
                const val = row[h];
                // 处理包含逗号或引号的值
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        )
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
}

// 将 flows 数据转换为 OD CSV 格式
export const exportFlowsAsCSV = (flows, locations) => {
    if (!flows || flows.length === 0) return;
    // 建立 location id -> 坐标的映射
    const locMap = {};
    locations.forEach(loc => {
        locMap[loc.id] = { lon: loc.lon, lat: loc.lat };
    });
    const csvData = flows.map(f => {
        const origin = locMap[f.origin] || { lon: '', lat: '' };
        const dest = locMap[f.dest] || { lon: '', lat: '' };
        return {
            slon: origin.lon,
            slat: origin.lat,
            elon: dest.lon,
            elat: dest.lat,
            count: f.count
        };
    });
    downloadCSV(csvData, 'od_export');
}

// 地图截图导出
export const exportScreenshot = () => {
    const deckCanvas = document.querySelector('#deckgl-wrapper canvas');
    if (!deckCanvas) {
        console.error('Canvas not found');
        return false;
    }
    try {
        const dataURL = deckCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `odview_${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
    } catch (e) {
        console.error('Screenshot failed:', e);
        return false;
    }
}

// 导出配置参数
export const exportConfig = (config) => {
    downloadJSON(config, 'odview_config');
}

// 导入配置参数（返回 Promise）
export const importConfig = () => {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return reject('No file selected');
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const config = JSON.parse(event.target.result);
                    resolve(config);
                } catch (err) {
                    reject('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}
