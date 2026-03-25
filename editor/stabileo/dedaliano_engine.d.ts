/* tslint:disable */
/* eslint-disable */

/**
 * Analyze 2D kinematic stability. JSON in → JSON out.
 */
export function analyze_kinematics_2d(json: string): string;

/**
 * Analyze 3D kinematic stability. JSON in → JSON out.
 */
export function analyze_kinematics_3d(json: string): string;

/**
 * Compute cross-section properties from polygon geometry. JSON: SectionInput
 */
export function analyze_section(json: string): string;

export function check_bolt_groups(json: string): string;

export function check_cfs_members(json: string): string;

export function check_cirsoc201_members(json: string): string;

export function check_ec2_members(json: string): string;

export function check_ec3_members(json: string): string;

export function check_masonry_members(json: string): string;

export function check_rc_members(json: string): string;

export function check_serviceability(json: string): string;

export function check_spread_footings(json: string): string;

/**
 * Check steel members per AISC 360 (LRFD). JSON: SteelCheckInput
 */
export function check_steel_members(json: string): string;

export function check_timber_members(json: string): string;

export function check_weld_groups(json: string): string;

/**
 * Combine 2D results with factors. JSON: CombinationInput
 */
export function combine_results_2d(json: string): string;

/**
 * Combine 3D results with factors. JSON: CombinationInput3D
 */
export function combine_results_3d(json: string): string;

/**
 * Compute deformed shape for one element. JSON wrapper.
 */
export function compute_deformed_shape(json: string): string;

/**
 * Compute 2D diagram value at position t for one element. JSON: { kind, t, elementForces }
 */
export function compute_diagram_value_at(json: string): number;

/**
 * Compute 3D diagram value at position t for one element. JSON: { kind, t, elementForces }
 */
export function compute_diagram_value_at_3d(json: string): number;

/**
 * Compute 2D diagrams (moment, shear, axial). JSON: { input: SolverInput, results: AnalysisResults }
 */
export function compute_diagrams_2d(json: string): string;

/**
 * Compute 3D diagrams. JSON: AnalysisResults3D
 */
export function compute_diagrams_3d(json: string): string;

/**
 * Compute 2D envelope. JSON: array of AnalysisResults
 */
export function compute_envelope_2d(json: string): string;

/**
 * Compute 3D envelope. JSON: array of AnalysisResults3D
 */
export function compute_envelope_3d(json: string): string;

/**
 * Compute influence line. JSON: InfluenceLineInput
 */
export function compute_influence_line(json: string): string;

/**
 * Compute 3D influence line. JSON: InfluenceLineInput3D
 */
export function compute_influence_line_3d(json: string): string;

/**
 * Compute 2D section stress. JSON: SectionStressInput
 */
export function compute_section_stress_2d(json: string): string;

/**
 * Compute 3D section stress. JSON: SectionStressInput3D
 */
export function compute_section_stress_3d(json: string): string;

/**
 * Compute 3D section stress from raw internal forces (no element forces interpolation).
 * JSON: { N, Vy, Vz, Mx, My, Mz, section, fy?, yFiber?, zFiber? }
 */
export function compute_section_stress_3d_from_forces(json: string): string;

/**
 * Craig-Bampton reduction of a 2D model. JSON in → JSON out.
 */
export function craig_bampton_2d(json: string): string;

/**
 * Extract 2D beam design stations with per-combo forces and governing values. JSON: BeamStationInput
 */
export function extract_beam_stations(json: string): string;

/**
 * Extract 3D beam design stations with per-combo forces and governing values. JSON: BeamStationInput3D
 */
export function extract_beam_stations_3d(json: string): string;

/**
 * Extract 2D beam stations grouped by member with member-level governing summaries. JSON: BeamStationInput
 */
export function extract_beam_stations_grouped(json: string): string;

/**
 * Extract 3D beam stations grouped by member with member-level governing summaries. JSON: BeamStationInput3D
 */
export function extract_beam_stations_grouped_3d(json: string): string;

/**
 * Guyan (static) condensation of a 2D model. JSON in → JSON out.
 */
export function guyan_reduce_2d(json: string): string;

export function init(): void;

/**
 * Solve 2D linear static analysis. JSON in → JSON out.
 */
export function solve_2d(json: string): string;

/**
 * Solve 3D linear static analysis. JSON in → JSON out.
 */
export function solve_3d(json: string): string;

/**
 * Solve arc-length (Crisfield) analysis for snap-through/snap-back. JSON in → JSON out.
 */
export function solve_arc_length(json: string): string;

/**
 * Solve 2D buckling analysis. JSON in → JSON out.
 */
export function solve_buckling_2d(json: string, num_modes: number): string;

/**
 * Solve 3D buckling analysis. JSON in → JSON out.
 */
export function solve_buckling_3d(json: string, num_modes: number): string;

/**
 * Solve 2D cable analysis. JSON in → JSON out.
 * Input: { "solver": SolverInput, "densities": { materialId: density_kg_m3 } }
 */
export function solve_cable_2d(json: string, max_iter: number, tolerance: number): string;

