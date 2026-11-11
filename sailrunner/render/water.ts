import { BufferGeometry, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from "three";
import { SHOAL_COUNT, shoalUniforms } from "./islands";
import type { Palette } from "./palette";
import { SKY_GLSL, SUN_LIGHT, skyUniforms } from "./sun";
import { SWELL_GLSL, setSwell, SWELL_MAX, swellUniforms } from "./swell";

/** Distance fog shared by the water shader and the scene's built-in fog. */
export const FOG_NEAR = 240;
export const FOG_FAR = 1050;

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
uniform vec3 uShoals[${SHOAL_COUNT}];
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vShallow;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	float dist = distance(world.xz, cameraPosition.xz);
	// Shallows: turquoise water shoaling up to each island's beach.
	float shore = 1e4;
	for (int i = 0; i < ${SHOAL_COUNT}; i++) {
		if (uShoals[i].z > 0.0) shore = min(shore, distance(world.xz, uShoals[i].xy) - uShoals[i].z);
	}
	vShallow = 1.0 - smoothstep(0.0, 120.0, shore);
	vec3 normal;
	vec3 offset = swellSurface(world.xz, dist, normal);
	world.xyz += offset;
	vWorld = world.xyz;
	vNormal = normal;
	vCrest = offset.y;
	gl_Position = projectionMatrix * viewMatrix * world;
}`;

// Shading: the swell's normal plus fine ripples too small for the mesh; a
// saturated body colour, turquoise in the shallows and where low sun shines
// through a crest; the sky's own gradient reflected at grazing angles; a
// glitter path under the sun; crisp whitecaps; and haze that melts into the
// horizon colour behind it.
const FRAGMENT = /* glsl */ `
${SKY_GLSL}
uniform float uSwellTime;
uniform vec2 uSwellWind;
uniform vec3 uDeep;
uniform vec3 uSea;
uniform vec3 uShallow;
uniform vec3 uSand;
uniform vec3 uFoam;
uniform vec3 uLightDir;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSwellMax;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vShallow;

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
	float near = 1.0 - smoothstep(14.0, 70.0, dist);
	vec3 normal = vNormal;
	if (near > 0.0) {
		vec2 slope = ripple(vWorld.xz, normalize(uSwellWind + across * 0.31), 1.1855, 3.4102, 0.035, 0.0)
			+ ripple(vWorld.xz, normalize(uSwellWind - across * 0.67), 2.0268, 4.4590, 0.022, 2.3)
			+ ripple(vWorld.xz, normalize(across + uSwellWind * 0.4), 3.3069, 5.6956, 0.012, 3.7);
		normal = normalize(vNormal + vec3(-slope.x, 0.0, -slope.y) * near);
	}

	float crest = clamp(vCrest / uSwellMax, -1.0, 1.0);
	// Deep and saturated underfoot, a touch lighter towards the horizon.
	vec3 body = mix(uDeep, uSea, smoothstep(8.0, 240.0, dist));
	body = mix(body, uShallow, vShallow * 0.85);
	body = mix(body, uSand, smoothstep(0.82, 1.0, vShallow) * 0.35);
	// Low sun through the thin top of a crest: it glows turquoise.
	float backlit = max(dot(-view.xz, normalize(uSunDir.xz)), 0.0);
	body = mix(body, uShallow * 1.1, smoothstep(0.25, 0.95, crest) * (0.15 + 0.4 * backlit) * (1.0 - vShallow));
	float lambert = max(dot(normal, uLightDir), 0.0);
	vec3 color = body * (0.7 + 0.45 * lambert);

	// The sky itself reflected at grazing angles (Schlick): warm towards the sun, blue overhead.
	vec3 mirror = reflect(-view, normal);
	mirror.y = max(mirror.y, 0.01);
	float cosV = max(dot(normal, view), 0.0);
	float fresnel = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
	color = mix(color, skyColor(normalize(mirror)), clamp(fresnel * 0.9, 0.0, 0.72));

	// Sun: crisp glints on each wave face, and a broad warm path below the sun.
	float toSun = max(dot(mirror, uSunDir), 0.0);
	float glint = pow(toSun, 420.0) * 3.2 * uSunDisc;
	float sheen = pow(toSun, 28.0) * 0.32;
	// Underfoot a single wave face fills a patch of screen: keep its glare soft there.
	float glare = smoothstep(8.0, 50.0, dist);
	color += (uSun * glint + uSunGlow * sheen) * glare;

	// Whitecaps break on the highest crests, in crisp streaks along the wind.
	float streak = 0.5 + 0.5 * sin(dot(vWorld.xz, across) * 0.9 + sin(dot(vWorld.xz, uSwellWind) * 0.35) * 2.0);
	float foam = smoothstep(0.66, 0.78, crest) * smoothstep(0.5, 0.7, streak) * (1.0 - smoothstep(140.0, 320.0, dist));
	color = mix(color, uFoam, foam * 0.92);

	float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
	gl_FragColor = vec4(mix(color, horizonColor(-view), fog * fog * (3.0 - 2.0 * fog)), 1.0);
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
				...skyUniforms,
				...shoalUniforms,
				uDeep: { value: palette.seaDeep },
				uSea: { value: palette.sea },
				uShallow: { value: palette.seaShallow },
				uSand: { value: palette.sand },
				uFoam: { value: palette.fleck },
				uLightDir: { value: SUN_LIGHT },
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
		uniforms["uShallow"]!.value = palette.seaShallow;
		uniforms["uSand"]!.value = palette.sand;
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
