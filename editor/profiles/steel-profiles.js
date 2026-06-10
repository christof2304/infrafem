// steel-profiles.js — EN 10365 standard rolled steel sections
// dims in mm, A in cm², I in cm⁴, W in cm³, It in cm⁴

export const PROFILE_CATEGORIES = [
    { id: 'IPE',  label: 'IPE',  shape: 'I' },
    { id: 'HEB',  label: 'HEB',  shape: 'I' },
    { id: 'HEA',  label: 'HEA',  shape: 'I' },
    { id: 'HEM',  label: 'HEM',  shape: 'I' },
    { id: 'UPN',  label: 'UPN',  shape: 'U' },
    { id: 'SREC', label: '▭ Rechteck', shape: 'RECT' },
    { id: 'SCIR', label: '● Kreis',    shape: 'CIRC' },
    { id: 'TUBE', label: '○ Rohr',     shape: 'TUBE' },
];

// Rolled I-sections — IPE (EN 10365)
export const IPE = [
    { name: 'IPE 80',  h:  80, b:  46, tw: 3.8, tf:  5.2, A:  7.64, Iy:    80.1, Iz:    8.49, Wply:   23.2, Wplz:   5.82, It: 0.70 },
    { name: 'IPE 100', h: 100, b:  55, tw: 4.1, tf:  5.7, A: 10.3,  Iy:   171,   Iz:   15.9,  Wply:   39.4, Wplz:   8.93, It: 1.20 },
    { name: 'IPE 120', h: 120, b:  64, tw: 4.4, tf:  6.3, A: 13.2,  Iy:   318,   Iz:   27.7,  Wply:   60.7, Wplz:  13.6,  It: 1.74 },
    { name: 'IPE 140', h: 140, b:  73, tw: 4.7, tf:  6.9, A: 16.4,  Iy:   541,   Iz:   44.9,  Wply:   88.3, Wplz:  19.2,  It: 2.45 },
    { name: 'IPE 160', h: 160, b:  82, tw: 5.0, tf:  7.4, A: 20.1,  Iy:   869,   Iz:   68.3,  Wply:  124,   Wplz:  26.1,  It: 3.60 },
    { name: 'IPE 180', h: 180, b:  91, tw: 5.3, tf:  8.0, A: 23.9,  Iy:  1320,   Iz:  101,    Wply:  166,   Wplz:  34.6,  It: 4.79 },
    { name: 'IPE 200', h: 200, b: 100, tw: 5.6, tf:  8.5, A: 28.5,  Iy:  1940,   Iz:  142,    Wply:  221,   Wplz:  44.6,  It: 6.98 },
    { name: 'IPE 220', h: 220, b: 110, tw: 5.9, tf:  9.2, A: 33.4,  Iy:  2770,   Iz:  205,    Wply:  285,   Wplz:  58.1,  It: 9.07 },
    { name: 'IPE 240', h: 240, b: 120, tw: 6.2, tf:  9.8, A: 39.1,  Iy:  3890,   Iz:  284,    Wply:  367,   Wplz:  73.9,  It: 12.9  },
    { name: 'IPE 270', h: 270, b: 135, tw: 6.6, tf: 10.2, A: 45.9,  Iy:  5790,   Iz:  420,    Wply:  484,   Wplz:  96.4,  It: 15.9  },
    { name: 'IPE 300', h: 300, b: 150, tw: 7.1, tf: 10.7, A: 53.8,  Iy:  8360,   Iz:  604,    Wply:  628,   Wplz: 125,    It: 20.1  },
    { name: 'IPE 330', h: 330, b: 160, tw: 7.5, tf: 11.5, A: 62.6,  Iy: 11770,   Iz:  788,    Wply:  804,   Wplz: 154,    It: 28.2  },
    { name: 'IPE 360', h: 360, b: 170, tw: 8.0, tf: 12.7, A: 72.7,  Iy: 16270,   Iz: 1040,    Wply: 1020,   Wplz: 191,    It: 37.3  },
    { name: 'IPE 400', h: 400, b: 180, tw: 8.6, tf: 13.5, A: 84.5,  Iy: 23130,   Iz: 1320,    Wply: 1310,   Wplz: 229,    It: 51.1  },
    { name: 'IPE 450', h: 450, b: 190, tw: 9.4, tf: 14.6, A: 98.8,  Iy: 33740,   Iz: 1680,    Wply: 1702,   Wplz: 276,    It: 66.9  },
    { name: 'IPE 500', h: 500, b: 200, tw:10.2, tf: 16.0, A:116,    Iy: 48200,   Iz: 2140,    Wply: 2194,   Wplz: 336,    It: 89.3  },
    { name: 'IPE 550', h: 550, b: 210, tw:11.1, tf: 17.2, A:134,    Iy: 67120,   Iz: 2668,    Wply: 2787,   Wplz: 400,    It: 123   },
    { name: 'IPE 600', h: 600, b: 220, tw:12.0, tf: 19.0, A:156,    Iy: 92080,   Iz: 3390,    Wply: 3512,   Wplz: 485,    It: 165   },
];