/**
 * Solve 2D constrained analysis (rigid links, diaphragms, MPCs). JSON in → JSON out.
 */
export function solve_constrained_2d(json: string): string;

/**
 * Solve 3D constrained analysis (rigid links, diaphragms, MPCs). JSON in → JSON out.
 */
export function solve_constrained_3d(json: string): string;

/**
 * Solve 2D contact analysis (tension/compression-only, gaps, uplift). JSON in → JSON out.
 */
export function solve_contact_2d(json: string): string;

/**
 * Solve 3D contact analysis (tension/compression-only, gaps, uplift). JSON in → JSON out.
 */
export function solve_contact_3d(json: string): string;

/**
 * Solve 2D co-rotational (large displacement) analysis. JSON in → JSON out.
 */
export function solve_corotational_2d(json: string, max_iter: number, tolerance: number, n_increments: number): string;

/**
 * Solve 3D co-rotational (large displacement) analysis. JSON in → JSON out.
 */
export function solve_corotational_3d(json: string, max_iter: number, tolerance: number, n_increments: number): string;

/**
 * Solve time-dependent 2D analysis with creep and shrinkage. JSON in → JSON out.
 */
export function solve_creep_shrinkage_2d(json: string): string;

/**
 * Solve 3D time-dependent analysis with creep and shrinkage (EC2). JSON in → JSON out.
 */
export function solve_creep_shrinkage_3d(json: string): string;

/**
 * Solve displacement-controlled analysis. JSON in → JSON out.
 */
export function solve_displacement_control(json: string): string;

/**
 * Solve 2D fiber beam-column nonlinear analysis. JSON in → JSON out.
 */
export function solve_fiber_nonlinear_2d(json: string): string;

/**
 * Solve 3D fiber beam-column nonlinear analysis. JSON in → JSON out.
 */
export function solve_fiber_nonlinear_3d(json: string): string;

/**
 * Solve 2D harmonic (frequency response) analysis. JSON: HarmonicInput
 */
export function solve_harmonic_2d(json: string): string;

/**
 * Solve 3D harmonic (frequency response) analysis. JSON: HarmonicInput3D
 */
export function solve_harmonic_3d(json: string): string;

/**
 * Solve 2D modal analysis. JSON in → JSON out.
 * densities_json: { "materialId": density_kg_m3, ... }
 */
export function solve_modal_2d(json: string, num_modes: number): string;

/**
 * Solve 3D modal analysis. JSON in → JSON out.
 */
export function solve_modal_3d(json: string, num_modes: number): string;

/**
 * Solve 2D moving loads analysis. JSON in → JSON out.
 */
export function solve_moving_loads_2d(json: string): string;

/**
 * Solve 3D moving loads analysis. JSON in → JSON out.
 */
export function solve_moving_loads_3d(json: string): string;

/**
 * Solve 2D multi-case load combinations with envelope. JSON: MultiCaseInput
 */
export function solve_multi_case_2d(json: string): string;

/**
 * Solve 3D multi-case load combinations with envelope. JSON: MultiCaseInput3D
 */
export function solve_multi_case_3d(json: string): string;

/**
 * Solve 2D nonlinear material analysis. JSON in → JSON out.
 */
export function solve_nonlinear_material_2d(json: string): string;

/**
 * Solve 3D nonlinear material analysis. JSON in → JSON out.
 */
export function solve_nonlinear_material_3d(json: string): string;

/**
 * Solve 2D P-Delta analysis. JSON in → JSON out.
 */
export function solve_pdelta_2d(json: string, max_iter: number, tolerance: number): string;

/**
 * Solve 3D P-Delta analysis. JSON in → JSON out.
 */
export function solve_pdelta_3d(json: string, max_iter: number, tolerance: number): string;

/**
 * Solve 2D plastic analysis. JSON in → JSON out.
 */
export function solve_plastic_2d(json: string): string;

/**
 * Solve 3D plastic (pushover) analysis. JSON in → JSON out.
 */
export function solve_plastic_3d(json: string): string;

/**
 * Solve 2D spectral analysis. JSON in → JSON out.
 */
export function solve_spectral_2d(json: string): string;

/**
 * Solve 3D spectral analysis. JSON in → JSON out.
 */
export function solve_spectral_3d(json: string): string;

/**
 * Solve 2D soil-structure interaction with nonlinear p-y/t-z/q-z curves. JSON in → JSON out.
 */
export function solve_ssi_2d(json: string): string;

/**
 * Solve 3D soil-structure interaction with nonlinear p-y/t-z/q-z curves. JSON in → JSON out.
 */
export function solve_ssi_3d(json: string): string;

/**
 * Solve 2D staged construction analysis. JSON in → JSON out.
 */
export function solve_staged_2d(json: string): string;

/**
 * Solve 3D staged construction analysis. JSON in → JSON out.
 */
export function solve_staged_3d(json: string): string;

/**
 * Solve 2D time-history analysis. JSON in → JSON out.
 */
export function solve_time_history_2d(json: string): string;

/**
 * Solve 3D linear time-history analysis. JSON in → JSON out.
 */
export function solve_time_history_3d(json: string): string;

