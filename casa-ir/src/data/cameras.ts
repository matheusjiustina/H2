/**
 * Curated camera presets. Interior presets reproduce the viewpoints of the
 * renders in the interior design PDF so the client can compare
 * "PDF reference × interactive scene" (see `source`).
 */
export interface CameraPreset {
  id: string
  label: string
  group: string // 'exterior' or room id
  pos: [number, number, number]
  target: [number, number, number]
  fov?: number
  source?: string
}

const C = (id: string, label: string, group: string, pos: [number, number, number], target: [number, number, number], source?: string, fov?: number): CameraPreset => ({ id, label, group, pos, target, source, fov })

export const CAMERAS: CameraPreset[] = [
  // ── Exterior ────────────────────────────────────────────────────────────
  C('intro', 'Abertura', 'exterior', [72, 14, 30], [33.5, 3.4, 9.4], 'ARQ p.4', 34),
  C('hero', 'Vista principal', 'exterior', [55, 8.5, 27], [30.5, 3.0, 8.5], 'ARQ p.11', 38),
  C('fachada_frontal', 'Fachada frontal', 'exterior', [56, 2.3, 14.5], [33.5, 3.6, 9.2], 'ARQ p.4', 38),
  C('fachada_frontal_02', 'Fachada frontal — frontal', 'exterior', [60, 2.0, 9.8], [34, 3.4, 9.6], 'ARQ p.5', 36),
  C('fachada_posterior', 'Fachada posterior', 'exterior', [3.2, 1.75, 1.6], [16.5, 3.2, 10.5], 'ARQ p.7', 50),
  C('fachada_posterior_02', 'Fachada posterior — gourmet', 'exterior', [9.2, 1.6, 3.4], [11.0, 2.4, 13.2], 'ARQ p.8', 50),
  C('patio_interno', 'Pátio interno', 'exterior', [15.6, 1.6, 9.9], [27.7, 3.2, 8.6], 'ARQ p.6', 50),
  C('piscina', 'Piscina', 'exterior', [17.2, 1.65, 9.2], [6.0, 2.0, 1.8], 'ARQ p.10', 52),
  C('aerea', 'Vista aérea', 'exterior', [-10, 21, -9], [17, 0, 8.5], 'ARQ p.13', 40),
  C('lateral_norte', 'Fachada lateral norte', 'exterior', [47, 2.2, -7], [28, 2.8, 4.5], 'ARQ p.15', 45),
  C('lateral_sul', 'Fachada lateral sul', 'exterior', [-6, 3.2, 27], [15, 2.2, 14], 'ARQ p.12', 45),
  C('vista_superior', 'Vista superior', 'exterior', [20, 52, 9.6], [20, 0, 9], 'ARQ p.16', 35),
  C('planta3d', 'Planta 3D', 'plan', [20, 34, 30], [20, 0, 9.4], 'ARQ p.2', 40),

  // ── Sala de TV ──────────────────────────────────────────────────────────
  C('tv_view_01', 'Vista para o pátio', 'sala', [33.05, 1.4, 8.9], [27.8, 2.1, 8.85], 'INT p.5', 66),
  C('tv_view_02', 'Painel da TV', 'sala', [30.4, 1.4, 6.95], [30.4, 2.1, 11.0], 'INT p.6', 68),
  C('tv_view_03', 'Parede de linho', 'sala', [30.4, 1.4, 10.85], [30.5, 2.0, 6.7], 'INT p.7', 70),
  C('tv_view_04', 'Diagonal', 'sala', [32.7, 1.45, 10.7], [28.6, 1.9, 7.1], 'INT p.8', 66),
  C('tv_view_05', 'Porta pivotante', 'sala', [28.15, 1.4, 8.6], [33.3, 1.8, 9.2], 'INT p.9', 66),

  // ── Cozinha ─────────────────────────────────────────────────────────────
  C('kitchen_view_01', 'Vista leste', 'cozinha', [21.95, 1.5, 13.6], [26.7, 1.6, 13.6], 'INT p.19', 64),
  C('kitchen_view_02', 'Vista sul', 'cozinha', [24.0, 1.55, 11.35], [23.9, 1.3, 16.2], 'INT p.20', 64),
  C('kitchen_view_03', 'Cristaleira', 'cozinha', [24.2, 1.5, 15.9], [24.0, 1.6, 11.0], 'INT p.22', 62),
  C('kitchen_view_04', 'Ilha e gourmet', 'cozinha', [26.5, 1.5, 13.2], [21.7, 1.3, 13.8], 'INT p.23', 62),

  // ── Gourmet ─────────────────────────────────────────────────────────────
  C('gourmet_view_01', 'Vista oeste', 'gourmet', [21.3, 1.6, 15.2], [13.6, 1.6, 13.4], 'INT p.24', 62),
  C('gourmet_view_02', 'Bancada e churrasqueira', 'gourmet', [17.4, 1.5, 11.3], [17.4, 1.4, 16.2], 'INT p.25', 66),
  C('gourmet_view_03', 'Vista para o pátio', 'gourmet', [17.6, 1.5, 16.0], [17.6, 1.4, 11.0], 'INT p.27', 66),
  C('gourmet_view_04', 'Ilha orgânica', 'gourmet', [14.0, 1.55, 11.5], [19.0, 1.2, 15.6], 'INT p.28', 62),

  // ── Lavanderia ──────────────────────────────────────────────────────────
  C('laundry_view_01', 'Vista para o jardim', 'lavanderia', [28.1, 1.5, 12.45], [28.1, 1.25, 16.2], 'INT p.13', 66),
  C('laundry_view_02', 'Tanques', 'lavanderia', [27.0, 1.5, 14.3], [29.36, 1.35, 14.3], 'INT p.14', 72),
  C('laundry_view_03', 'Torre e bancada', 'lavanderia', [29.25, 1.5, 14.3], [26.86, 1.35, 14.3], 'INT p.15', 72),

  // ── Banho externo / depósito / despensa ─────────────────────────────────
  C('extbath_view_01', 'Banho externo', 'banho_ext', [12.2, 1.55, 13.55], [12.8, 1.25, 16.2], 'INT p.30', 70),
  C('deposit_view_01', 'Depósito', 'deposito', [6.55, 1.55, 17.4], [6.55, 1.3, 15.3], 'INT p.33', 62),
  C('pantry_view_01', 'Despensa', 'despensa', [11.1, 1.55, 13.6], [9.3, 1.2, 16.0], 'ARQ p.2', 66),

  // ── Sala de jogos ───────────────────────────────────────────────────────
  C('game_view_01', 'Estante e mesa', 'jogos', [6.55, 1.5, 11.35], [6.55, 1.45, 15.15], 'INT p.35', 66),
  C('game_view_02', 'Vista longitudinal', 'jogos', [8.2, 1.5, 13.4], [4.82, 1.4, 13.1], 'INT p.36', 66),
  C('game_view_03', 'Parede dos violões', 'jogos', [7.7, 1.5, 14.2], [4.82, 1.5, 11.9], 'INT p.39', 62),

  // ── Banho social ────────────────────────────────────────────────────────
  C('socialbath_view_01', 'Bancada', 'bsocial', [30.05, 1.55, 4.1], [31.56, 1.4, 3.8], 'INT p.41', 78),
  C('socialbath_view_02', 'Box', 'bsocial', [30.75, 1.55, 5.2], [30.75, 1.5, 1.8], 'INT p.42', 70),

  // ── Suíte master ────────────────────────────────────────────────────────
  C('master_view_01', 'Vista geral', 'suite', [19.6, 1.5, 6.35], [19.6, 1.35, 1.8], 'INT p.57', 66),
  C('master_view_02', 'Cabeceira', 'suite', [18.05, 1.4, 3.65], [21.37, 1.5, 3.65], 'INT p.58', 64),
  C('master_view_03', 'TV e vista da piscina', 'suite', [21.1, 1.5, 4.4], [17.85, 1.4, 4.4], 'INT p.60', 64),
  C('master_view_04', 'Poltrona', 'suite', [19.4, 1.55, 2.0], [19.6, 1.25, 6.55], 'INT p.62', 64),
  C('closet_view_01', 'Corredor do closet', 'closet', [24.5, 1.55, 6.35], [24.6, 1.4, 1.8], 'INT p.45', 66),
  C('closet_view_02', 'Nicho central', 'closet', [23.6, 1.5, 3.6], [26.06, 1.45, 3.6], 'INT p.46', 70),
  C('closet_view_03', 'Penteadeira', 'closet', [24.9, 1.5, 5.4], [22.8, 1.3, 4.7], 'INT p.47', 66),
  C('masterbath_view_01', 'Box', 'suite_bath', [22.3, 1.55, 3.82], [22.3, 1.35, 1.8], 'INT p.55', 74),

  // ── Quartos / hall / garagem ────────────────────────────────────────────
  C('q01_view_01', 'Quarto 01', 'q01', [34.7, 1.55, 5.55], [31.9, 1.0, 2.8], 'ARQ p.2', 66),
  C('q02_view_01', 'Quarto 02', 'q02', [29.5, 1.55, 5.05], [26.6, 1.0, 2.4], 'ARQ p.2', 66),
  C('hall_view_01', 'Hall de entrada', 'hall', [39.2, 1.6, 9.4], [33.3, 2.0, 9.4], 'ARQ p.5', 55),
  C('garage_view_01', 'Garagem', 'garagem', [39.8, 1.7, 15.8], [29.5, 1.6, 13.6], 'ARQ p.5', 55),
]

