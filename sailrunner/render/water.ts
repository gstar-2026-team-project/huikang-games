import {
	Group,
	InstancedMesh,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	PlaneGeometry,
	ShaderMaterial,
	Vector2,
	Vector3,
} from "three";
import { createRng } from "../game/rng";
import type { Palette } from "./palette";

const FLECK_COUNT = 420;
/** Flecks tile the sea in a square this wide around the camera target. */
const FLECK_CELL = 320;

/** Distance fog shared by the water shader and the scene's built-in fog. */
export const FOG_NEAR = 220;
export const FOG_FAR = 1000;

/** World-space direction towards the sun (unit length). */
export const SUN_DIRECTION = new Vector3(-0.46, 0.4, -0.79).normalize();

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	gl_Position = projectionMatrix * viewMatrix * world;
}`;

// The plane stays flat: every wave is shading. The sea is cut into triangular
// facets, each lit by the swell's slope at its centre, which gives a low-poly
// look for the price of six trig calls a pixel and no geometry at all.
const FRAGMENT = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uSea;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform vec3 uFoam;
uniform vec3 uSunDir;
uniform vec2 uWind;
uniform float uTime;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorld;

const float FACET = 4.0;

vec2 facetCentre(vec2 p) {
	vec2 q = vec2(p.x - p.y * 0.5773503, p.y * 1.1547005) / FACET;
	vec2 cell = floor(q);
	vec2 f = q - cell;
	vec2 c = cell + mix(vec2(1.0 / 3.0), vec2(2.0 / 3.0), step(1.0, f.x + f.y));
	return vec2(c.x + c.y * 0.5, c.y * 0.8660254) * FACET;
}

// Height in x, slope in yz, of one swell train travelling along 'dir'.
vec3 wave(vec2 p, vec2 dir, float k, float speed, float phase) {
	float a = dot(p, dir) * k - uTime * speed + phase;
	return vec3(sin(a), cos(a) * k * dir);
}

void main() {
	vec3 toFrag = vWorld - cameraPosition;
	float dist = length(toFrag);
	vec3 view = -toFrag / dist;

	// Facets shrink below a pixel far away; fade them out before they shimmer.
	float detail = 1.0 - smoothstep(60.0, 260.0, dist);
	vec2 p = mix(vWorld.xz, facetCentre(vWorld.xz), step(0.001, detail));
	vec2 across = vec2(-uWind.y, uWind.x);
	vec3 w = wave(p, uWind, 0.1, 0.9, 0.0) * 0.5
		+ wave(p, normalize(uWind + across * 0.6), 0.21, 1.3, 1.7) * 0.3
		+ wave(p, normalize(uWind - across * 0.8), 0.37, 1.9, 4.1) * 0.2;
	vec3 normal = normalize(vec3(-w.y * 1.5 * detail, 1.0, -w.z * 1.5 * detail));

	// Deep and saturated underfoot, paler towards the horizon.
	vec3 color = mix(uDeep, uSea, smoothstep(12.0, 150.0, dist));
	color *= 1.0 + 0.1 * w.x * detail;
	float facing = max(dot(normal, uSunDir), 0.0);
	color *= 0.8 + 0.42 * facing;
	// Half-flattened normal: neighbouring facets should not flip between sea and sky.
	vec3 soft = normalize(normal + vec3(0.0, 1.0, 0.0));
	float fresnel = pow(1.0 - max(dot(soft, view), 0.0), 5.0);
	color = mix(color, uHaze, fresnel * 0.42 * (0.45 + 0.55 * smoothstep(10.0, 90.0, dist)));

	// Sun glitter: a tight reflection on each facet, and a soft column of
	// light on the water under the sun that survives where facets fade.
	vec3 mirror = reflect(-view, normal);
	float glint = pow(max(dot(mirror, uSunDir), 0.0), 140.0);
	vec2 sunAzimuth = normalize(uSunDir.xz);
	float column = pow(max(dot(normalize(toFrag.xz), sunAzimuth), 0.0), 220.0);
	float path = column * smoothstep(20.0, 160.0, dist) * (0.3 + 0.25 * w.x * detail);
	// Facet glints gather towards the sun rather than speckling the whole sea.
	float towardsSun = pow(max(dot(normalize(toFrag.xz), sunAzimuth), 0.0), 6.0);
	// No glints underfoot, where one facet would flood a patch of screen.
	float sparkle = detail * smoothstep(22.0, 80.0, dist) * (0.08 + 0.6 * towardsSun);
	color += uSun * (glint * sparkle + path);

	// Whitecaps on the sharpest crests.
	color = mix(color, uFoam, smoothstep(0.8, 0.98, w.x) * 0.22 * detail);

	float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
	gl_FragColor = vec4(mix(color, uHaze, fog), 1.0);
	#include <colorspace_fragment>
}`;

