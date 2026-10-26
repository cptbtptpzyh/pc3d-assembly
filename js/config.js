/* ============================================================
 * config.js — 部件数据 / 变体 / 主题（Lead 维护）
 * 只包含数据，不含逻辑。builders 只读。
 * 所有长度单位：1 ≈ 25cm（机箱外框 X 1.0 × Y 1.96 × Z 1.16）
 * ========================================================== */
(function () {
  'use strict';
  var PC3D = (window.PC3D = window.PC3D || {});

  var C = {};

  C.theme = {
    bg: 0x05070d,
    accent: 0x38e8ff,
    accent2: 0xa45bff,
    warn: 0xff8a3d,
    ok: 0x4ade80,
    panel: 0x0b111b
  };

  /** 展示顺序（左侧清单） */
  C.order = ['case', 'motherboard', 'cpu', 'cooler', 'ram', 'gpu', 'ssd', 'psu', 'fans'];

  /* 拆解方向约定（世界坐标）：
   * -X = 侧透玻璃方向（默认相机在 -X 侧）
   * +Z = 机箱前面板 */
  C.components = {

    /* ================= 机箱 ================= */
    case: {
      id: 'case', index: 0, name: '机箱', en: 'PC Chassis', icon: '▣',
      category: '承载结构', role: '容纳并固定全部硬件，决定风道与扩展空间',
      color: 0x6b7683,
      mount: { p: [0, 0, 0] },
      explode: { dir: [0, 0, 1.55], dist: 1.45 },
      previewVariant: 0,
      variants: [
        {
          model: '联力 O11 Dynamic EVO 中塔机箱', short: 'O11D EVO', brand: 'LIAN LI', price: '¥ 999',
          specs: [
            { k: '尺寸', v: '466 × 272 × 465 mm' }, { k: '材质', v: '钢 / 铝 / 双面钢化玻璃' },
            { k: '主板支持', v: 'E-ATX / ATX / M-ATX / ITX' }, { k: '显卡限长', v: '426 mm' },
            { k: '散热限高', v: '167 mm' }, { k: '风扇位', v: '顶部 3×120 / 侧 3×120 / 底部 3×120' },
            { k: '硬盘位', v: '2× 3.5" + 2× 2.5"' }, { k: '特色', v: '双腔体结构 / 可换向布局 / 双面玻璃' }
          ],
          highlights: ['双腔体结构，电源与硬盘独立散热', '左中右三面玻璃一览无余', '支持立装显卡（需扩展套件）'],
          desc: '联力 O11 Dynamic EVO 是海景房机箱的代表作。双腔体布局让电源、硬盘完全隐藏于背仓，正面三面玻璃呈现"全透明"硬件展示效果，内部空间宽裕，支持双 360 冷排与立装显卡。',
          params: { w: 1.0, h: 1.96, d: 1.16, glassLeft: true, glassFront: false, frontStyle: 'mesh', feet: 3, color: 0x15181d, pillar: false }
        },
        {
          model: '追风者 XT523 View 全塔机箱', short: 'XT523 View', brand: 'PHANTEKS', price: '¥ 1,499',
          specs: [
            { k: '尺寸', v: '520 × 240 × 550 mm' }, { k: '材质', v: '钢 / 钢化玻璃 / 铝饰条' },
            { k: '主板支持', v: 'E-ATX / ATX / M-ATX / ITX' }, { k: '显卡限长', v: '450 mm' },
            { k: '散热限高', v: '180 mm' }, { k: '风扇位', v: '顶部 3×140 / 前 3×140 / 后 1×140' },
            { k: '硬盘位', v: '2× 3.5" + 4× 2.5"' }, { k: '特色', v: '前置大面积通风 / 上下双仓分离' }
          ],
          highlights: ['前置透气网孔，风阻极低', '顶部 420 冷排免工具拆装', '厚钢板 + 铝制铭牌质感'],
          desc: '追风者 XT523 View 在通风与展示之间取得平衡：前面板大面积网孔保证进风量，侧透玻璃展示内部灯效，全塔尺寸可容纳 420mm 冷排与 450mm 长显卡。',
          params: { w: 1.02, h: 2.1, d: 1.2, glassLeft: true, glassFront: false, frontStyle: 'honeycomb', feet: 4, color: 0x1a1e24, pillar: true }
        },
        {
          model: '乔思伯 D31 Mesh 中塔机箱', short: 'D31 Mesh', brand: 'JONSBO', price: '¥ 479',
          specs: [
            { k: '尺寸', v: '440 × 205 × 452 mm' }, { k: '材质', v: '钢 / 钢化玻璃' },
            { k: '主板支持', v: 'ATX / M-ATX / ITX' }, { k: '显卡限长', v: '360 mm' },
            { k: '散热限高', v: '170 mm' }, { k: '风扇位', v: '前 3×120 / 顶 2×120 / 后 1×120' },
            { k: '硬盘位', v: '2× 3.5" + 2× 2.5"' }, { k: '特色', v: '性价比 / 免工具侧板 / 前面板快拆' }
          ],
          highlights: ['百元价位的高完成度做工', '前面板快拆，清灰方便', '支持 ATX 主板 + 360 冷排'],
          desc: '乔思伯 D31 Mesh 以亲民价格提供完整的中塔体验：免工具侧板、快拆前面板、可装 360 冷排，是主流装机的高性价比选择。',
          params: { w: 0.86, h: 1.8, d: 1.02, glassLeft: true, glassFront: false, frontStyle: 'mesh', feet: 4, color: 0x101216, pillar: false }
        }
      ]
    },

    /* ================= 主板 ================= */
    motherboard: {
      id: 'motherboard', index: 1, name: '主板', en: 'Motherboard', icon: '▤',
      category: '承载结构', role: '连接并供电所有部件，是整机的"神经系统"',
      color: 0x3b7f52,
      mount: { p: [0.30, 0.10, 0.02] },
      explode: { dir: [-1, 0, 0], dist: 1.25 },
      previewVariant: 0,
      variants: [
        {
          model: 'ASUS ROG STRIX B650E-E GAMING WIFI', short: 'STRIX B650E-E', brand: 'ASUS', price: '¥ 2,499',
          specs: [
            { k: '芯片组', v: 'AMD B650E (AM5)' }, { k: '版型', v: 'ATX 305 × 244 mm' },
            { k: '供电', v: '16+2+2 相 80A DrMOS' }, { k: '内存', v: '4× DDR5 最高 128GB / 8000+ OC' },
            { k: 'PCIe', v: '1× PCIe 5.0 x16 / 1× PCIe 4.0 x16' }, { k: 'M.2', v: '4× M.2（1× PCIe 5.0 x4）' },
            { k: '网络', v: '2.5G 有线 + WiFi 6E' }, { k: '接口', v: 'USB4 ×2 / USB 3.2 Gen2 ×6' }
          ],
          highlights: ['PCIe 5.0 显卡与 M.2 双通道', '16+2+2 相供电，i9/9 系锐龙都能稳住', '板载 USB4 与 WiFi 6E'],
          desc: 'ROG STRIX B650E-E 是 AM5 平台中高端之选：PCIe 5.0 x16 显卡插槽与 PCIe 5.0 M.2 双 5.0 通道，16+2+2 相 80A 供电足以应对 Ryzen 9，另配 2.5G 网卡与 WiFi 6E。',
          params: { form: 'ATX', socket: 'AM5', chipset: 'B650E', m2: 4, pcie: 3, vrmHeatsink: true, ioShield: true, color: 0x1a1d22, brand: 'rog' }
        },
        {
          model: 'MSI MAG Z790 TOMAHAWK WIFI', short: 'Z790 TOMAHAWK', brand: 'MSI', price: '¥ 2,199',
          specs: [
            { k: '芯片组', v: 'Intel Z790 (LGA1700)' }, { k: '版型', v: 'ATX 305 × 244 mm' },
            { k: '供电', v: '16+1+1 相 90A DrMOS' }, { k: '内存', v: '4× DDR5 最高 192GB / 7800 OC' },
            { k: 'PCIe', v: '1× PCIe 5.0 x16 / 2× PCIe 4.0 x16' }, { k: 'M.2', v: '4× M.2（均带散热片）' },
            { k: '网络', v: '2.5G 有线 + WiFi 7' }, { k: '接口', v: 'USB 3.2 Gen2x2 ×2 / Thunderbolt 4 扩展' }
          ],
          highlights: ['16+1+1 相 90A 供电', '4 个 M.2 全覆盖散热装甲', 'WiFi 7 + 2.5G 双网'],
          desc: 'MSI MAG Z790 TOMAHAWK WIFI 面向 14 代酷睿高性能平台：16+1+1 相 90A DrMOS 供电、四条 DDR5 插槽最高 7800MHz OC、4 个 M.2 全部覆盖散热装甲，扩展能力扎实。',
          params: { form: 'ATX', socket: 'LGA1700', chipset: 'Z790', m2: 4, pcie: 4, vrmHeatsink: true, ioShield: true, color: 0x232830, brand: 'msi' }
        },
        {
          model: '技嘉 B760M AORUS ELITE AX', short: 'B760M AORUS', brand: 'GIGABYTE', price: '¥ 1,099',
          specs: [
            { k: '芯片组', v: 'Intel B760 (LGA1700)' }, { k: '版型', v: 'M-ATX 244 × 244 mm' },
            { k: '供电', v: '12+1+1 相' }, { k: '内存', v: '4× DDR5 最高 128GB / 7600 OC' },
            { k: 'PCIe', v: '1× PCIe 4.0 x16' }, { k: 'M.2', v: '2× M.2（均带散热片）' },
            { k: '网络', v: '2.5G 有线 + WiFi 6E' }, { k: '接口', v: 'USB 3.2 Gen2 ×4' }
          ],
          highlights: ['M-ATX 小体积大扩展', '12+1+1 相供电够用', '双 M.2 + WiFi 6E'],
          desc: '技嘉 B760M AORUS ELITE AX 是紧凑装机的热门选择：244mm 见方的 M-ATX 板型塞下双 M.2、2.5G 网卡与 WiFi 6E，12+1+1 相供电可满足 i5/i7 的日常与游戏负载。',
          params: { form: 'MATX', socket: 'LGA1700', chipset: 'B760', m2: 2, pcie: 2, vrmHeatsink: true, ioShield: true, color: 0x2a2f38, brand: 'aorus' }
        }
      ]
    },

    /* ================= CPU ================= */
    cpu: {
      id: 'cpu', index: 2, name: 'CPU 处理器', en: 'Processor', icon: '▦',
      category: '计算核心', role: '执行全部计算指令，决定整机的通用性能',
      color: 0x4f8fd6,
      mount: { p: [0.28, 0.30, 0.02] },
      explode: { dir: [-1, 0.32, 0], dist: 1.75 },
      previewVariant: 0,
      variants: [
        {
          model: 'Intel Core i9-14900K', short: 'i9-14900K', brand: 'Intel', price: '¥ 4,299',
          specs: [
            { k: '插槽', v: 'LGA 1700' }, { k: '核心/线程', v: '24 (8P + 16E) / 32' },
            { k: '频率', v: 'P 核 3.2–6.0 GHz / E 核 2.4–4.4 GHz' }, { k: 'L3 缓存', v: '36 MB' },
            { k: 'TDP', v: '125 W（PL2 253 W）' }, { k: '内存', v: 'DDR5-5600 / DDR4-3200' },
            { k: '核显', v: 'UHD 770' }, { k: '工艺', v: 'Intel 7' }
          ],
          highlights: ['单核睿频 6.0GHz', '24 核 32 线程生产力强', '需要强散热：建议 360 水冷'],
          desc: 'i9-14900K 是 LGA1700 平台的旗舰：8 个性能核 + 16 个能效核共 24 核 32 线程，单核睿频可达 6.0GHz，游戏与内容创作双强，但满载功耗高，需要 360 水冷压制。',
          params: { socket: 'LGA1700', cores: 24, threads: 32, ihs: 'metal', cache: 'LGA1700', color: 0x1f242b, dieColor: 0x2a2f3a }
        },
        {
          model: 'AMD Ryzen 7 7800X3D', short: 'R7 7800X3D', brand: 'AMD', price: '¥ 2,899',
          specs: [
            { k: '插槽', v: 'AM5' }, { k: '核心/线程', v: '8 / 16' },
            { k: '频率', v: '4.2–5.0 GHz' }, { k: 'L3 缓存', v: '96 MB（3D V-Cache）' },
            { k: 'TDP', v: '120 W' }, { k: '内存', v: 'DDR5-5200（EXPO）' },
            { k: '核显', v: 'Radeon Graphics 2CU' }, { k: '工艺', v: 'TSMC 5nm' }
          ],
          highlights: ['96MB 3D V-Cache，游戏神U', '120W 功耗易于散热', 'AM5 平台可长期升级'],
          desc: 'Ryzen 7 7800X3D 凭借 96MB 3D V-Cache 在游戏中表现极佳，仅 8 核却常压旗舰；120W 的功耗对散热要求低得多，是纯游戏装机的首选。',
          params: { socket: 'AM5', cores: 8, threads: 16, ihs: 'metal', cache: 'AM5', color: 0x24282f, dieColor: 0x2f3641 }
        },
        {
          model: 'Intel Core i5-14600KF', short: 'i5-14600KF', brand: 'Intel', price: '¥ 1,899',
          specs: [
            { k: '插槽', v: 'LGA 1700' }, { k: '核心/线程', v: '14 (6P + 8E) / 20' },
            { k: '频率', v: 'P 核 3.5–5.3 GHz / E 核 2.6–4.0 GHz' }, { k: 'L3 缓存', v: '24 MB' },
            { k: 'TDP', v: '125 W（PL2 181 W）' }, { k: '内存', v: 'DDR5-5600 / DDR4-3200' },
            { k: '核显', v: '无（F 系列）' }, { k: '工艺', v: 'Intel 7' }
          ],
          highlights: ['甜点价位 14 代酷睿', '5.3GHz 单核睿频', '无核显，需搭配独显'],
          desc: 'i5-14600KF 是主流装机的高性价比之选：6 个性能核 + 8 个能效核共 20 线程，单核睿频 5.3GHz，游戏性能接近 i7，价格却便宜不少。',
          params: { socket: 'LGA1700', cores: 14, threads: 20, ihs: 'metal', cache: 'LGA1700', color: 0x21262d, dieColor: 0x2b313b }
        }
      ]
    },

    /* ================= 散热器 ================= */
    cooler: {
      id: 'cooler', index: 3, name: '散热器', en: 'CPU Cooler', icon: '❄',
      category: '散热系统', role: '带走 CPU 热量，决定能否维持高频不降频',
      color: 0x7fb3e8,
      mount: { p: [0.28, 0.30, 0.02] },
      explode: { dir: [-1, 0.3, 0], dist: 2.35 },
      previewVariant: 0,
      variants: [
        {
          model: 'NZXT Kraken Elite 360 RGB 一体式水冷', short: 'Kraken 360', brand: 'NZXT', price: '¥ 1,899',
          specs: [
            { k: '类型', v: '360mm 一体式水冷' }, { k: '冷排尺寸', v: '394 × 121 × 27 mm' },
            { k: '风扇', v: '3× 120mm F120 RGB（500–1800 RPM）' }, { k: '水泵', v: 'Asetek 第 7 代' },
            { k: '屏幕', v: '2.72" LCD 240×240' }, { k: '噪��', v: '≤ 28 dBA' },
            { k: '兼容', v: 'LGA1700 / AM5 / AM4' }, { k: '质保', v: '6 年' }
          ],
          highlights: ['2.72 英寸 LCD 冷头屏', '360 冷排压制旗舰 CPU', 'F120 RGB 风扇联动灯效'],
          desc: 'Kraken Elite 360 RGB 是 NZXT 的旗舰一体水冷：360mm 冷排 + 第七代 Asetek 水泵，冷头集成 2.72 英寸 LCD 屏幕可显示温度或自定义画面，适合侧透机箱展示。',
          params: { type: 'aio', radiator: 360, fans: 3, fanSize: 0.155, tube: 0.026, block: 0.19, rgb: true }
        },
        {
          model: '猫头鹰 NH-D15 chromax.black 双塔风冷', short: 'NH-D15', brand: 'Noctua', price: '¥ 999',
          specs: [
            { k: '类型', v: '双塔双风扇风冷' }, { k: '尺寸', v: '150 × 165 × 161 mm' },
            { k: '热管', v: '6 × 6mm 镀镍铜管' }, { k: '风扇', v: '2× NF-A15 PWM（1500 RPM）' },
            { k: '鳍片', v: '铝制，共 2 × 46 片' }, { k: '噪音', v: '≤ 24.6 dBA' },
            { k: '兼容', v: 'LGA1700 / AM5' }, { k: '质保', v: '6 年' }
          ],
          highlights: ['风冷标杆，压 i9 也不虚', '全黑化 chromax 版本', '噪音仅 24.6dBA'],
          desc: 'NH-D15 是风冷散热器的传奇：双塔结构、6 根 6mm 镀镍热管、两只 NF-A15 风扇，性能接近 240 水冷却只需风冷维护成本，chromax.black 全黑化更配深色机箱。',
          params: { type: 'air', towers: 2, heatpipes: 6, finCount: 46, fanSize: 0.15, height: 0.63, rgb: false }
        },
        {
          model: '利民 PA120 SE 双塔风冷', short: 'PA120 SE', brand: 'Thermalright', price: '¥ 199',
          specs: [
            { k: '类型', v: '双塔单/双风扇风冷' }, { k: '尺寸', v: '125 × 154 × 155 mm' },
            { k: '热管', v: '6 × 6mm 烧结铜管' }, { k: '风扇', v: 'TL-C12C（1550 RPM）' },
            { k: '鳍片', v: '铝制，2 × 50 片' }, { k: '噪音', v: '≤ 25.6 dBA' },
            { k: '兼容', v: 'LGA1700 / AM5' }, { k: '质保', v: '6 年' }
          ],
          highlights: ['百元级风冷王者', '双塔六热管', '压 i5/i7 足够'],
          desc: '利民 PA120 SE 以不到两百元的价格提供双塔六热管规格，压 i5-14600KF 之类的中端 CPU 完全够用，是预算装机的性价比之选。',
          params: { type: 'air', towers: 2, heatpipes: 6, finCount: 50, fanSize: 0.13, height: 0.60, rgb: false }
        }
      ]
    },

    /* ================= 内存 ================= */
    ram: {
      id: 'ram', index: 4, name: '内存', en: 'Memory', icon: '▥',
      category: '存储', role: '存放 CPU 正在处理的数据，容量与频率影响多任务与帧率',
      color: 0x9b6cf0,
      mount: { p: [0.24, 0.30, -0.18] },
      explode: { dir: [-1, 0.62, 0], dist: 1.5 },
      previewVariant: 0,
      variants: [
        {
          model: '芝奇 Trident Z5 RGB DDR5-6000 32GB (16G×2)', short: 'Trident Z5 RGB', brand: 'G.SKILL', price: '¥ 899',
          specs: [
            { k: '容量', v: '32GB (16GB × 2)' }, { k: '频率', v: 'DDR5-6000 CL30' },
            { k: '时序', v: '30-38-38-96' }, { k: '电压', v: '1.35V' },
            { k: '马甲', v: '铝合金 + RGB 导光条' }, { k: '高度', v: '42 mm' },
            { k: 'EXPO/XMP', v: 'AMD EXPO + Intel XMP 3.0' }, { k: '质保', v: '终身' }
          ],
          highlights: ['DDR5-6000 CL30 甜点频率', 'RGB 导光条可同步主板灯效', 'EXPO/XMP 一键超频'],
          desc: 'Trident Z5 RGB 是 DDR5 时代的高频代表：6000MHz CL30 是 AM5 平台的甜点频率，铝合金马甲搭配顶部 RGB 导光条，颜值与性能兼顾。',
          params: { sticks: 2, height: 0.052, armor: 'rgb', ddr: 5, color: 0x22262e, led: 0xa45bff }
        },
        {
          model: '金士顿 FURY Beast DDR5-5600 32GB (16G×2)', short: 'FURY Beast', brand: 'Kingston', price: '¥ 549',
          specs: [
            { k: '容量', v: '32GB (16GB × 2)' }, { k: '频率', v: 'DDR5-5600 CL36' },
            { k: '时序', v: '36-38-38' }, { k: '电压', v: '1.25V' },
            { k: '马甲', v: '低矮黑色铝制' }, { k: '高度', v: '34 mm' },
            { k: 'XMP', v: 'Intel XMP 3.0' }, { k: '质保', v: '终身' }
          ],
          highlights: ['低矮马甲不挡风冷', '5600MHz 即插即用', '终身质保'],
          desc: 'FURY Beast DDR5-5600 采用 34mm 低矮马甲，兼容大型风冷散热器，5600MHz 无需复杂设置即可稳定运行，是务实装机的好选择。',
          params: { sticks: 2, height: 0.034, armor: 'low', ddr: 5, color: 0x1a1d22, led: null }
        },
        {
          model: '海盗船 VENGEANCE RGB DDR5-6400 32GB (16G×2)', short: 'VENGEANCE RGB', brand: 'CORSAIR', price: '¥ 799',
          specs: [
            { k: '容量', v: '32GB (16GB × 2)' }, { k: '频率', v: 'DDR5-6400 CL32' },
            { k: '时序', v: '32-40-40-84' }, { k: '电压', v: '1.40V' },
            { k: '马甲', v: '阳极氧化铝 + 10 区 RGB' }, { k: '高度', v: '44 mm' },
            { k: 'EXPO/XMP', v: 'Intel XMP 3.0 / EXPO' }, { k: '质保', v: '终身' }
          ],
          highlights: ['6400MHz 高频', '10 区独立 RGB', 'Capellix LED 高亮度'],
          desc: 'VENGEANCE RGB DDR5-6400 主打高频与灯效：6400MHz CL32 的性能释放更强，顶部 10 区 RGB 灯效层次丰富，适合追求灯效与性能的玩家。',
          params: { sticks: 2, height: 0.044, armor: 'rgb', ddr: 5, color: 0x22252b, led: 0x38e8ff }
        }
      ]
    },

    /* ================= 显卡 ================= */
    gpu: {
      id: 'gpu', index: 5, name: '显卡', en: 'Graphics Card', icon: '▤',
      category: '图形核心', role: '负责全部画面渲染，是游戏帧率的第一决定因素',
      color: 0x3ddc97,
      mount: { p: [0.18, -0.12, 0.06] },
      explode: { dir: [-1, -0.18, 0.55], dist: 1.9 },
      previewVariant: 0,
      variants: [
        {
          model: 'NVIDIA GeForce RTX 4090 Founders Edition', short: 'RTX 4090 FE', brand: 'NVIDIA', price: '¥ 12,999',
          specs: [
            { k: '显存', v: '24GB GDDR6X 384-bit' }, { k: 'CUDA 核心', v: '16384' },
            { k: '加速频率', v: '2.52 GHz' }, { k: '显存带宽', v: '1008 GB/s' },
            { k: '功耗', v: '450 W（建议 850W 电源）' }, { k: '供电', v: '12VHPWR ×1' },
            { k: '输出', v: 'DP 1.4a ×3 + HDMI 2.1' }, { k: '尺寸', v: '304 × 137 × 61 mm（3 槽）' }
          ],
          highlights: ['4K 光追天花板', '24GB 大显存适合 AI 创作', '三槽厚双轴向风扇'],
          desc: 'RTX 4090 是 Ada Lovelace 架构的旗舰：16384 个 CUDA 核心、24GB GDDR6X 显存与 1008GB/s 带宽，4K 光追全开依旧从容，同时也是本地 AI 推理的热门选择。',
          params: { length: 1.22, height: 0.55, thickness: 0.25, fans: 2, slots: 3, power: '12VHPWR', backplate: true, rgb: false, color: 0x24282e }
        },
        {
          model: 'AMD Radeon RX 7900 XTX 24GB', short: 'RX 7900 XTX', brand: 'AMD', price: '¥ 7,499',
          specs: [
            { k: '显存', v: '24GB GDDR6 384-bit' }, { k: '流处理器', v: '6144' },
            { k: '加速频率', v: '2.50 GHz' }, { k: '显存带宽', v: '960 GB/s' },
            { k: '功耗', v: '355 W（建议 800W 电源）' }, { k: '供电', v: '8pin ×2' },
            { k: '输出', v: 'DP 2.1 ×2 + HDMI 2.1' }, { k: '尺寸', v: '287 × 123 × 51 mm（2.5 槽）' }
          ],
          highlights: ['24GB 显存大带宽', 'DP 2.1 支持 8K 输出', 'RDNA3 光栅性能强'],
          desc: 'RX 7900 XTX 是 AMD RDNA3 旗舰：24GB GDDR6 与 960GB/s 带宽，光栅性能强劲，DisplayPort 2.1 支持高刷 8K，适合不喜欢光追但看重传统性能的玩家。',
          params: { length: 1.15, height: 0.5, thickness: 0.21, fans: 3, slots: 3, power: '8pin x2', backplate: true, rgb: true, color: 0x1e2126 }
        },
        {
          model: '影驰 RTX 4060 Ti 8GB 金属大师', short: 'RTX 4060 Ti', brand: 'GALAX', price: '¥ 2,899',
          specs: [
            { k: '显存', v: '8GB GDDR6 128-bit' }, { k: 'CUDA 核心', v: '4352' },
            { k: '加速频率', v: '2.54 GHz' }, { k: '显存带宽', v: '288 GB/s' },
            { k: '功耗', v: '160 W（建议 550W 电源）' }, { k: '供电', v: '8pin ×1' },
            { k: '输出', v: 'DP 1.4a ×3 + HDMI 2.1' }, { k: '尺寸', v: '240 × 120 × 41 mm（2 槽）' }
          ],
          highlights: ['1080P/2K 高帧甜点', '160W 低功耗', '支持 DLSS 3 帧生成'],
          desc: 'RTX 4060 Ti 8GB 面向 1080P/2K 主流游戏：160W 的低功耗对电源和机箱要求不高，DLSS 3 帧生成在支持的游戏中可显著提升帧率。',
          params: { length: 0.98, height: 0.46, thickness: 0.165, fans: 2, slots: 2, power: '8pin', backplate: true, rgb: true, color: 0x2a2e35 }
        }
      ]
    },

    /* ================= 固态硬盘 ================= */
    ssd: {
      id: 'ssd', index: 6, name: '固态硬盘', en: 'NVMe SSD', icon: '▬',
      category: '存储', role: '存放系统与游戏，直接影响加载速度与响应',
      color: 0xf0a44c,
      mount: { p: [0.245, 0.02, 0.16] },
      explode: { dir: [-1, 0, 0.28], dist: 1.5 },
      previewVariant: 0,
      variants: [
        {
          model: '三星 990 PRO 2TB PCIe 4.0', short: '990 PRO 2TB', brand: 'Samsung', price: '¥ 1,199',
          specs: [
            { k: '容量', v: '2TB' }, { k: '接口', v: 'M.2 2280 PCIe 4.0 x4 / NVMe 2.0' },
            { k: '顺序读取', v: '7,450 MB/s' }, { k: '顺序写入', v: '6,900 MB/s' },
            { k: '随机 IOPS', v: '1400K / 1550K' }, { k: '闪存', v: '三星第 8 代 V-NAND TLC' },
            { k: 'TBW', v: '1,200 TBW' }, { k: '质保', v: '5 年' }
          ],
          highlights: ['7450MB/s 满速 PCIe 4.0', '自研主控与闪存', '游戏加载几乎无感'],
          desc: '三星 990 PRO 是 PCIe 4.0 的顶级产品：顺序读取 7450MB/s，自研主控 + 第八代 V-NAND，长时间高负载下性能衰减控制优秀，适合系统盘与大型游戏。',
          params: { capacity: '2TB', heatsink: true, thickness: 0.075, rgb: false, color: 0x2a2f37 }
        },
        {
          model: '致态 TiPlus7100 1TB', short: 'TiPlus7100', brand: 'ZHITAI', price: '¥ 459',
          specs: [
            { k: '容量', v: '1TB' }, { k: '接口', v: 'M.2 2280 PCIe 4.0 x4' },
            { k: '顺序读取', v: '7,000 MB/s' }, { k: '顺序写入', v: '6,000 MB/s' },
            { k: '随机 IOPS', v: '900K / 700K' }, { k: '闪存', v: '长江存储 Xtacking 3.0 TLC' },
            { k: 'TBW', v: '600 TBW' }, { k: '质保', v: '5 年' }
          ],
          highlights: ['国产颗粒高素质', '7000MB/s 读取', '性价比出色'],
          desc: '致态 TiPlus7100 采用长江存储 Xtacking 3.0 架构颗粒，7000MB/s 的读取速度在日常使用中与顶级产品差距不大，价格却友好得多。',
          params: { capacity: '1TB', heatsink: false, thickness: 0.03, rgb: false, color: 0x1d2126 }
        },
        {
          model: '西部数据 SN850X 2TB（带散热片）', short: 'SN850X 2TB', brand: 'WD_BLACK', price: '¥ 999',
          specs: [
            { k: '容量', v: '2TB' }, { k: '接口', v: 'M.2 2280 PCIe 4.0 x4' },
            { k: '顺序读取', v: '7,300 MB/s' }, { k: '顺序写入', v: '6,600 MB/s' },
            { k: '随机 IOPS', v: '1200K / 1100K' }, { k: '闪存', v: 'BiCS5 TLC' },
            { k: 'TBW', v: '1,200 TBW' }, { k: '质保', v: '5 年' }
          ],
          highlights: ['原厂散热片可选', '游戏模式 2.0 优化加载', '大容量游戏仓库盘'],
          desc: 'WD_BLACK SN850X 主打游戏场景：7300MB/s 读取与 Game Mode 2.0 预测加载，2TB 容量适合作为大型游戏的仓库盘，带散热片版本长时间写入更稳定。',
          params: { capacity: '2TB', heatsink: true, thickness: 0.09, rgb: false, color: 0x232830 }
        }
      ]
    },

    /* ================= 电源 ================= */
    psu: {
      id: 'psu', index: 7, name: '电源', en: 'Power Supply', icon: '⚡',
      category: '供电', role: '为全部部件提供稳定电力，是整机稳定性的地基',
      color: 0xffc857,
      mount: { p: [0.10, -0.74, -0.10] },
      explode: { dir: [0, -1, -0.25], dist: 1.55 },
      previewVariant: 0,
      variants: [
        {
          model: '海韵 FOCUS GX-1000 ATX 3.0 金牌全模', short: 'FOCUS GX-1000', brand: 'Seasonic', price: '¥ 1,299',
          specs: [
            { k: '额定功率', v: '1000 W' }, { k: '认证', v: '80PLUS 金牌' },
            { k: '规范', v: 'ATX 3.0 / PCIe 5.0' }, { k: '尺寸', v: '140 × 150 × 86 mm' },
            { k: '风扇', v: '135mm FDB 智能温控' }, { k: '电容', v: '全日系 105℃' },
            { k: '接口', v: '12VHPWR ×1 / PCIe 8pin ×4 / SATA ×10' }, { k: '质保', v: '10 年' }
          ],
          highlights: ['ATX 3.0 原生 12VHPWR', '金牌效率 + 全日系电容', '10 年质保'],
          desc: '海韵 FOCUS GX-1000 是 ATX 3.0 时代的高端电源：原生 12VHPWR 接口直连 RTX 40 系显卡，金牌效率配合全日系电容与 10 年质保，属于"一次买好"的选择。',
          params: { power: 1000, fan: 0.155, modular: true, atx3: true, connectors: 8, color: 0x1b1e23 }
        },
        {
          model: '振华 LEADEX III 850W 金牌全模', short: 'LEADEX III 850', brand: 'Super Flower', price: '¥ 799',
          specs: [
            { k: '额定功率', v: '850 W' }, { k: '认证', v: '80PLUS 金牌' },
            { k: '规范', v: 'ATX 3.0' }, { k: '尺寸', v: '150 × 160 × 86 mm' },
            { k: '风扇', v: '130mm 双滚珠' }, { k: '电容', v: '日系固态 + 电解' },
            { k: '接口', v: '12VHPWR ×1 / PCIe 8pin ×4' }, { k: '质保', v: '10 年' }
          ],
          highlights: ['金牌效率、单路 +12V 输出', '全模组扁平线材', '10 年质保'],
          desc: '振华 LEADEX III 850W 以扎实的用料提供稳定输出，全模组设计便于理线，850W 功率覆盖 RTX 4080 级别配置，是性价比很高的金牌电源。',
          params: { power: 850, fan: 0.145, modular: true, atx3: true, connectors: 7, color: 0x191c21 }
        },
        {
          model: '长城 GX850 850W 金牌全模', short: 'GX850', brand: 'Great Wall', price: '¥ 549',
          specs: [
            { k: '额定功率', v: '850 W' }, { k: '认证', v: '80PLUS 金牌' },
            { k: '规范', v: 'ATX 3.0' }, { k: '尺寸', v: '150 × 160 × 86 mm' },
            { k: '风扇', v: '140mm 液压轴承' }, { k: '电容', v: '日系主电容' },
            { k: '接口', v: '12VHPWR ×1 / PCIe 8pin ×3' }, { k: '质保', v: '10 年' }
          ],
          highlights: ['价格友好的 850W 金牌', '原生 12V 线材', '全模组好理线'],
          desc: '长城 GX850 以较低的价位提供 850W 金牌全模组规格，原生 12VHPWR 线材省去转接烦恼，适合预算有限但需要大功率的装机方案。',
          params: { power: 850, fan: 0.15, modular: true, atx3: true, connectors: 6, color: 0x1d2025 }
        }
      ]
    },

    /* ================= 机箱风扇 ================= */
    fans: {
      id: 'fans', index: 8, name: '机箱风扇', en: 'Case Fans', icon: '✳',
      category: '散热系统', role: '建立机箱风道，把冷空气送进来、热空气排出去',
      color: 0x4ad2c8,
      mount: { p: [0, 0, 0] },
      explode: { dir: [0, 0, 1], dist: 1.9 },
      previewVariant: 0,
      variants: [
        {
          model: '联力 UNI FAN SL120 V2 ×3', short: 'UNI FAN SL120', brand: 'LIAN LI', price: '¥ 799',
          specs: [
            { k: '尺寸', v: '120 × 120 × 28 mm' }, { k: '转速', v: '200–2000 RPM' },
            { k: '风量', v: '64.5 CFM' }, { k: '风压', v: '2.59 mmH₂O' },
            { k: '噪音', v: '≤ 29 dBA' }, { k: '轴承', v: '液压轴承' },
            { k: '灯效', v: '双环 A-RGB（可软件同步）' }, { k: '特色', v: '免线材串联 / 正反叶可选' }
          ],
          highlights: ['免线材串联，理线极简', '双环灯效辨识度高', '正反叶版本适配进出风'],
          desc: 'UNI FAN SL120 V2 采用模块化拼接设计，多把风扇之间无需线材连接，双环 A-RGB 灯效在深色机箱中极具辨识度，正反叶版本可自由搭配进风与排风。',
          params: { count: 3, size: 0.155, thickness: 0.05, blades: 7, rgb: true, frame: 0x1a1d22, rearCount: 1, reverse: false }
        },
        {
          model: '猫头鹰 NF-A12x25 PWM ×3', short: 'NF-A12x25', brand: 'Noctua', price: '¥ 649',
          specs: [
            { k: '尺寸', v: '120 × 120 × 25 mm' }, { k: '转速', v: '450–2000 RPM' },
            { k: '风量', v: '60.1 CFM' }, { k: '风压', v: '2.34 mmH₂O' },
            { k: '噪音', v: '≤ 22.6 dBA' }, { k: '轴承', v: 'SSO2 磁稳轴承' },
            { k: '灯效', v: '无' }, { k: '质保', v: '6 年' }
          ],
          highlights: ['风噪比之王', 'SSO2 轴承长治久安', '无灯但极致静音'],
          desc: 'NF-A12x25 是猫头鹰的招牌风扇：采用液晶聚合物扇叶与 SSO2 磁稳轴承，在同等噪音下提供更多风量，适合追求静音的装机方案。',
          params: { count: 3, size: 0.155, thickness: 0.05, blades: 9, rgb: false, frame: 0x3a3128, rearCount: 1, reverse: false }
        }
      ]
    }
  };

  /* 部件安装位（main 使用） */
  C.mounts = {
    case: { p: [0, 0, 0], r: [0, 0, 0] },
    motherboard: { p: [0.30, 0.10, 0.02], r: [0, 0, 0] },
    cpu: { p: [0.28, 0.30, 0.02], r: [0, 0, 0] },
    cooler: { p: [0.28, 0.30, 0.02], r: [0, 0, 0] },
    ram: { p: [0.24, 0.30, -0.18], r: [0, 0, 0] },
    gpu: { p: [0.18, -0.12, 0.06], r: [0, 0, 0] },
    ssd: { p: [0.245, 0.02, 0.16], r: [0, 0, 0] },
    psu: { p: [0.10, -0.74, -0.10], r: [0, 0, 0] },
    fans: { p: [0, 0, 0], r: [0, 0, 0] }
  };

  /* 默认相机机位（stage 使用） */
  C.camera = {
    position: [-3.15, 1.35, 2.55],
    target: [0, 0.02, 0],
    fov: 38,
    intro: [-5.6, 3.4, 5.2]
  };

  /* 引导步骤（ui 使用） */
  C.tour = [
    { title: '旋转视角', text: '按住鼠标左键拖动，即可 360° 环绕观察整机。', key: 'rotate' },
    { title: '缩放与平移', text: '滚轮缩放、右键拖动平移，靠近看清每一处细节。', key: 'zoom' },
    { title: '点选部件', text: '点击任意硬件，会出现发光轮廓并展开详情面板。', key: 'select' },
    { title: '一键拆解', text: '按 E 或点击「全部拆解」，部件会沿各自方向分离。', key: 'explode' },
    { title: '切换型号', text: '右侧型号胶囊可切换市场主流配件，几何体会实时重建。', key: 'variant' }
  ];

  /* 部件在清单中的关键词（详情卡展示用） */
  C.keyFacts = {
    case: ['风道设计', '显卡限长', '玻璃侧透'],
    motherboard: ['供电相数', 'PCIe 5.0', 'M.2 插槽'],
    cpu: ['核心线程', '睿频', '缓存'],
    cooler: ['散热形式', '噪音', '兼容性'],
    ram: ['频率时序', '容量', '灯效'],
    gpu: ['显存', '功耗', '接口'],
    ssd: ['顺序读写', '容量', 'TBW'],
    psu: ['额定功率', '认证', '质保'],
    fans: ['风量风压', '转速', '灯效']
  };

  PC3D.config = C;
})();