// Wide-flange I-sections — HEB (EN 10365)
export const HEB = [
    { name: 'HEB 100', h: 100, b: 100, tw:  6.0, tf: 10.0, A:  26.0, Iy:   450,   Iz:  167,   Wply:  104,   Wplz:  51.4,  It: 9.66  },
    { name: 'HEB 120', h: 120, b: 120, tw:  6.5, tf: 11.0, A:  34.0, Iy:   864,   Iz:  318,   Wply:  165,   Wplz:  80.9,  It: 13.8  },
    { name: 'HEB 140', h: 140, b: 140, tw:  7.0, tf: 12.0, A:  43.0, Iy:  1510,   Iz:  550,   Wply:  245,   Wplz: 120,    It: 20.1  },
    { name: 'HEB 160', h: 160, b: 160, tw:  8.0, tf: 13.0, A:  54.3, Iy:  2490,   Iz:  889,   Wply:  354,   Wplz: 170,    It: 31.2  },
    { name: 'HEB 180', h: 180, b: 180, tw:  8.5, tf: 14.0, A:  65.3, Iy:  3830,   Iz: 1360,   Wply:  481,   Wplz: 231,    It: 42.2  },
    { name: 'HEB 200', h: 200, b: 200, tw:  9.0, tf: 15.0, A:  78.1, Iy:  5700,   Iz: 2000,   Wply:  642,   Wplz: 305,    It: 59.3  },
    { name: 'HEB 220', h: 220, b: 220, tw:  9.5, tf: 16.0, A:  91.0, Iy:  8090,   Iz: 2840,   Wply:  827,   Wplz: 395,    It: 76.6  },
    { name: 'HEB 240', h: 240, b: 240, tw: 10.0, tf: 17.0, A: 106,   Iy: 11260,   Iz: 3920,   Wply: 1053,   Wplz: 498,    It: 103   },
    { name: 'HEB 260', h: 260, b: 260, tw: 10.0, tf: 17.5, A: 118,   Iy: 14920,   Iz: 5130,   Wply: 1283,   Wplz: 602,    It: 124   },
    { name: 'HEB 280', h: 280, b: 280, tw: 10.5, tf: 18.0, A: 131,   Iy: 19270,   Iz: 6590,   Wply: 1534,   Wplz: 718,    It: 143   },
    { name: 'HEB 300', h: 300, b: 300, tw: 11.0, tf: 19.0, A: 149,   Iy: 25170,   Iz: 8560,   Wply: 1869,   Wplz: 870,    It: 185   },
    { name: 'HEB 320', h: 320, b: 300, tw: 11.5, tf: 20.5, A: 161,   Iy: 30820,   Iz: 9240,   Wply: 2149,   Wplz: 939,    It: 225   },
    { name: 'HEB 340', h: 340, b: 300, tw: 12.0, tf: 21.5, A: 171,   Iy: 36660,   Iz: 9690,   Wply: 2408,   Wplz: 983,    It: 255   },
    { name: 'HEB 360', h: 360, b: 300, tw: 12.5, tf: 22.5, A: 181,   Iy: 43190,   Iz:10140,   Wply: 2683,   Wplz:1032,    It: 292   },
    { name: 'HEB 400', h: 400, b: 300, tw: 13.5, tf: 24.0, A: 198,   Iy: 57680,   Iz:10820,   Wply: 3232,   Wplz:1104,    It: 356   },
    { name: 'HEB 450', h: 450, b: 300, tw: 14.0, tf: 26.0, A: 218,   Iy: 79890,   Iz:11720,   Wply: 4146,   Wplz:1198,    It: 441   },
    { name: 'HEB 500', h: 500, b: 300, tw: 14.5, tf: 28.0, A: 239,   Iy:107200,   Iz:12620,   Wply: 5013,   Wplz:1292,    It: 551   },
    { name: 'HEB 550', h: 550, b: 300, tw: 15.0, tf: 29.0, A: 254,   Iy:136700,   Iz:13080,   Wply: 5891,   Wplz:1342,    It: 622   },
    { name: 'HEB 600', h: 600, b: 300, tw: 15.5, tf: 30.0, A: 270,   Iy:171000,   Iz:13530,   Wply: 6997,   Wplz:1391,    It: 704   },
    { name: 'HEB 650', h: 650, b: 300, tw: 16.0, tf: 31.0, A: 286,   Iy:210600,   Iz:13980,   Wply: 8205,   Wplz:1441,    It: 796   },
    { name: 'HEB 700', h: 700, b: 300, tw: 17.0, tf: 32.0, A: 306,   Iy:256900,   Iz:14440,   Wply: 9535,   Wplz:1495,    It: 915   },
    { name: 'HEB 800', h: 800, b: 300, tw: 17.5, tf: 33.0, A: 334,   Iy:359100,   Iz:14900,   Wply:12890,   Wplz:1553,    It:1090   },
    { name: 'HEB 900', h: 900, b: 300, tw: 18.5, tf: 35.0, A: 371,   Iy:494100,   Iz:15820,   Wply:17080,   Wplz:1671,    It:1370   },
    { name: 'HEB 1000',h:1000, b: 300, tw: 19.0, tf: 36.0, A: 400,   Iy:644700,   Iz:16270,   Wply:21900,   Wplz:1741,    It:1560   },
];

