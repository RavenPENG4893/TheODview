import React, { useEffect, useState, useCallback } from 'react'
import { Typography, Divider, Col, Upload, message, Switch, Table, Modal, Row, Button, Slider, Card, Form, Select, Collapse, Tooltip, Spin, Space } from 'antd';
import {
    InfoCircleOutlined, InboxOutlined, LoadingOutlined,
    CameraOutlined, DownloadOutlined, UploadOutlined, SettingOutlined,
    CloseCircleOutlined, AimOutlined, ShareAltOutlined, Html5Outlined, ClockCircleOutlined
} from '@ant-design/icons';
import { nanoid } from 'nanoid';
import { useDispatch, useMappedState } from 'redux-react-hook'
import {
    setlocations_tmp, setflows_tmp, setconfig_tmp, setcustomlayers_tmp,
    setSelectedLocation_tmp, setTimeRange_tmp
} from '@/redux/actions/traj'
import { exportFlowsAsCSV, exportScreenshot, exportConfig, importConfig, downloadJSON } from '@/utils/downloadFile';
import { exportStandaloneHtml } from '@/utils/exportHtml';
import { copyShareUrl } from '@/utils/shareUrl';
import { processODInWorker } from '@/utils/csvWorker';
import COLOR_SCHEMES from '@/utils/colorSchemes';
import axios from 'axios'
import { GeoJsonLayer } from '@deck.gl/layers';

const { Dragger } = Upload;
const { Title, Text } = Typography;
const csv = require('csvtojson')
const { Panel } = Collapse;
const { Option } = Select;
const loadingIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;
const PREVIEW_LIMIT = 100;

function ColorSwatch({ scheme }) {
    const colors = COLOR_SCHEMES[scheme];
    if (!colors) return null;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
                display: 'inline-block', width: 60, height: 12, borderRadius: 2,
                background: `linear-gradient(to right, ${colors.join(', ')})`,
                border: '1px solid #d9d9d9', verticalAlign: 'middle',
            }} />
            <span>{scheme}</span>
        </span>
    );
}