/** The sea: one shaded plane that follows the boat, plus wind flecks. */
export class Sea {
	readonly root = new Group();
	private water: Mesh;
	private material: ShaderMaterial;
	private flecks: InstancedMesh;
	private fleckBase: Array<[number, number]> = [];
	private dummy = new Object3D();

	constructor(palette: Palette) {
		this.material = new ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			uniforms: {
				uDeep: { value: palette.seaDeep },
				uSea: { value: palette.sea },
				uHaze: { value: palette.sky },
				uSun: { value: palette.sun },
				uFoam: { value: palette.fleck },
				uSunDir: { value: SUN_DIRECTION },
				uWind: { value: new Vector2(0, 1) },
				uTime: { value: 0 },
				uFogNear: { value: FOG_NEAR },
				uFogFar: { value: FOG_FAR },
			},
		});
		const plane = new PlaneGeometry(3600, 3600);
		plane.rotateX(-Math.PI / 2);
		this.water = new Mesh(plane, this.material);
		this.water.frustumCulled = false;
		this.root.add(this.water);

		const fleckGeometry = new PlaneGeometry(2.6, 0.32);
		fleckGeometry.rotateX(-Math.PI / 2);
		this.flecks = new InstancedMesh(
			fleckGeometry,
			new MeshBasicMaterial({ color: palette.fleck, transparent: true, opacity: 0.5, depthWrite: false }),
			FLECK_COUNT,
		);
		const rng = createRng(7);
		for (let i = 0; i < FLECK_COUNT; i++) {
			this.fleckBase.push([rng() * FLECK_CELL, rng() * FLECK_CELL]);
		}
		this.flecks.frustumCulled = false;
		this.root.add(this.flecks);
	}

	setPalette(palette: Palette): void {
		const uniforms = this.material.uniforms;
		uniforms["uDeep"]!.value = palette.seaDeep;
		uniforms["uSea"]!.value = palette.sea;
		uniforms["uHaze"]!.value = palette.sky;
		uniforms["uSun"]!.value = palette.sun;
		uniforms["uFoam"]!.value = palette.fleck;
		(this.flecks.material as MeshBasicMaterial).color.copy(palette.fleck);
	}

	/** Re-centre the water and flecks on the focus point (world x, z). */
	update(focusX: number, focusZ: number, wind: number, timeSec: number): void {
		this.water.position.set(focusX, 0, focusZ);
		const uniforms = this.material.uniforms;
		// The swell runs downwind: `wind` is where the wind comes from.
		(uniforms["uWind"]!.value as Vector2).set(-Math.sin(wind), Math.cos(wind));
		// Wrapped so the phase stays precise in a long session; every wave speed
		// in the shader is a multiple of 0.1, so the wrap is seamless.
		uniforms["uTime"]!.value = timeSec % (Math.PI * 20);
		const fleckAngle = -wind + Math.PI / 2;
		for (let i = 0; i < FLECK_COUNT; i++) {
			const [bx, bz] = this.fleckBase[i]!;
			const x = bx + FLECK_CELL * Math.round((focusX - bx) / FLECK_CELL);
			const z = bz + FLECK_CELL * Math.round((focusZ - bz) / FLECK_CELL);
			this.dummy.position.set(x, 0.04, z);
			this.dummy.rotation.set(0, fleckAngle, 0);
			const s = 0.75 + 0.35 * Math.sin(timeSec * 0.9 + i);
			this.dummy.scale.set(s, 1, 1);
			this.dummy.updateMatrix();
			this.flecks.setMatrixAt(i, this.dummy.matrix);
		}
		this.flecks.instanceMatrix.needsUpdate = true;
	}

	dispose(): void {
		this.water.geometry.dispose();
		this.material.dispose();
		this.flecks.geometry.dispose();
		(this.flecks.material as MeshBasicMaterial).dispose();
	}
}