// Wide-flange I-sections — HEA (EN 10365)
export const HEA = [
    { name: 'HEA 100', h:  96, b: 100, tw:  5.0, tf:  8.0, A:  21.2, Iy:   349,   Iz:  134,   Wply:   83.0, Wplz:  40.3,  It: 5.24  },
    { name: 'HEA 120', h: 114, b: 120, tw:  5.0, tf:  8.0, A:  25.3, Iy:   606,   Iz:  231,   Wply:  119,   Wplz:  58.8,  It: 5.99  },
    { name: 'HEA 140', h: 133, b: 140, tw:  5.5, tf:  8.5, A:  31.4, Iy:  1033,   Iz:  389,   Wply:  173,   Wplz:  85.6,  It: 8.13  },
    { name: 'HEA 160', h: 152, b: 160, tw:  6.0, tf:  9.0, A:  38.8, Iy:  1673,   Iz:  616,   Wply:  245,   Wplz: 117,    It: 12.0  },
    { name: 'HEA 180', h: 171, b: 180, tw:  6.0, tf:  9.5, A:  45.3, Iy:  2510,   Iz:  925,   Wply:  325,   Wplz: 156,    It: 14.8  },
    { name: 'HEA 200', h: 190, b: 200, tw:  6.5, tf: 10.0, A:  53.8, Iy:  3690,   Iz: 1340,   Wply:  430,   Wplz: 204,    It: 20.6  },
    { name: 'HEA 220', h: 210, b: 220, tw:  7.0, tf: 11.0, A:  64.3, Iy:  5410,   Iz: 1960,   Wply:  568,   Wplz: 272,    It: 28.5  },
    { name: 'HEA 240', h: 230, b: 240, tw:  7.5, tf: 12.0, A:  76.8, Iy:  7760,   Iz: 2770,   Wply:  744,   Wplz: 352,    It: 40.9  },
    { name: 'HEA 260', h: 250, b: 260, tw:  7.5, tf: 12.5, A:  86.8, Iy: 10450,   Iz: 3670,   Wply:  919,   Wplz: 430,    It: 46.4  },
    { name: 'HEA 280', h: 270, b: 280, tw:  8.0, tf: 13.0, A:  97.3, Iy: 13670,   Iz: 4760,   Wply: 1112,   Wplz: 518,    It: 57.5  },
    { name: 'HEA 300', h: 290, b: 300, tw:  8.5, tf: 14.0, A: 112,   Iy: 18260,   Iz: 6310,   Wply: 1383,   Wplz: 641,    It: 85.2  },
    { name: 'HEA 320', h: 310, b: 300, tw:  9.0, tf: 15.5, A: 124,   Iy: 22930,   Iz: 6985,   Wply: 1628,   Wplz: 709,    It: 109   },
    { name: 'HEA 340', h: 330, b: 300, tw:  9.5, tf: 16.5, A: 133,   Iy: 27690,   Iz: 7440,   Wply: 1850,   Wplz: 755,    It: 124   },
    { name: 'HEA 360', h: 350, b: 300, tw: 10.0, tf: 17.5, A: 143,   Iy: 33090,   Iz: 7890,   Wply: 2088,   Wplz: 801,    It: 143   },
    { name: 'HEA 400', h: 390, b: 300, tw: 11.0, tf: 19.0, A: 159,   Iy: 45070,   Iz: 8560,   Wply: 2562,   Wplz: 870,    It: 185   },
    { name: 'HEA 450', h: 440, b: 300, tw: 11.5, tf: 21.0, A: 178,   Iy: 63720,   Iz: 9465,   Wply: 3216,   Wplz: 965,    It: 248   },
    { name: 'HEA 500', h: 490, b: 300, tw: 12.0, tf: 23.0, A: 198,   Iy: 86970,   Iz:10370,   Wply: 3949,   Wplz:1059,    It: 323   },
    { name: 'HEA 550', h: 540, b: 300, tw: 12.5, tf: 24.0, A: 212,   Iy:111900,   Iz:10820,   Wply: 4622,   Wplz:1104,    It: 371   },
    { name: 'HEA 600', h: 590, b: 300, tw: 13.0, tf: 25.0, A: 226,   Iy:141200,   Iz:11270,   Wply: 5466,   Wplz:1149,    It: 425   },
    { name: 'HEA 650', h: 640, b: 300, tw: 13.5, tf: 26.0, A: 241,   Iy:175200,   Iz:11720,   Wply: 6385,   Wplz:1198,    It: 490   },
    { name: 'HEA 700', h: 690, b: 300, tw: 14.5, tf: 27.0, A: 260,   Iy:215300,   Iz:12180,   Wply: 7480,   Wplz:1250,    It: 566   },
    { name: 'HEA 800', h: 790, b: 300, tw: 15.0, tf: 28.0, A: 286,   Iy:303400,   Iz:12640,   Wply: 9988,   Wplz:1302,    It: 631   },
    { name: 'HEA 900', h: 890, b: 300, tw: 16.0, tf: 30.0, A: 321,   Iy:422100,   Iz:13550,   Wply:13550,   Wplz:1403,    It: 811   },
    { name: 'HEA 1000',h: 990, b: 300, tw: 16.5, tf: 31.0, A: 347,   Iy:553800,   Iz:14000,   Wply:17110,   Wplz:1453,    It: 920   },
];