/** Curated still-image framings offered in CAPTURAR (archviz photography). */
export const SHOTS: { id: string; label: string; cam: string }[] = [
  { id: 'fachada_frontal', label: 'Fachada — frontal', cam: 'fachada_frontal_02' },
  { id: 'fachada_angular', label: 'Fachada — angular', cam: 'fachada_frontal' },
  { id: 'piscina_gourmet', label: 'Piscina — vista gourmet', cam: 'fachada_posterior_02' },
  { id: 'gourmet_interior', label: 'Gourmet — interior', cam: 'gourmet_view_01' },
  { id: 'sala_tv', label: 'Sala TV — principal', cam: 'tv_view_01' },
  { id: 'master_cama', label: 'Master — cama', cam: 'master_view_02' },
  { id: 'master_tv', label: 'Master — TV', cam: 'master_view_03' },
  { id: 'closet', label: 'Closet — principal', cam: 'closet_view_01' },
  { id: 'banho_master', label: 'Banho master', cam: 'masterbath_view_01' },
]

/** APRESENTAÇÃO — guided tour, in visiting order. */
export const TOUR: { cam: string; label: string; hold: number }[] = [
  { cam: 'fachada_frontal', label: 'Fachada frontal', hold: 7 },
  { cam: 'hall_view_01', label: 'Entrada', hold: 6 },
  { cam: 'patio_interno', label: 'Pátio interno', hold: 7 },
  { cam: 'tv_view_01', label: 'Sala de TV', hold: 7 },
  { cam: 'kitchen_view_04', label: 'Cozinha', hold: 6 },
  { cam: 'gourmet_view_01', label: 'Área gourmet', hold: 7 },
  { cam: 'piscina', label: 'Piscina', hold: 7 },
  { cam: 'game_view_01', label: 'Sala de jogos', hold: 6 },
  { cam: 'master_view_02', label: 'Suíte master', hold: 7 },
  { cam: 'closet_view_01', label: 'Closet', hold: 6 },
  { cam: 'masterbath_view_01', label: 'Banho master', hold: 6 },
  { cam: 'fachada_posterior', label: 'Fachada posterior e piscina', hold: 8 },
]

export const CAMERA_BY_ID = Object.fromEntries(CAMERAS.map((c) => [c.id, c])) as Record<string, CameraPreset>
export const camerasFor = (group: string) => CAMERAS.filter((c) => c.group === group)