export default function ODview() {
    const dispatch = useDispatch()
    const setlocations = (data) => dispatch(setlocations_tmp(data))
    const setflows = (data) => dispatch(setflows_tmp(data))
    const setconfig = (data) => dispatch(setconfig_tmp(data))
    const setcustomlayers = (data) => dispatch(setcustomlayers_tmp(data))

    const mapState = useCallback(state => ({
        traj: state.traj,
        selectedLocation: state.traj.selectedLocation,
        viewState: state.traj.viewState,
        timeRange: state.traj.timeRange,
    }), []);
    const { traj, selectedLocation, viewState, timeRange } = useMappedState(mapState);
    const { flows, locations, config, customlayers } = traj

    const [dataLoading, setDataLoading] = useState(true);
    const [loadingTip, setLoadingTip] = useState('正在加载示例数据...');
    const [layernum, setlayernum] = useState(1)
    const [tableinfo, setTableinfo] = useState({ columns: [], data: [], totalRows: 0 })
    const [form] = Form.useForm()
    const [isModalVisible, setisModalVisible] = useState(false)
    const [form2] = Form.useForm()
    const [maxflow, setmaxflow] = useState(100)
    const [allCsvData, setAllCsvData] = useState([]) // 完整数据（表格只显示前100行）

    // CSV 文件上传
    const handleupload_traj = (file) => {
        setDataLoading(true);
        setLoadingTip(`正在读取 ${file.name} ...`);
        message.loading({ content: '读取数据中', key: 'readcsv', duration: 0 })
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.readAsText(file)
            reader.onload = function (f) {
                const data = f.target.result
                if (file.name.slice(-3) === 'csv') {
                    const hasHeader = data.slice(0, data.indexOf('\n')).split(',').map(f => isNaN(f[0])).indexOf(false) === -1;
                    const csvoption = hasHeader ? {} : { noheader: true };
                    csv(csvoption).fromString(data).then((jsonObj) => {
                        setDataLoading(false);
                        setisModalVisible(true);
                        const columns = Object.keys(jsonObj[0]).map(key => ({
                            title: key, dataIndex: key, key: key, ellipsis: true,
                        }));
                        // 只预览前 PREVIEW_LIMIT 行
                        setTableinfo({
                            columns,
                            data: jsonObj.slice(0, PREVIEW_LIMIT),
                            totalRows: jsonObj.length,
                        });
                        setAllCsvData(jsonObj);
                        // 自动识别列名
                        const names = columns.map(f => f.key);
                        const find = (keyword) => names[names.map(f => f.toLowerCase().indexOf(keyword) >= 0).indexOf(true)];
                        form.setFieldsValue({
                            SLON: find('slon') || names[0],
                            SLAT: find('slat') || names[1],
                            ELON: find('elon') || names[2],
                            ELAT: find('elat') || names[3],
                            COUNT: find('count') || names[4],
                            TIME: find('time') || find('hour') || find('date') || '',
                        });
                        message.destroy('readcsv');
                    });
                }
                if (file.name.slice(-4) === 'json') {
                    const jsondata = JSON.parse(data);
                    setcustomlayers([
                        ...customlayers,
                        new GeoJsonLayer({
                            id: 'Layer' + layernum.toString(),
                            type: jsondata.features[0].geometry.type,
                            data: jsondata, pickable: true, stroked: true, filled: true,
                            extruded: true, lineWidthScale: 20, lineWidthMinPixels: 2,
                            opacity: 0.8, getFillColor: [180, 180, 220], getLineColor: [180, 180, 220],
                            getPointRadius: 100, getLineWidth: 1, getElevation: 30
                        })
                    ]);
                    setlayernum(layernum + 1);
                    setDataLoading(false);
                    message.destroy('readcsv');
                }
            }
        })
    }

    // 确认字段映射 → 使用 Web Worker 处理
    const settraj = () => {
        setisModalVisible(false);
        setDataLoading(true);
        setLoadingTip('正在后台处理 OD 数据...');
        const field = form.getFieldValue();

        processODInWorker(allCsvData, {
            SLON: field.SLON,
            SLAT: field.SLAT,
            ELON: field.ELON,
            ELAT: field.ELAT,
            COUNT: field.COUNT,
            TIME: field.TIME || null,
        }).then(result => {
            setflows(result.flows);
            setlocations(result.locations);
            setmaxflow(result.maxFlow);
            setconfig({ ...config, maxTopFlowsDisplayNum: result.maxFlow });
            dispatch(setSelectedLocation_tmp(null));
            // 时间轴
            if (result.timeRange) {
                dispatch(setTimeRange_tmp(result.timeRange));
                message.success({
                    content: `加载完成 — ${result.locations.length} 个节点，${result.flows.length} 条流向，${result.timeRange.steps.length} 个时间步`,
                    duration: 4
                });
            } else {
                dispatch(setTimeRange_tmp(null));
                message.success({
                    content: `加载完成 — ${result.locations.length} 个节点，${result.flows.length} 条流向`,
                    duration: 3
                });
            }
            setDataLoading(false);
        }).catch(err => {
            console.error('OD processing failed:', err);
            setDataLoading(false);
            message.error('数据处理失败: ' + err.message);
        });
    }

    // 加载示例数据
    useEffect(() => {
        setDataLoading(true);
        setLoadingTip('正在加载示例数据...');
        Promise.all([axios.get('data/flows.json'), axios.get('data/locations.json')])
            .then(([flowsRes, locationsRes]) => {
                const f = flowsRes.data, l = locationsRes.data;
                setlocations(l); setflows(f);
                setmaxflow(f.reduce((a, b) => a.count > b.count ? a : b).count);
                setconfig({ ...config, maxTopFlowsDisplayNum: f.reduce((a, b) => a.count > b.count ? a : b).count });
                dispatch(setTimeRange_tmp(null));
                setDataLoading(false);
                message.success({ content: `示例数据 — ${l.length} 个节点，${f.length} 条流向`, duration: 3 });
            }).catch(err => {
                setDataLoading(false);
                message.warning({ content: '示例数据加载失败', duration: 4 });
            });
    }, [])

    const handleconfigchange = (d) => setconfig({ ...config, ...d })

    const filteredFlowCount = selectedLocation
        ? flows.filter(f => f.origin === selectedLocation || f.dest === selectedLocation).length
        : flows.length;

    return (
        <>
            <Col span={24}>
                <Card title="OD流向图" extra={<Tooltip title='Import OD data to show flow map'><InfoCircleOutlined /></Tooltip>} bordered={false}>
                    <Collapse defaultActiveKey={['ImportOD', 'Settings']}>
                        <Panel header="导入OD数据" key="ImportOD">
                            {dataLoading && (
                                <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: 12, background: config.darkMode ? '#111b26' : '#e6f7ff', borderRadius: 4, border: `1px solid ${config.darkMode ? '#153450' : '#91d5ff'}` }}>
                                    <Spin indicator={loadingIcon} />
                                    <span style={{ marginLeft: 10, color: '#1890ff' }}>{loadingTip}</span>
                                </div>
                            )}
                            {!dataLoading && locations.length > 0 && (
                                <div style={{ padding: '8px 12px', marginBottom: 12, background: config.darkMode ? '#162312' : '#f6ffed', borderRadius: 4, border: `1px solid ${config.darkMode ? '#274916' : '#b7eb8f'}`, fontSize: 13, color: '#52c41a' }}>
                                    {locations.length} 个节点 / {flows.length} 条流向
                                    {flows.length > 0 && ` / 最大流量 ${flows.reduce((x, y) => x.count > y.count ? x : y).count.toLocaleString()}`}
                                    {timeRange && ` / ${timeRange.steps.length} 个时间步`}
                                </div>
                            )}
                            {selectedLocation && (
                                <div style={{ padding: '8px 12px', marginBottom: 12, background: config.darkMode ? '#1a1325' : '#f9f0ff', borderRadius: 4, border: `1px solid ${config.darkMode ? '#301c4d' : '#d3adf7'}`, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><AimOutlined style={{ marginRight: 6 }} />已筛选节点，显示 {filteredFlowCount} 条相关流向</span>
                                    <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={() => dispatch(setSelectedLocation_tmp(null))}>清除筛选</Button>
                                </div>
                            )}
                            <Row gutters={4}>
                                <Col>
                                    <Dragger maxCount={1} beforeUpload={handleupload_traj}>
                                        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                                        <p className="ant-upload-text">点击或将数据拖到此处</p>
                                        <p className="ant-upload-hint">
                                            支持 CSV（OD数据）和 GeoJSON（矢量图层）。OD数据需含 slon/slat/elon/elat 列，可选 count 和 time 列。
                                        </p>
                                    </Dragger>
                                </Col>
                            </Row>
                        </Panel>

                        {customlayers.length > 0 && (
                            <Panel header="图层" key="Layers">
                                <Table size='small' columns={[
                                    { title: 'ID', dataIndex: 'id', key: 'id' },
                                    { title: '类型', dataIndex: 'type', key: 'type' },
                                ]} dataSource={customlayers.map(l => ({ id: l.id, type: l.props.type }))} pagination={false} />
                            </Panel>
                        )}

                        <Panel header="OD设置" key="Settings">
                            <Form {...{ labelCol: { span: 16 }, wrapperCol: { span: 8 } }}
                                size="small" name="basic" layout='inline'
                                form={form2} initialValues={config}
                                autoComplete="off" onValuesChange={handleconfigchange}>
                                <Title level={4}>基础设置</Title>
                                <Row gutters={4}>
                                    <Col span={24}>
                                        <Form.Item label="颜色" name="colorScheme">
                                            <Select defaultValue='Blues' dropdownMatchSelectWidth={240} optionLabelProp="label">
                                                {Object.keys(COLOR_SCHEMES).map(v => (
                                                    <Option key={v} value={v} label={v}><ColorSwatch scheme={v} /></Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={24}><Form.Item label="透明度" name="opacity"><Slider min={0} max={1} step={0.01} value={typeof config.opacity === 'number' ? config.opacity : 0} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="动画特效" name="animationEnabled"><Switch size="small" checked={config.animationEnabled} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="显示节点" name="locationTotalsEnabled"><Switch size="small" checked={config.locationTotalsEnabled} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="暗色模式" name="darkMode"><Switch size="small" checked={config.darkMode} /></Form.Item></Col>
                                </Row>
                                <Divider />
                                <Title level={4}>聚类</Title>
                                <Row gutters={4}>
                                    <Col span={24}><Form.Item label="是否聚类" name="clusteringEnabled"><Switch size="small" checked={config.clusteringEnabled} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="自动聚类参数" name="clusteringAuto"><Switch size="small" checked={config.clusteringAuto} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="聚类层数" name="clusteringLevel"><Slider min={0} max={20} step={1} value={typeof config.clusteringLevel === 'number' ? config.clusteringLevel : 0} /></Form.Item></Col>
                                    <Divider />
                                    <Title level={4}>褪色</Title>
                                    <Col span={24}><Form.Item label="是否褪色" name="fadeEnabled"><Switch size="small" checked={config.fadeEnabled} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="褪色透明" name="fadeOpacityEnabled"><Switch size="small" checked={config.fadeOpacityEnabled} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="褪色比例" name="fadeAmount"><Slider min={0} max={100} step={0.1} value={typeof config.fadeAmount === 'number' ? config.fadeAmount : 0} /></Form.Item></Col>
                                </Row>
                            </Form>
                        </Panel>

                        <Panel header="导出与分享" key="Export">
                            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                <Button icon={<ShareAltOutlined />} block
                                    onClick={() => {
                                        copyShareUrl({ config, viewState, mapStyle: traj.mapStyle, globalDark: traj.globalDark, selectedLocation })
                                            .then(() => message.success('分享链接已复制到剪贴板'))
                                            .catch(() => message.error('复制失败'));
                                    }}>
                                    复制分享链接
                                </Button>
                                <Button icon={<Html5Outlined />} block
                                    onClick={() => {
                                        exportStandaloneHtml(locations, flows, config, viewState, traj.mapStyle);
                                        message.success('独立 HTML 文件已导出');
                                    }}
                                    disabled={flows.length === 0}>
                                    导出为独立 HTML
                                </Button>
                                <Divider style={{ margin: '4px 0' }} />
                                <Button icon={<CameraOutlined />} block
                                    onClick={() => { const ok = exportScreenshot(); message[ok ? 'success' : 'warning'](ok ? '截图已保存' : '截图失败'); }}
                                    disabled={locations.length === 0}>
                                    地图截图
                                </Button>
                                <Button icon={<DownloadOutlined />} block
                                    onClick={() => { exportFlowsAsCSV(flows, locations); message.success('已导出 CSV'); }}
                                    disabled={flows.length === 0}>
                                    导出 OD 数据（CSV）
                                </Button>
                                <Button icon={<DownloadOutlined />} block
                                    onClick={() => { downloadJSON(flows, 'flows'); downloadJSON(locations, 'locations'); message.success('已导出 JSON'); }}
                                    disabled={flows.length === 0}>
                                    导出原始数据（JSON）
                                </Button>
                                <Divider style={{ margin: '4px 0' }} />
                                <Button icon={<SettingOutlined />} block onClick={() => { exportConfig(config); message.success('配置已导出'); }}>导出当前配置</Button>
                                <Button icon={<UploadOutlined />} block
                                    onClick={() => { importConfig().then(i => { setconfig({ ...config, ...i }); message.success('配置已导入'); }).catch(e => message.error('失败: ' + e)); }}>
                                    导入配置文件
                                </Button>
                            </Space>
                        </Panel>
                    </Collapse>
                </Card>
            </Col>

            {/* 字段映射弹窗 */}
            <Modal key="model" title="数据预览与字段映射"
                width='80vw' visible={isModalVisible}
                onOk={settraj} onCancel={() => { setisModalVisible(false); setDataLoading(false); }}
                okText="确认导入" cancelText="取消">
                <Form {...{ labelCol: { span: 8 }, wrapperCol: { span: 0 } }}
                    name="fieldMapping" form={form} autoComplete="off">
                    <Row gutter={8}>
                        <Col span={4}><Form.Item name="SLON" label="slon"><Select style={{ width: 100 }}>{tableinfo.columns.map(v => <Option key={v.key} value={v.key}>{v.key}</Option>)}</Select></Form.Item></Col>
                        <Col span={4}><Form.Item name="SLAT" label="slat"><Select style={{ width: 100 }}>{tableinfo.columns.map(v => <Option key={v.key} value={v.key}>{v.key}</Option>)}</Select></Form.Item></Col>
                        <Col span={4}><Form.Item name="ELON" label="elon"><Select style={{ width: 100 }}>{tableinfo.columns.map(v => <Option key={v.key} value={v.key}>{v.key}</Option>)}</Select></Form.Item></Col>
                        <Col span={4}><Form.Item name="ELAT" label="elat"><Select style={{ width: 100 }}>{tableinfo.columns.map(v => <Option key={v.key} value={v.key}>{v.key}</Option>)}</Select></Form.Item></Col>
                        <Col span={4}><Form.Item name="COUNT" label="count"><Select style={{ width: 100 }}>{[...tableinfo.columns, { key: '=1' }].map(v => <Option key={v.key} value={v.key}>{v.key}</Option>)}</Select></Form.Item></Col>
                        <Col span={4}>
                            <Form.Item name="TIME" label={<Tooltip title="可选。指定时间列后可使用时间轴播放"><span><ClockCircleOutlined /> 时间</span></Tooltip>}>
                                <Select style={{ width: 100 }} allowClear placeholder="无">
                                    {tableinfo.columns.map(v => <Option key={v.key} value={v.key}>{v.key}</Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
                {tableinfo.totalRows > PREVIEW_LIMIT && (
                    <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>
                        共 {tableinfo.totalRows.toLocaleString()} 行，预览前 {PREVIEW_LIMIT} 行
                    </div>
                )}
                <Table columns={tableinfo.columns} dataSource={tableinfo.data}
                    rowKey={() => nanoid()} scroll={{ x: '100%', y: 300 }} size='small'
                    pagination={false}
                    style={{ overflowX: 'auto', overflowY: 'auto' }} />
            </Modal>
        </>
    )
}