// Wide-flange I-sections — HEM (EN 10365, heavy series)
export const HEM = [
    { name: 'HEM 100', h: 120, b: 106, tw: 12.0, tf: 20.0, A:  53.2, Iy:  1140,   Iz:  399,   Wply:  220,   Wplz: 115,    It: 66.8  },
    { name: 'HEM 120', h: 140, b: 126, tw: 12.5, tf: 21.0, A:  66.4, Iy:  2020,   Iz:  703,   Wply:  330,   Wplz: 171,    It: 93.8  },
    { name: 'HEM 140', h: 160, b: 146, tw: 13.0, tf: 22.0, A:  80.6, Iy:  3290,   Iz: 1150,   Wply:  471,   Wplz: 240,    It: 127   },
    { name: 'HEM 160', h: 180, b: 166, tw: 14.0, tf: 23.0, A:  97.1, Iy:  5100,   Iz: 1760,   Wply:  649,   Wplz: 325,    It: 166   },
    { name: 'HEM 180', h: 200, b: 186, tw: 14.5, tf: 24.0, A: 113,   Iy:  7480,   Iz: 2490,   Wply:  857,   Wplz: 421,    It: 207   },
    { name: 'HEM 200', h: 220, b: 206, tw: 15.0, tf: 25.0, A: 131,   Iy: 10640,   Iz: 3650,   Wply: 1100,   Wplz: 549,    It: 256   },
    { name: 'HEM 220', h: 240, b: 226, tw: 15.5, tf: 26.0, A: 149,   Iy: 14600,   Iz: 5010,   Wply: 1382,   Wplz: 690,    It: 310   },
    { name: 'HEM 240', h: 270, b: 248, tw: 18.0, tf: 32.0, A: 200,   Iy: 24290,   Iz: 8153,   Wply: 2030,   Wplz:1007,    It: 620   },
    { name: 'HEM 260', h: 290, b: 268, tw: 18.0, tf: 32.5, A: 220,   Iy: 31310,   Iz:10450,   Wply: 2434,   Wplz:1192,    It: 717   },
    { name: 'HEM 280', h: 310, b: 288, tw: 18.5, tf: 33.0, A: 240,   Iy: 39550,   Iz:13160,   Wply: 2887,   Wplz:1396,    It: 804   },
    { name: 'HEM 300', h: 340, b: 310, tw: 21.0, tf: 39.0, A: 303,   Iy: 59200,   Iz:19400,   Wply: 3972,   Wplz:1913,    It:1540   },
    { name: 'HEM 320', h: 359, b: 309, tw: 21.0, tf: 40.0, A: 312,   Iy: 68130,   Iz:19710,   Wply: 4340,   Wplz:1949,    It:1680   },
    { name: 'HEM 340', h: 377, b: 309, tw: 21.0, tf: 40.0, A: 316,   Iy: 76370,   Iz:19710,   Wply: 4659,   Wplz:1949,    It:1710   },
    { name: 'HEM 360', h: 395, b: 308, tw: 21.0, tf: 40.0, A: 320,   Iy: 84870,   Iz:19520,   Wply: 4978,   Wplz:1932,    It:1730   },
    { name: 'HEM 400', h: 432, b: 307, tw: 21.0, tf: 40.0, A: 326,   Iy:104100,   Iz:19150,   Wply: 5543,   Wplz:1900,    It:1800   },
    { name: 'HEM 450', h: 478, b: 307, tw: 21.0, tf: 40.0, A: 335,   Iy:131500,   Iz:18850,   Wply: 6326,   Wplz:1869,    It:1870   },
    { name: 'HEM 500', h: 524, b: 306, tw: 21.0, tf: 40.0, A: 344,   Iy:161900,   Iz:18520,   Wply: 7102,   Wplz:1837,    It:1940   },
    { name: 'HEM 550', h: 572, b: 306, tw: 21.0, tf: 40.0, A: 354,   Iy:198000,   Iz:18520,   Wply: 7933,   Wplz:1837,    It:2030   },
    { name: 'HEM 600', h: 620, b: 305, tw: 21.0, tf: 40.0, A: 364,   Iy:237400,   Iz:18190,   Wply: 8758,   Wplz:1806,    It:2110   },
    { name: 'HEM 650', h: 668, b: 305, tw: 21.0, tf: 40.0, A: 374,   Iy:281700,   Iz:18190,   Wply: 9499,   Wplz:1806,    It:2200   },
    { name: 'HEM 700', h: 716, b: 304, tw: 21.0, tf: 40.0, A: 383,   Iy:329300,   Iz:17870,   Wply:10290,   Wplz:1773,    It:2280   },
    { name: 'HEM 800', h: 814, b: 303, tw: 21.0, tf: 40.0, A: 404,   Iy:442600,   Iz:17550,   Wply:12640,   Wplz:1757,    It:2450   },
    { name: 'HEM 900', h: 910, b: 302, tw: 21.0, tf: 40.0, A: 423,   Iy:570400,   Iz:17240,   Wply:15400,   Wplz:1741,    It:2590   },
    { name: 'HEM 1000',h:1008, b: 302, tw: 21.0, tf: 40.0, A: 444,   Iy:722300,   Iz:17240,   Wply:18840,   Wplz:1741,    It:2770   },
];

