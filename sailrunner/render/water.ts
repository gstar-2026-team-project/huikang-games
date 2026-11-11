import { BufferGeometry, Float32BufferAttribute, Group, Mesh, ShaderMaterial, Vector3 } from "three";
import type { Palette } from "./palette";
import { SWELL_GLSL, setSwell, SWELL_MAX, swellUniforms } from "./swell";

/** Distance fog shared by the water shader and the scene's built-in fog. */
export const FOG_NEAR = 220;
export const FOG_FAR = 1000;

/** World-space direction towards the sun (unit length). */
export const SUN_DIRECTION = new Vector3(-0.46, 0.4, -0.79).normalize();

/** The water mesh: rings of vertices around the camera, close together near it and spread out far away. */
const SPOKES = 120;
const INNER_RADIUS = 0.6;
/** Just past the distance where the fog is solid: nothing further could be seen. */
const OUTER_RADIUS = FOG_FAR * 1.1;
/** Each ring is this much wider than the one inside it, so cells stay roughly square. */
const RING_GROWTH = 1 + (2 * Math.PI) / SPOKES;

function polarGrid(): BufferGeometry {
	const radii: number[] = [0];
	for (let r = INNER_RADIUS; r < OUTER_RADIUS; r *= RING_GROWTH) radii.push(r);
	radii.push(OUTER_RADIUS);
	const positions: number[] = [];
	for (const r of radii) {
		for (let s = 0; s < SPOKES; s++) {
			const a = (s / SPOKES) * Math.PI * 2;
			positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
		}
	}
	const index: number[] = [];
	for (let i = 0; i < radii.length - 1; i++) {
		for (let s = 0; s < SPOKES; s++) {
			const a = i * SPOKES + s;
			const b = i * SPOKES + ((s + 1) % SPOKES);
			const c = a + SPOKES;
			const d = b + SPOKES;
			// Counter-clockwise seen from above, so the faces point up.
			index.push(a, b, c, b, d, c);
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setIndex(index);
	return geometry;
}

const VERTEX = /* glsl */ `
${SWELL_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	float dist = distance(world.xz, cameraPosition.xz);
	vec3 normal;
	vec3 offset = swellSurface(world.xz, dist, normal);
	world.xyz += offset;
	vWorld = world.xyz;
	vNormal = normal;
	vCrest = offset.y;
	gl_Position = projectionMatrix * viewMatrix * world;
}`;

// Shading: the swell's normal plus fine ripples too small for the mesh, a
// deep body colour lit through the crests, sky reflected at grazing angles,
// sun glitter, and foam where crests stand highest.
const FRAGMENT = /* glsl */ `
uniform float uSwellTime;
uniform vec2 uSwellWind;
uniform vec3 uDeep;
uniform vec3 uSea;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform vec3 uFoam;
uniform vec3 uSunDir;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSwellMax;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;

// Slope of one ripple train (fragment-only detail): wavenumber k, angular speed w.
vec2 ripple(vec2 p, vec2 dir, float k, float w, float amp, float phase) {
	return dir * (k * amp * cos(k * dot(dir, p) - w * uSwellTime + phase));
}

void main() {
	vec3 toFrag = vWorld - cameraPosition;
	float dist = length(toFrag);
	vec3 view = -toFrag / dist;

	vec2 across = vec2(-uSwellWind.y, uSwellWind.x);
	// Three ripple trains at unrelated lengths (5.3, 3.1, 1.9 m) and angles, so they
	// never line up into a regular weave; they fade out before they would alias,
	// and are not computed at all beyond that.
	float near = 1.0 - smoothstep(12.0, 55.0, dist);
	vec3 normal = vNormal;
	if (near > 0.0) {
		vec2 slope = ripple(vWorld.xz, normalize(uSwellWind + across * 0.31), 1.1855, 3.4102, 0.035, 0.0)
			+ ripple(vWorld.xz, normalize(uSwellWind - across * 0.67), 2.0268, 4.4590, 0.022, 2.3)
			+ ripple(vWorld.xz, normalize(across + uSwellWind * 0.4), 3.3069, 5.6956, 0.012, 3.7);
		normal = normalize(vNormal + vec3(-slope.x, 0.0, -slope.y) * near);
	}

	float crest = clamp(vCrest / uSwellMax, -1.0, 1.0);
	// Deep and saturated underfoot, paler towards the horizon; crests lit through.
	vec3 body = mix(uDeep, uSea, smoothstep(10.0, 180.0, dist));
	body = mix(body, uSea * 1.18, smoothstep(0.2, 0.9, crest) * 0.45);
	float lambert = max(dot(normal, uSunDir), 0.0);
	vec3 color = body * (0.72 + 0.4 * lambert);

	// Sky reflected at grazing angles (Schlick), strongest towards the horizon.
	float cosV = max(dot(normal, view), 0.0);
	float fresnel = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
	color = mix(color, uHaze, clamp(fresnel * 0.75, 0.0, 0.6));

	// Sun: a sharp glint on each wave face and a broad sheen on the path below the sun.
	vec3 mirror = reflect(-view, normal);
	float glint = pow(max(dot(mirror, uSunDir), 0.0), 260.0) * 2.2;
	float sheen = pow(max(dot(mirror, uSunDir), 0.0), 24.0) * 0.16;
	// Underfoot a single wave face fills a patch of screen: keep its glare soft there.
	color += uSun * (glint + sheen) * smoothstep(10.0, 60.0, dist);

	// Whitecaps break on the highest, steepest crests, in streaks along the wind.
	float streak = 0.5 + 0.5 * sin(dot(vWorld.xz, across) * 0.9 + sin(dot(vWorld.xz, uSwellWind) * 0.35) * 2.0);
	float foam = smoothstep(0.62, 0.95, crest) * smoothstep(0.35, 0.9, streak) * (1.0 - smoothstep(120.0, 300.0, dist));
	color = mix(color, uFoam, foam * 0.75);

	float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
	gl_FragColor = vec4(mix(color, uHaze, fog), 1.0);
	#include <colorspace_fragment>
}`;

/** The sea: one swell-displaced mesh that follows the camera out to the horizon. */
export class Sea {
	readonly root = new Group();
	private water: Mesh;
	private material: ShaderMaterial;

	constructor(palette: Palette) {
		this.material = new ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			uniforms: {
				...swellUniforms,
				uDeep: { value: palette.seaDeep },
				uSea: { value: palette.sea },
				uHaze: { value: palette.sky },
				uSun: { value: palette.sun },
				uFoam: { value: palette.fleck },
				uSunDir: { value: SUN_DIRECTION },
				uFogNear: { value: FOG_NEAR },
				uFogFar: { value: FOG_FAR },
				uSwellMax: { value: SWELL_MAX },
			},
		});
		this.water = new Mesh(polarGrid(), this.material);
		// The mesh is moved under the camera every frame; its bounds would go stale.
		this.water.frustumCulled = false;
		this.root.add(this.water);
	}

	setPalette(palette: Palette): void {
		const uniforms = this.material.uniforms;
		uniforms["uDeep"]!.value = palette.seaDeep;
		uniforms["uSea"]!.value = palette.sea;
		uniforms["uHaze"]!.value = palette.sky;
		uniforms["uSun"]!.value = palette.sun;
		uniforms["uFoam"]!.value = palette.fleck;
	}

	/**
	 * Centre the water under the camera and move the swell on. The waves are
	 * computed from world position, so moving the mesh never moves the waves.
	 */
	update(cameraX: number, cameraZ: number, wind: number, timeSec: number): void {
		this.water.position.set(cameraX, 0, cameraZ);
		setSwell(wind, timeSec);
	}

	dispose(): void {
		this.water.geometry.dispose();
		this.material.dispose();
	}
}
