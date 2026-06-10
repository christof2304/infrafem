// fem-examples.js — Vordefinierte Tragwerksbeispiele für den infraFEM Editor

export const FEM_EXAMPLES = [
    {
        name: 'Portalrahmen S355',
        desc: '20m Einfeldrahmen, HEM 700 Stützen, IPE 500 Riegel\nEigen- + Dachlast + Schnee, gelenkige Lagerung',
        systemType: 'RAHM',
        model: {
            version: 1,
            meta: { name: 'Portalrahmen S355', systemType: 'RAHM', gravityDirection: 'NEGZ', solver: 'sofistik' },
            materials: [{ id: 1, type: 'STAH', grade: 'S 355', label: 'S355' }],
            sections: [
                {
                    id: 1, type: 'QPRO', materialId: 1, params: {}, label: 'HEM 700',
                    profile: 'HEM 700', category: 'HEM',
                    dims: { h: 716, b: 304, tw: 21.0, tf: 40.0 },
                    props: { A: 383, Iy: 329300, Iz: 17870, Wply: 10290, Wplz: 1773, It: 2280 },
                },
                {
                    id: 2, type: 'QPRO', materialId: 1, params: {}, label: 'IPE 500',
                    profile: 'IPE 500', category: 'IPE',
                    dims: { h: 500, b: 200, tw: 10.2, tf: 16.0 },
                    props: { A: 116, Iy: 48200, Iz: 2140, Wply: 2194, Wplz: 336, It: 89.3 },
                },
            ],
            nodes: [
                { id: 1, x:  0, z: 0, support: 'PINNED' },
                { id: 2, x: 20, z: 0, support: 'PINNED' },
                { id: 3, x:  0, z: 7, support: 'NONE' },
                { id: 4, x: 20, z: 7, support: 'NONE' },
                { id: 5, x: 10, z: 8, support: 'NONE' },
            ],
            groups: [
                { id: 1, name: 'Stützen', color: '#5599dd' },
                { id: 2, name: 'Riegel',  color: '#dd9933' },
            ],
            beams: [
                { id: 1, nodeStart: 1, nodeEnd: 3, sectionId: 1, groupId: 1 },
                { id: 2, nodeStart: 2, nodeEnd: 4, sectionId: 1, groupId: 1 },
                { id: 3, nodeStart: 3, nodeEnd: 5, sectionId: 2, groupId: 2 },
                { id: 4, nodeStart: 4, nodeEnd: 5, sectionId: 2, groupId: 2 },
            ],
            areas: [], openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Dachlast g=4.4kN/m', type: 'G',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 3, direction: 'PZ', p1: -4.4, p2: -4.4 },
                        { type: 'BEAM_LINE', elementId: 4, direction: 'PZ', p1: -4.4, p2: -4.4 },
                    ],
                },
                {
                    id: 3, name: 'Schnee s=3.2kN/m', type: 'S',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 3, direction: 'PZ', p1: -3.2, p2: -3.2 },
                        { type: 'BEAM_LINE', elementId: 4, direction: 'PZ', p1: -3.2, p2: -3.2 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: 'Kragarm IPE 360',
        desc: '6m Kragarm, IPE 360, S355\nEigenlast + UDL + Einzellast am freien Ende',
        systemType: 'RAHM',
        model: {
            version: 1,
            meta: { name: 'Kragarm IPE 360', systemType: 'RAHM', solver: 'sofistik' },
            materials: [{ id: 1, type: 'STAH', grade: 'S 355', label: 'S355' }],
            sections: [
                {
                    id: 1, type: 'QPRO', materialId: 1, params: {}, label: 'IPE 360',
                    profile: 'IPE 360', category: 'IPE',
                    dims: { h: 360, b: 170, tw: 8.0, tf: 12.7 },
                    props: { A: 72.7, Iy: 16270, Iz: 1040, Wply: 1019, Wplz: 191, It: 37.3 },
                },
            ],
            nodes: [
                { id: 1, x: 0, z: 0, support: 'FIXED' },
                { id: 2, x: 6, z: 0, support: 'NONE' },
            ],
            groups: [{ id: 1, name: 'Kragarm', color: '#5599dd' }],
            beams: [
                { id: 1, nodeStart: 1, nodeEnd: 2, sectionId: 1, groupId: 1 },
            ],
            areas: [], openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Nutzlast q=20kN/m', type: 'Q',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 1, direction: 'PZ', p1: -20, p2: -20 },
                    ],
                },
                {
                    id: 3, name: 'Einzellast F=50kN', type: 'Q',
                    loads: [
                        { type: 'NODE_FORCE', nodeId: 2, direction: 'PZ', value: -50 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: 'Einfeldträger C30/37',
        desc: '10m Einfeldträger, 0.30×0.60m Rechteck, Beton C30/37\nEigenlast + Gleichlast',
        systemType: 'RAHM',
        model: {
            version: 1,
            meta: { name: 'Einfeldträger C30/37', systemType: 'RAHM', solver: 'sofistik' },
            materials: [{ id: 1, type: 'BETO', grade: 'C 30/37', label: 'C30/37' }],
            sections: [
                { id: 1, type: 'SREC', materialId: 1, params: { B: 0.30, H: 0.60 }, label: '30/60 cm' },
            ],
            nodes: [
                { id: 1, x:  0, z: 0, support: 'PINNED' },
                { id: 2, x: 10, z: 0, support: 'PINNED' },
            ],
            groups: [{ id: 1, name: 'Träger', color: '#cc8844' }],
            beams: [
                { id: 1, nodeStart: 1, nodeEnd: 2, sectionId: 1, groupId: 1 },
            ],
            areas: [], openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Nutzlast q=30kN/m', type: 'Q',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 1, direction: 'PZ', p1: -30, p2: -30 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: 'Zweifeldträger IPE 450',
        desc: '2×9m Durchlaufträger, IPE 450, S355\nVollast + ungünstige Stellung (Schachbrett)',
        systemType: 'RAHM',
        model: {
            version: 1,
            meta: { name: 'Zweifeldträger IPE 450', systemType: 'RAHM', solver: 'sofistik' },
            materials: [{ id: 1, type: 'STAH', grade: 'S 355', label: 'S355' }],
            sections: [
                {
                    id: 1, type: 'QPRO', materialId: 1, params: {}, label: 'IPE 450',
                    profile: 'IPE 450', category: 'IPE',
                    dims: { h: 450, b: 190, tw: 9.4, tf: 14.6 },
                    props: { A: 98.8, Iy: 33740, Iz: 1680, Wply: 1702, Wplz: 276, It: 66.9 },
                },
            ],
            nodes: [
                { id: 1, x:  0, z: 0, support: 'PINNED' },
                { id: 2, x:  9, z: 0, support: 'PINNED' },
                { id: 3, x: 18, z: 0, support: 'PINNED' },
            ],
            groups: [{ id: 1, name: 'Träger', color: '#5599dd' }],
            beams: [
                { id: 1, nodeStart: 1, nodeEnd: 2, sectionId: 1, groupId: 1 },
                { id: 2, nodeStart: 2, nodeEnd: 3, sectionId: 1, groupId: 1 },
            ],
            areas: [], openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Vollast q=20kN/m', type: 'Q',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 1, direction: 'PZ', p1: -20, p2: -20 },
                        { type: 'BEAM_LINE', elementId: 2, direction: 'PZ', p1: -20, p2: -20 },
                    ],
                },
                {
                    id: 3, name: 'Feld 1 q=20kN/m', type: 'Q',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 1, direction: 'PZ', p1: -20, p2: -20 },
                    ],
                },
                {
                    id: 4, name: 'Feld 2 q=20kN/m', type: 'Q',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 2, direction: 'PZ', p1: -20, p2: -20 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: 'Eingespannte Stütze HEB 300',
        desc: '5m eingespannte Stahlstütze, HEB 300, S355\nVertikallast + horizontale Windlast am Kopf',
        systemType: 'RAHM',
        model: {
            version: 1,
            meta: { name: 'Eingespannte Stütze HEB 300', systemType: 'RAHM', solver: 'sofistik' },
            materials: [{ id: 1, type: 'STAH', grade: 'S 355', label: 'S355' }],
            sections: [
                {
                    id: 1, type: 'QPRO', materialId: 1, params: {}, label: 'HEB 300',
                    profile: 'HEB 300', category: 'HEB',
                    dims: { h: 300, b: 300, tw: 11.0, tf: 19.0 },
                    props: { A: 149, Iy: 25170, Iz: 8560, Wply: 1869, Wplz: 870, It: 185 },
                },
            ],
            nodes: [
                { id: 1, x: 0, z: 0, support: 'FIXED' },
                { id: 2, x: 0, z: 5, support: 'NONE' },
            ],
            groups: [{ id: 1, name: 'Stütze', color: '#5599dd' }],
            beams: [
                { id: 1, nodeStart: 1, nodeEnd: 2, sectionId: 1, groupId: 1 },
            ],
            areas: [], openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Vertikallast N=500kN', type: 'G',
                    loads: [
                        { type: 'NODE_FORCE', nodeId: 2, direction: 'PZ', value: -500 },
                    ],
                },
                {
                    id: 3, name: 'Windlast H=50kN', type: 'W',
                    loads: [
                        { type: 'NODE_FORCE', nodeId: 2, direction: 'PX', value: 50 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: '2-geschossiger Rahmen S355',
        desc: '2-geschossiger 2D-Rahmen, 8m Spann, 2×3.5m\nHEA 300 Stützen, IPE 400 Riegel — Nutzlast + Wind',
        systemType: 'RAHM',
        model: {
            version: 1,
            meta: { name: '2-geschossiger Rahmen S355', systemType: 'RAHM', solver: 'sofistik' },
            materials: [{ id: 1, type: 'STAH', grade: 'S 355', label: 'S355' }],
            sections: [
                {
                    id: 1, type: 'QPRO', materialId: 1, params: {}, label: 'HEA 300',
                    profile: 'HEA 300', category: 'HEA',
                    dims: { h: 290, b: 300, tw: 8.5, tf: 14.0 },
                    props: { A: 112, Iy: 18260, Iz: 6310, Wply: 1383, Wplz: 641, It: 85.2 },
                },
                {
                    id: 2, type: 'QPRO', materialId: 1, params: {}, label: 'IPE 400',
                    profile: 'IPE 400', category: 'IPE',
                    dims: { h: 400, b: 180, tw: 8.6, tf: 13.5 },
                    props: { A: 84.5, Iy: 23130, Iz: 1318, Wply: 1307, Wplz: 229, It: 51.1 },
                },
            ],
            nodes: [
                { id: 1, x: 0, z: 0,   support: 'FIXED' },
                { id: 2, x: 8, z: 0,   support: 'FIXED' },
                { id: 3, x: 0, z: 3.5, support: 'NONE' },
                { id: 4, x: 8, z: 3.5, support: 'NONE' },
                { id: 5, x: 0, z: 7.0, support: 'NONE' },
                { id: 6, x: 8, z: 7.0, support: 'NONE' },
            ],
            groups: [
                { id: 1, name: 'Stützen', color: '#5599dd' },
                { id: 2, name: 'Riegel',  color: '#dd9933' },
            ],
            beams: [
                { id: 1, nodeStart: 1, nodeEnd: 3, sectionId: 1, groupId: 1 },
                { id: 2, nodeStart: 2, nodeEnd: 4, sectionId: 1, groupId: 1 },
                { id: 3, nodeStart: 3, nodeEnd: 4, sectionId: 2, groupId: 2 },
                { id: 4, nodeStart: 3, nodeEnd: 5, sectionId: 1, groupId: 1 },
                { id: 5, nodeStart: 4, nodeEnd: 6, sectionId: 1, groupId: 1 },
                { id: 6, nodeStart: 5, nodeEnd: 6, sectionId: 2, groupId: 2 },
            ],
            areas: [], openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Nutzlast q=15kN/m', type: 'Q',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 3, direction: 'PZ', p1: -15, p2: -15 },
                        { type: 'BEAM_LINE', elementId: 6, direction: 'PZ', p1: -15, p2: -15 },
                    ],
                },
                {
                    id: 3, name: 'Wind H=30kN/Geschoss', type: 'W',
                    loads: [
                        { type: 'NODE_FORCE', nodeId: 3, direction: 'PX', value: 30 },
                        { type: 'NODE_FORCE', nodeId: 5, direction: 'PX', value: 30 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: 'Einfeldplatte C25/30',
        desc: '8×6m Stahlbetonplatte, d=25cm, C25/30\nAllseitig gelenkig gelagert, Gleichlast q=5kN/m²',
        systemType: 'PLATTE',
        model: {
            version: 1,
            meta: { name: 'Einfeldplatte C25/30', systemType: 'PLATTE', solver: 'sofistik' },
            materials: [{ id: 1, type: 'BETO', grade: 'C 25/30', label: 'C25/30' }],
            sections: [],
            nodes: [
                { id: 1, x: 0, z: 0, support: 'NONE' },
                { id: 2, x: 8, z: 0, support: 'NONE' },
                { id: 3, x: 8, z: 6, support: 'NONE' },
                { id: 4, x: 0, z: 6, support: 'NONE' },
            ],
            groups: [],
            beams: [],
            areas: [
                {
                    id: 1,
                    boundaryNodeIds: [1, 2, 3, 4],
                    thickness: 0.25,
                    materialId: 1,
                    groupId: 0,
                    edgeSupports: ['PINNED', 'PINNED', 'PINNED', 'PINNED'],
                },
            ],
            openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Nutzlast q=5kN/m²', type: 'Q',
                    loads: [
                        { type: 'AREA_LOAD', areaId: 1, direction: 'PZZ', value: -5 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: '3-geschossiger Rahmen (Th. II)',
        desc: '3 Geschosse, 6m/3×3.5m, HEA 280 Stützen, IPE 360 Riegel, S355\nNutzlast + Wind — Theorie II. Ordnung (P-Delta)',
        systemType: 'RAHM',
        model: {
            version: 1,
            meta: { name: '3-geschossiger Rahmen TH2', systemType: 'RAHM', solver: 'sofistik' },
            materials: [{ id: 1, type: 'STAH', grade: 'S 355', label: 'S355' }],
            sections: [
                {
                    id: 1, type: 'QPRO', materialId: 1, params: {}, label: 'HEA 280',
                    profile: 'HEA 280', category: 'HEA',
                    dims: { h: 270, b: 280, tw: 8.0, tf: 13.0 },
                    props: { A: 97.3, Iy: 13670, Iz: 4763, Wply: 1112, Wplz: 518, It: 62.2 },
                },
                {
                    id: 2, type: 'QPRO', materialId: 1, params: {}, label: 'IPE 360',
                    profile: 'IPE 360', category: 'IPE',
                    dims: { h: 360, b: 170, tw: 8.0, tf: 12.7 },
                    props: { A: 72.7, Iy: 16270, Iz: 1040, Wply: 1019, Wplz: 191, It: 37.3 },
                },
            ],
            nodes: [
                { id: 1, x: 0, z:  0.0, support: 'FIXED' },
                { id: 2, x: 6, z:  0.0, support: 'FIXED' },
                { id: 3, x: 0, z:  3.5, support: 'NONE' },
                { id: 4, x: 6, z:  3.5, support: 'NONE' },
                { id: 5, x: 0, z:  7.0, support: 'NONE' },
                { id: 6, x: 6, z:  7.0, support: 'NONE' },
                { id: 7, x: 0, z: 10.5, support: 'NONE' },
                { id: 8, x: 6, z: 10.5, support: 'NONE' },
            ],
            groups: [
                { id: 1, name: 'Stützen', color: '#5599dd' },
                { id: 2, name: 'Riegel',  color: '#dd9933' },
            ],
            beams: [
                { id: 1, nodeStart: 1, nodeEnd: 3, sectionId: 1, groupId: 1 },
                { id: 2, nodeStart: 2, nodeEnd: 4, sectionId: 1, groupId: 1 },
                { id: 3, nodeStart: 3, nodeEnd: 4, sectionId: 2, groupId: 2 },
                { id: 4, nodeStart: 3, nodeEnd: 5, sectionId: 1, groupId: 1 },
                { id: 5, nodeStart: 4, nodeEnd: 6, sectionId: 1, groupId: 1 },
                { id: 6, nodeStart: 5, nodeEnd: 6, sectionId: 2, groupId: 2 },
                { id: 7, nodeStart: 5, nodeEnd: 7, sectionId: 1, groupId: 1 },
                { id: 8, nodeStart: 6, nodeEnd: 8, sectionId: 1, groupId: 1 },
                { id: 9, nodeStart: 7, nodeEnd: 8, sectionId: 2, groupId: 2 },
            ],
            areas: [], openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Nutzlast q=15kN/m', type: 'Q',
                    loads: [
                        { type: 'BEAM_LINE', elementId: 3, direction: 'PZ', p1: -15, p2: -15 },
                        { type: 'BEAM_LINE', elementId: 6, direction: 'PZ', p1: -15, p2: -15 },
                        { type: 'BEAM_LINE', elementId: 9, direction: 'PZ', p1: -15, p2: -15 },
                    ],
                },
                {
                    id: 3, name: 'Wind H=25kN/Geschoss', type: 'W',
                    loads: [
                        { type: 'NODE_FORCE', nodeId: 3, direction: 'PX', value: 25 },
                        { type: 'NODE_FORCE', nodeId: 5, direction: 'PX', value: 25 },
                        { type: 'NODE_FORCE', nodeId: 7, direction: 'PX', value: 25 },
                    ],
                },
            ],
            analysisSettings: { type: 'TH2' },
            meshSettings: { hmin: 0.5 },
        },
    },

    {
        name: 'Verbunddecke 6×8m',
        desc: '6×8m Betonplatte d=18cm (C30/37) + 2 IPE 450 Unterzüge (S355)\nAlle Ränder gelenkig — Aufbau- + Nutzlast',
        systemType: 'PLATTE',
        model: {
            version: 1,
            meta: { name: 'Verbunddecke 6×8m', systemType: 'PLATTE', solver: 'sofistik' },
            materials: [
                { id: 1, type: 'BETO', grade: 'C 30/37', label: 'C30/37' },
                { id: 2, type: 'STAH', grade: 'S 355',   label: 'S355' },
            ],
            sections: [
                {
                    id: 1, type: 'QPRO', materialId: 2, params: {}, label: 'IPE 450',
                    profile: 'IPE 450', category: 'IPE',
                    dims: { h: 450, b: 190, tw: 9.4, tf: 14.6 },
                    props: { A: 98.8, Iy: 33740, Iz: 1680, Wply: 1702, Wplz: 276, It: 66.9 },
                },
            ],
            nodes: [
                // Plate corners
                { id: 1, x: 0, z: 0, support: 'NONE' },
                { id: 2, x: 6, z: 0, support: 'NONE' },
                { id: 3, x: 6, z: 8, support: 'NONE' },
                { id: 4, x: 0, z: 8, support: 'NONE' },
                // Beam endpoints on plate boundary (bottom)
                { id: 5, x: 2, z: 0, support: 'NONE' },
                { id: 6, x: 4, z: 0, support: 'NONE' },
                // Beam endpoints on plate boundary (top)
                { id: 7, x: 2, z: 8, support: 'NONE' },
                { id: 8, x: 4, z: 8, support: 'NONE' },
            ],
            groups: [
                { id: 1, name: 'Unterzüge', color: '#5599dd' },
            ],
            // Secondary beams running lengthwise (z-direction, 8m span)
            beams: [
                { id: 1, nodeStart: 5, nodeEnd: 7, sectionId: 1, groupId: 1 },
                { id: 2, nodeStart: 6, nodeEnd: 8, sectionId: 1, groupId: 1 },
            ],
            areas: [
                {
                    id: 1,
                    // Boundary split to include beam endpoint nodes on plate edge
                    // → beams 5→7 and 6→8 are interior (not on boundary) → get STYP B
                    boundaryNodeIds: [1, 5, 6, 2, 3, 8, 7, 4],
                    thickness: 0.18,
                    materialId: 1,
                    groupId: 0,
                    edgeSupports: [
                        'PINNED', // bottom: 1→5
                        'PINNED', // bottom: 5→6
                        'PINNED', // bottom: 6→2
                        'PINNED', // right:  2→3
                        'PINNED', // top:    3→8
                        'PINNED', // top:    8→7
                        'PINNED', // top:    7→4
                        'PINNED', // left:   4→1
                    ],
                },
            ],
            openings: [],
            loadcases: [
                { id: 1, name: 'Eigengewicht', type: 'G', loads: [] },
                {
                    id: 2, name: 'Aufbaulast g=2kN/m²', type: 'G',
                    loads: [
                        { type: 'AREA_LOAD', areaId: 1, direction: 'PZZ', value: -2 },
                    ],
                },
                {
                    id: 3, name: 'Nutzlast q=3kN/m²', type: 'Q',
                    loads: [
                        { type: 'AREA_LOAD', areaId: 1, direction: 'PZZ', value: -3 },
                    ],
                },
            ],
            analysisSettings: { type: 'LINE' },
            meshSettings: { hmin: 0.4 },
        },
    },
];