// U-sections — UPN (EN 10365)
export const UPN = [
    { name: 'UPN 80',  h:  80, b: 45, tw: 6.0, tf:  8.0, A: 11.0,  Iy:   106,   Iz:  19.4,  Wply:  31.6,  Wplz:  11.0,  It: 3.09  },
    { name: 'UPN 100', h: 100, b: 50, tw: 6.0, tf:  8.5, A: 13.5,  Iy:   206,   Iz:  29.3,  Wply:  48.6,  Wplz:  14.8,  It: 3.82  },
    { name: 'UPN 120', h: 120, b: 55, tw: 7.0, tf:  9.0, A: 17.0,  Iy:   364,   Iz:  43.2,  Wply:  72.6,  Wplz:  19.7,  It: 5.71  },
    { name: 'UPN 140', h: 140, b: 60, tw: 7.0, tf: 10.0, A: 20.4,  Iy:   605,   Iz:  62.7,  Wply:  103,   Wplz:  26.3,  It: 7.84  },
    { name: 'UPN 160', h: 160, b: 65, tw: 7.5, tf: 10.5, A: 24.0,  Iy:   925,   Iz:  85.3,  Wply:  138,   Wplz:  32.5,  It: 10.1  },
    { name: 'UPN 180', h: 180, b: 70, tw: 8.0, tf: 11.0, A: 28.0,  Iy:  1350,   Iz:  114,   Wply:  179,   Wplz:  40.5,  It: 13.3  },
    { name: 'UPN 200', h: 200, b: 75, tw: 8.5, tf: 11.5, A: 32.2,  Iy:  1910,   Iz:  148,   Wply:  229,   Wplz:  49.0,  It: 17.1  },
    { name: 'UPN 220', h: 220, b: 80, tw: 9.0, tf: 12.5, A: 37.4,  Iy:  2690,   Iz:  197,   Wply:  291,   Wplz:  59.6,  It: 23.8  },
    { name: 'UPN 240', h: 240, b: 85, tw: 9.5, tf: 13.0, A: 42.3,  Iy:  3600,   Iz:  248,   Wply:  358,   Wplz:  72.2,  It: 29.5  },
    { name: 'UPN 260', h: 260, b: 90, tw:10.0, tf: 14.0, A: 48.3,  Iy:  4820,   Iz:  317,   Wply:  439,   Wplz:  87.8,  It: 38.7  },
    { name: 'UPN 280', h: 280, b: 95, tw:10.0, tf: 15.0, A: 53.3,  Iy:  6280,   Iz:  399,   Wply:  528,   Wplz: 104,    It: 50.0  },
    { name: 'UPN 300', h: 300, b:100, tw:10.0, tf: 16.0, A: 58.8,  Iy:  8030,   Iz:  495,   Wply:  632,   Wplz: 123,    It: 62.2  },
    { name: 'UPN 320', h: 320, b:100, tw:14.0, tf: 17.5, A: 75.8,  Iy: 10870,   Iz:  597,   Wply:  826,   Wplz: 141,    It: 122   },
    { name: 'UPN 350', h: 350, b:100, tw:14.0, tf: 16.0, A: 77.3,  Iy: 12840,   Iz:  570,   Wply:  883,   Wplz: 131,    It: 116   },
    { name: 'UPN 380', h: 380, b:102, tw:13.5, tf: 16.0, A: 80.4,  Iy: 15760,   Iz:  615,   Wply: 1006,   Wplz: 138,    It: 117   },
    { name: 'UPN 400', h: 400, b:110, tw:14.0, tf: 18.0, A: 91.5,  Iy: 20350,   Iz:  846,   Wply: 1228,   Wplz: 178,    It: 170   },
];

// Profile map for lookup
export const PROFILES = { IPE, HEB, HEA, HEM, UPN };

/**
 * Find a profile by name across all categories.
 * Returns { category, profile } or null.
 */
export function findProfile(name) {
    for (const [cat, list] of Object.entries(PROFILES)) {
        const p = list.find(x => x.name === name);
        if (p) return { category: cat, profile: p };
    }
    return null;
}

/**
 * Get section properties for Stabileo (SI-compatible, base units m/m²/m⁴).
 * A: m², Iy/Iz: m⁴
 */
export function profileToStabileoProps(profile) {
    return {
        A:  profile.A  * 1e-4,    // cm² → m²
        Iy: profile.Iy * 1e-8,    // cm⁴ → m⁴
        Iz: profile.Iz * 1e-8,
    };
}

/**
 * SOFiSTiK AQUA QST designation string for a profile name.
 * "IPE 200" → QST nr MNR x DESI "IPE 200"
 */
export function profileToSofiDesig(profileName) {
    return `"${profileName}"`;
}