/**
 * Solve 2D beam on Winkler elastic foundation. JSON: WinklerInput
 */
export function solve_winkler_2d(json: string): string;

/**
 * Solve 3D beam on Winkler elastic foundation. JSON: WinklerInput3D
 */
export function solve_winkler_3d(json: string): string;

/**
 * Apply imperfections to a 2D model and solve. JSON in → JSON out.
 *
 * Input: { "solver": SolverInput, "imperfections": ImperfectionInput }
 * Applies geometric imperfections, adds notional loads, then solves linearly.
 */
export function solve_with_imperfections_2d(json: string): string;

/**
 * Apply imperfections to a 3D model and solve. JSON in → JSON out.
 */
export function solve_with_imperfections_3d(json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly analyze_kinematics_2d: (a: number, b: number) => [number, number, number, number];
    readonly analyze_kinematics_3d: (a: number, b: number) => [number, number, number, number];
    readonly analyze_section: (a: number, b: number) => [number, number, number, number];
    readonly check_bolt_groups: (a: number, b: number) => [number, number, number, number];
    readonly check_cfs_members: (a: number, b: number) => [number, number, number, number];
    readonly check_cirsoc201_members: (a: number, b: number) => [number, number, number, number];
    readonly check_ec2_members: (a: number, b: number) => [number, number, number, number];
    readonly check_ec3_members: (a: number, b: number) => [number, number, number, number];
    readonly check_masonry_members: (a: number, b: number) => [number, number, number, number];
    readonly check_rc_members: (a: number, b: number) => [number, number, number, number];
    readonly check_serviceability: (a: number, b: number) => [number, number, number, number];
    readonly check_spread_footings: (a: number, b: number) => [number, number, number, number];
    readonly check_steel_members: (a: number, b: number) => [number, number, number, number];
    readonly check_timber_members: (a: number, b: number) => [number, number, number, number];
    readonly check_weld_groups: (a: number, b: number) => [number, number, number, number];
    readonly combine_results_2d: (a: number, b: number) => [number, number, number, number];
    readonly combine_results_3d: (a: number, b: number) => [number, number, number, number];
    readonly compute_deformed_shape: (a: number, b: number) => [number, number, number, number];
    readonly compute_diagram_value_at: (a: number, b: number) => [number, number, number];
    readonly compute_diagram_value_at_3d: (a: number, b: number) => [number, number, number];
    readonly compute_diagrams_2d: (a: number, b: number) => [number, number, number, number];
    readonly compute_diagrams_3d: (a: number, b: number) => [number, number, number, number];
    readonly compute_envelope_2d: (a: number, b: number) => [number, number, number, number];
    readonly compute_envelope_3d: (a: number, b: number) => [number, number, number, number];
    readonly compute_influence_line: (a: number, b: number) => [number, number, number, number];
    readonly compute_influence_line_3d: (a: number, b: number) => [number, number, number, number];
    readonly compute_section_stress_2d: (a: number, b: number) => [number, number, number, number];
    readonly compute_section_stress_3d: (a: number, b: number) => [number, number, number, number];
    readonly compute_section_stress_3d_from_forces: (a: number, b: number) => [number, number, number, number];
    readonly craig_bampton_2d: (a: number, b: number) => [number, number, number, number];
    readonly extract_beam_stations: (a: number, b: number) => [number, number, number, number];
    readonly extract_beam_stations_3d: (a: number, b: number) => [number, number, number, number];
    readonly extract_beam_stations_grouped: (a: number, b: number) => [number, number, number, number];
    readonly extract_beam_stations_grouped_3d: (a: number, b: number) => [number, number, number, number];
    readonly guyan_reduce_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_arc_length: (a: number, b: number) => [number, number, number, number];
    readonly solve_buckling_2d: (a: number, b: number, c: number) => [number, number, number, number];
    readonly solve_buckling_3d: (a: number, b: number, c: number) => [number, number, number, number];
    readonly solve_cable_2d: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly solve_constrained_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_constrained_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_contact_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_contact_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_corotational_2d: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly solve_corotational_3d: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly solve_creep_shrinkage_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_creep_shrinkage_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_displacement_control: (a: number, b: number) => [number, number, number, number];
    readonly solve_fiber_nonlinear_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_fiber_nonlinear_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_harmonic_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_harmonic_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_modal_2d: (a: number, b: number, c: number) => [number, number, number, number];
    readonly solve_modal_3d: (a: number, b: number, c: number) => [number, number, number, number];
    readonly solve_moving_loads_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_moving_loads_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_multi_case_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_multi_case_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_nonlinear_material_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_nonlinear_material_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_pdelta_2d: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly solve_pdelta_3d: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly solve_plastic_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_plastic_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_spectral_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_spectral_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_ssi_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_ssi_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_staged_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_staged_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_time_history_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_time_history_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_winkler_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_winkler_3d: (a: number, b: number) => [number, number, number, number];
    readonly solve_with_imperfections_2d: (a: number, b: number) => [number, number, number, number];
    readonly solve_with_imperfections_3d: (a: number, b: number) => [number, number, number, number];
    readonly init: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
