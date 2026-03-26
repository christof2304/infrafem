// cfd-testcases.js — Predefined cross-section test cases for CFD analysis
// Based on common bridge deck geometries and Dolfyn examples

export const CFD_TEST_CASES = [
    {
        name: "Flaches Rechteck 10:1",
        desc: "Klassischer Brückendecks-Querschnitt, B/H = 10",
        polygon: [[0, 0], [5, 0], [5, 0.5], [0, 0.5]],
        windSpeed: 20,
        meshSize: 0.15,
        farField: 15,
        expected: { cD: "~0.1-0.2", cL: "~0", cM: "~0" },
    },
    {
        name: "Quadrat",
        desc: "Stumpfer Querschnitt, starke Wirbelablösung",
        polygon: [[0, 0], [1, 0], [1, 1], [0, 1]],
        windSpeed: 20,
        meshSize: 0.05,
        farField: 20,
        expected: { cD: "~2.0", cL: "~0", cM: "~0" },
    },
    {
        name: "Hohlkasten schmal",
        desc: "Typischer Autobahnbrücken-Hohlkasten",
        polygon: [
            [0, 0], [12, 0], [12, 0.25], [11, 0.25],
            [10.5, 2.5], [1.5, 2.5], [1, 0.25], [0, 0.25],
        ],
        windSpeed: 25,
        meshSize: 0.3,
        farField: 15,
        expected: { cD: "~0.1-0.3", cL: "~0.1-0.5", cM: "~0.05" },
    },
    {
        name: "Hohlkasten breit",
        desc: "Breiter Hohlkasten mit Windnasen",
        polygon: [
            [-1, 0], [0, -0.5], [14, -0.5], [15, 0],
            [15, 0.3], [14, 0.3], [13, 3], [2, 3],
            [1, 0.3], [0, 0.3], [-1, 0.3],
        ],
        windSpeed: 30,
        meshSize: 0.3,
        farField: 12,
        expected: { cD: "~0.05-0.15", cL: "variable", cM: "~0.02" },
    },
    {
        name: "Plattenbalken T",
        desc: "T-förmiger Plattenbalken-Querschnitt",
        polygon: [
            [0, 0], [8, 0], [8, 0.3],
            [5.5, 0.3], [5.5, 2], [2.5, 2],
            [2.5, 0.3], [0, 0.3],
        ],
        windSpeed: 20,
        meshSize: 0.15,
        farField: 15,
        expected: { cD: "~0.5-1.0", cL: "~0.2-0.5", cM: "~0.1-0.3" },
    },
    {
        name: "Doppel-T Stahlträger",
        desc: "I-Profil, offener Querschnitt",
        polygon: [
            [0, 0], [3, 0], [3, 0.2],
            [1.8, 0.2], [1.8, 1.8], [3, 1.8],
            [3, 2], [0, 2], [0, 1.8],
            [1.2, 1.8], [1.2, 0.2], [0, 0.2],
        ],
        windSpeed: 20,
        meshSize: 0.08,
        farField: 20,
        expected: { cD: "~1.5-2.0", cL: "~0.5", cM: "~0.3" },
    },
    {
        name: "Kreiszylinder",
        desc: "Referenz: Re-abhängiger cD (~1.2 bei Re>10^5)",
        polygon: (() => {
            const pts = [];
            const n = 32;
            for (let i = 0; i < n; i++) {
                const a = 2 * Math.PI * i / n;
                pts.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]);
            }
            return pts;
        })(),
        windSpeed: 15,
        meshSize: 0.03,
        farField: 25,
        expected: { cD: "~1.0-1.2", cL: "~0 (mean)", cM: "~0" },
    },
    {
        name: "Seilbrücken-Deck",
        desc: "Aerodynamisch optimiertes Deck mit Windnasen",
        polygon: [
            [-0.5, 0], [0, -0.3], [15, -0.3], [15.5, 0],
            [15.5, 0.15], [15, 0.15], [14.5, 0.8],
            [0.5, 0.8], [0, 0.15], [-0.5, 0.15],
        ],
        windSpeed: 30,
        meshSize: 0.2,
        farField: 12,
        expected: { cD: "~0.05-0.1", cL: "~0.1", cM: "~0.02" },
    },
    {
        name: "Dreieck",
        desc: "Spitzer Querschnitt — asymmetrische Umströmung",
        polygon: [[0, 0], [4, 0], [2, 3]],
        windSpeed: 20,
        meshSize: 0.15,
        farField: 15,
        expected: { cD: "~1.5", cL: "~0.5", cM: "~0.3" },
    },

    // ── SOFiSTiK/Dolfyn Beispiele ──────────────────────────
    {
        name: "Harbour Bridge Deck (Dolfyn)",
        desc: "Sydney Harbour Bridge Querschnitt, B=22.95m, H=3.75m, α=0°",
        polygon: [
            [0.66, 0], [0.66, -1], [0.83, -1], [1, 0],
            [11, 0.2], [11.17, -0.8], [11.34, -0.8], [11.34, 0.48],
            [6.7, 0.75], [3.6, 3.75],
            [-3.6, 3.75], [-6.7, 0.75],
            [-11.34, 0.48], [-11.34, -0.8], [-11.17, -0.8], [-11, 0.2],
            [-1, 0], [-0.83, -1], [-0.66, -1], [-0.66, 0],
        ],
        windSpeed: 34,
        meshSize: 0.3,
        farField: 12,
        expected: { cD: "Dolfyn ref", cL: "Dolfyn ref", cM: "Dolfyn ref" },
    },
    {
        name: "RUB Bridge Deck (Dolfyn)",
        desc: "Ruhr-Universität Windkanal-Modell, trapezförmig, α=4°",
        polygon: [
            [-0.142, 0.031], [-0.183, 0.005], [-0.103, -0.035],
            [0.103, -0.035], [0.183, 0.005], [0.142, 0.031],
        ],
        windSpeed: 15,
        meshSize: 0.005,
        farField: 25,
        expected: { cD: "Dolfyn ref", cL: "Dolfyn ref", cM: "Dolfyn ref" },
    },
    {
        name: "Vortex T-Profil (Dolfyn)",
        desc: "T-Profil für Kármán-Wirbelablösung, B/D=2",
        polygon: [
            [-0.25, 0], [-0.25, 5], [0.25, 5], [0.25, 0],
            [10, 0], [10, -0.5], [-10, -0.5], [-10, 0],
        ],
        windSpeed: 20,
        meshSize: 0.2,
        farField: 15,
        expected: { cD: "~1.5-2", cL: "oscillating", cM: "oscillating" },
    },
    {
        name: "Vortex Doppel-T (Dolfyn)",
        desc: "Doppel-T Profil für Kármán-Wirbelablösung, B/D=2",
        polygon: [
            [0, 0.25], [9.75, 0.25], [9.75, 5], [10.25, 5],
            [10.25, -5], [9.75, -5], [9.75, -0.25],
            [0, -0.25], [-9.75, -0.25], [-9.75, -5],
            [-10.25, -5], [-10.25, 5], [-9.75, 5], [-9.75, 0.25],
        ],
        windSpeed: 20,
        meshSize: 0.3,
        farField: 12,
        expected: { cD: "~1.5", cL: "oscillating", cM: "oscillating" },
    },
    {
        name: "Millau-Viadukt (Dolfyn)",
        desc: "Millau-Viadukt Deck, aerodynamisches Profil",
        polygon: [
            [-16, 0], [-16.5, -0.5], [-16.5, -1.5], [-14, -4.5],
            [14, -4.5], [16.5, -1.5], [16.5, -0.5], [16, 0],
        ],
        windSpeed: 40,
        meshSize: 0.5,
        farField: 10,
        expected: { cD: "~0.05-0.1", cL: "~0.1", cM: "~0.02" },
    },
];
