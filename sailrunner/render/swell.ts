import { type Material, Vector2 } from "three";

/**
 * The sea's swell: a few Gerstner wave trains running downwind, each moving at
 * the deep-water speed for its wavelength, so long swells outrun short chop.
 * One definition drives the water mesh (GLSL), the things drawn on the water
 * (GLSL, so they ride the waves instead of being swallowed by them), and the
 * boat and buoys (TypeScript, the same sums).
 */

const G = 9.81;

interface Train {
	/** Direction relative to downwind (rad). */
	angle: number;
	length: number;
	amplitude: number;
	/** Gerstner steepness: how far crests lean together; sharp crests, flat troughs. */
	steep: number;
	phase: number;
}

const TRAINS: readonly Train[] = [
	// Steepness × wavenumber × amplitude sums to about 0.6: pointed crests, never loops.
	{ angle: 0, length: 44, amplitude: 0.42, steep: 2.4, phase: 0 },
	{ angle: 0.42, length: 27, amplitude: 0.24, steep: 2.6, phase: 1.7 },
	{ angle: -0.55, length: 17, amplitude: 0.13, steep: 2.9, phase: 4.1 },
	{ angle: 0.2, length: 10.5, amplitude: 0.07, steep: 3.2, phase: 2.6 },
];

/** Highest a crest can stand above the mean level (m). */
export const SWELL_MAX = TRAINS.reduce((sum, t) => sum + t.amplitude, 0);
/** Things drawn on the water sit this far above the swell, so its facets never cut through them. */
const SURFACE_LIFT = 0.07;

/** Shared by every material that uses the swell; updated once a frame. */
export const swellUniforms = {
	uSwellTime: { value: 0 },
	/** Unit vector in world xz pointing downwind. */
	uSwellWind: { value: new Vector2(0, 1) },
};

/** Point the swell downwind and move it on. `wind` is where the wind comes from (sim heading). */
export function setSwell(wind: number, timeSec: number): void {
	swellUniforms.uSwellWind.value.set(-Math.sin(wind), Math.cos(wind));
	swellUniforms.uSwellTime.value = timeSec;
}

function num(v: number): string {
	return Number.isInteger(v) ? `${v}.0` : String(v);
}

/**
 * GLSL: `swellHeight(xz)` and `swellSurface(xz, out normal)`. Each train fades
 * out with distance once it is too short for the mesh there to carry it.
 */
export const SWELL_GLSL = /* glsl */ `
uniform float uSwellTime;
uniform vec2 uSwellWind;
vec2 swellDir(float a) {
	float c = cos(a), s = sin(a);
	return vec2(uSwellWind.x * c - uSwellWind.y * s, uSwellWind.x * s + uSwellWind.y * c);
}
float swellFade(float len, float dist) {
	return 1.0 - smoothstep(len * 5.0, len * 11.0, dist);
}
${TRAINS.map((t, i) => {
	const k = (2 * Math.PI) / t.length;
	return `const vec4 SW${i} = vec4(${num(k)}, ${num(Math.sqrt(G * k))}, ${num(t.amplitude)}, ${num(t.steep)});
const vec2 SW${i}B = vec2(${num(t.angle)}, ${num(t.phase)});`;
}).join("\n")}
float swellHeight(vec2 p, float dist) {
	float h = 0.0;
	${TRAINS.map((t, i) => `{
		vec2 d = swellDir(SW${i}B.x);
		h += SW${i}.z * swellFade(${num(t.length)}, dist) * sin(SW${i}.x * dot(d, p) - SW${i}.y * uSwellTime + SW${i}B.y);
	}`).join("\n\t")}
	return h;
}
// Gerstner displacement of the surface point above p, and its normal.
vec3 swellSurface(vec2 p, float dist, out vec3 normal) {
	vec3 offset = vec3(0.0);
	vec3 n = vec3(0.0, 1.0, 0.0);
	${TRAINS.map((t, i) => `{
		vec2 d = swellDir(SW${i}B.x);
		float a = SW${i}.z * swellFade(${num(t.length)}, dist);
		float th = SW${i}.x * dot(d, p) - SW${i}.y * uSwellTime + SW${i}B.y;
		float c = cos(th), s = sin(th);
		offset += vec3(SW${i}.w * a * d.x * c, a * s, SW${i}.w * a * d.y * c);
		n -= vec3(d.x * SW${i}.x * a * c, SW${i}.w * SW${i}.x * a * s, d.y * SW${i}.x * a * c);
	}`).join("\n\t")}
	normal = normalize(n);
	return offset;
}`;

/** Surface height (m) of the swell at world (x, z), near the camera. */
export function swellHeightAt(x: number, z: number): number {
	const { x: wx, y: wz } = swellUniforms.uSwellWind.value;
	const t = swellUniforms.uSwellTime.value;
	let h = 0;
	for (const train of TRAINS) {
		const c = Math.cos(train.angle), s = Math.sin(train.angle);
		const dx = wx * c - wz * s, dz = wx * s + wz * c;
		const k = (2 * Math.PI) / train.length;
		h += train.amplitude * Math.sin(k * (dx * x + dz * z) - Math.sqrt(G * k) * t + train.phase);
	}
	return h;
}

/**
 * Make a material's vertices ride the swell: every vertex is lifted by the
 * swell height under it. For overlays drawn on the water (guide, mark rings,
 * wake, shadow), which would otherwise sink into the troughs and be hidden by
 * the crests.
 */
export function rideSwell<M extends Material>(material: M): M {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, swellUniforms);
		shader.vertexShader = `${SWELL_GLSL}\n${shader.vertexShader}`.replace(
			"#include <project_vertex>",
			/* glsl */ `
			vec4 mvPosition = vec4(transformed, 1.0);
			#ifdef USE_INSTANCING
				mvPosition = instanceMatrix * mvPosition;
			#endif
			vec4 swellWorld = modelMatrix * mvPosition;
			swellWorld.y += swellHeight(swellWorld.xz, distance(swellWorld.xz, cameraPosition.xz)) + ${num(SURFACE_LIFT)};
			mvPosition = viewMatrix * swellWorld;
			gl_Position = projectionMatrix * mvPosition;`,
		);
	};
	material.customProgramCacheKey = () => "ride-swell";
	return material;
}
