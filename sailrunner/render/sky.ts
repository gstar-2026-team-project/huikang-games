import {
	BackSide,
	type BufferGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	Group,
	IcosahedronGeometry,
	Mesh,
	MeshLambertMaterial,
	ShaderMaterial,
	SphereGeometry,
} from "three";
import type { Point } from "../game/course";
import { createRng } from "../game/rng";
import { MeshBuilder, place } from "./mesh-builder";
import type { Palette } from "./palette";
import { SUN_DIRECTION } from "./water";

/** The dome and clouds ride with the camera, inside the far plane. */
const DOME_RADIUS = 1500;
const CLOUD_COUNT = 9;
/** Islands ring the course at about this distance from its start. */
const ISLAND_RING = 760;
const ISLAND_COUNT = 8;

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
	vec3 dir = normalize(vDir);
	float up = max(dir.y, 0.0);
	vec3 color = mix(uHaze, uTop, pow(smoothstep(0.0, 0.62, up), 0.75));
	float sun = max(dot(dir, uSunDir), 0.0);
	// Wide warm glow, tighter halo, then the disc itself.
	color += uSun * (pow(sun, 10.0) * 0.22 + pow(sun, 120.0) * 0.4);
	color = mix(color, uSun * 1.15, smoothstep(0.99925, 0.9996, sun));
	gl_FragColor = vec4(color, 1.0);
	#include <colorspace_fragment>
}`;

/** Gradient sky with a sun, and low-poly clouds; all one draw call each. */
export class Sky {
	readonly root = new Group();
	private dome: Mesh;
	private domeMaterial: ShaderMaterial;
	private clouds: Mesh;
	private cloudMaterial: MeshLambertMaterial;

	constructor(palette: Palette) {
		this.domeMaterial = new ShaderMaterial({
			vertexShader: DOME_VERTEX,
			fragmentShader: DOME_FRAGMENT,
			uniforms: {
				uTop: { value: palette.skyTop },
				uHaze: { value: palette.sky },
				uSun: { value: palette.sun },
				uSunDir: { value: SUN_DIRECTION },
			},
			side: BackSide,
			depthWrite: false,
			fog: false,
		});
		this.dome = new Mesh(new SphereGeometry(DOME_RADIUS, 24, 12), this.domeMaterial);
		this.dome.renderOrder = -2;
		this.dome.frustumCulled = false;

		// Clouds take their tint from the material so a scheme change is one copy.
		this.cloudMaterial = new MeshLambertMaterial({
			color: palette.cloud,
			emissive: palette.cloud.clone().multiplyScalar(0.45),
			flatShading: true,
			fog: false,
			side: DoubleSide,
		});
		this.clouds = new Mesh(cloudGeometry(), this.cloudMaterial);
		this.clouds.frustumCulled = false;
		this.root.add(this.dome, this.clouds);
	}

	setPalette(palette: Palette): void {
		const uniforms = this.domeMaterial.uniforms;
		uniforms["uTop"]!.value = palette.skyTop;
		uniforms["uHaze"]!.value = palette.sky;
		uniforms["uSun"]!.value = palette.sun;
		this.cloudMaterial.color.copy(palette.cloud);
		this.cloudMaterial.emissive.copy(palette.cloud).multiplyScalar(0.45);
	}

	/** Keep the sky centred on the camera so it never gets nearer. */
	update(cameraX: number, cameraZ: number, timeSec: number): void {
		this.root.position.set(cameraX, 0, cameraZ);
		// A very slow drift: enough to feel alive during a race.
		this.clouds.rotation.y = timeSec * 0.0025;
	}

	dispose(): void {
		this.dome.geometry.dispose();
		this.domeMaterial.dispose();
		this.clouds.geometry.dispose();
		this.cloudMaterial.dispose();
	}
}

/** Puffy clouds low in the sky all around, merged into one geometry. */
function cloudGeometry(): BufferGeometry {
	const rng = createRng(41);
	const builder = new MeshBuilder();
	const white = new Color(1, 1, 1);
	for (let i = 0; i < CLOUD_COUNT; i++) {
		const azimuth = (i / CLOUD_COUNT) * Math.PI * 2 + rng() * 0.5;
		const distance = 900 + rng() * 350;
		const height = 130 + rng() * 170;
		const cx = Math.sin(azimuth) * distance;
		const cz = Math.cos(azimuth) * distance;
		const size = 24 + rng() * 20;
		const puffs = 3 + Math.floor(rng() * 3);
		// Puffs line up across the line of sight so each cloud reads as a bank.
		const ax = Math.cos(azimuth);
		const az = -Math.sin(azimuth);
		for (let p = 0; p < puffs; p++) {
			const along = (p - (puffs - 1) / 2) * size * 1.15;
			const middle = 1 - Math.abs(p - (puffs - 1) / 2) / puffs;
			const s = size * (0.65 + 0.6 * middle + rng() * 0.2);
			builder.add(
				new IcosahedronGeometry(1, 1),
				place(
					[cx + ax * along, height + s * 0.28, cz + az * along],
					[s * 1.3, s * 0.55, s * 1.1],
					[0, rng() * Math.PI, 0],
				),
				white,
			);
		}
	}
	return builder.build();
}

/** Hazy low-poly islands on the horizon: a fixed place to sail past. */
export class Islands {
	readonly mesh: Mesh;
	private material: MeshLambertMaterial;

	constructor(palette: Palette) {
		// Not fogged: the island colour is already the hazy silhouette, and the
		// far side of the ring would otherwise vanish.
		this.material = new MeshLambertMaterial({
			color: palette.island,
			emissive: palette.island.clone().multiplyScalar(0.4),
			vertexColors: true,
			flatShading: true,
			fog: false,
			side: DoubleSide,
		});
		this.mesh = new Mesh(islandGeometry(), this.material);
		this.mesh.frustumCulled = false;
	}

	setPalette(palette: Palette): void {
		this.material.color.copy(palette.island);
		this.material.emissive.copy(palette.island).multiplyScalar(0.4);
	}

	/** Centre the ring on the course so no island sits among the marks. */
	setCentre(start: Point): void {
		this.mesh.position.set(start.x, 0, -start.y);
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.material.dispose();
	}
}

function islandGeometry(): BufferGeometry {
	const rng = createRng(97);
	const builder = new MeshBuilder();
	// Vertex colours multiply the island tint: hills full strength, the
	// lighthouse nearly white so it catches the eye.
	const land = new Color(1, 1, 1);
	const pale = new Color(1.9, 1.75, 1.65);
	const cap = new Color(1.9, 0.7, 0.55);
	for (let i = 0; i < ISLAND_COUNT; i++) {
		const azimuth = (i / ISLAND_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.5;
		const distance = ISLAND_RING + (rng() - 0.5) * 160;
		const cx = Math.sin(azimuth) * distance;
		const cz = Math.cos(azimuth) * distance;
		const ax = Math.cos(azimuth);
		const az = -Math.sin(azimuth);
		const hills = 2 + Math.floor(rng() * 3);
		for (let h = 0; h < hills; h++) {
			const along = (h - (hills - 1) / 2) * 62 + (rng() - 0.5) * 20;
			const radius = 55 + rng() * 60;
			const height = 16 + rng() * 34;
			// Blunt, lopsided hills rather than neat cones.
			builder.add(
				new CylinderGeometry(0.12 + rng() * 0.3, 1, 1, 7, 1),
				place(
					[cx + ax * along, height / 2 - 1.5, cz + az * along],
					[radius, height, radius * (0.6 + rng() * 0.3)],
					[0, rng() * Math.PI, (rng() - 0.5) * 0.12],
				),
				land,
			);
		}
		// A long low spit of land ties each group's hills together.
		builder.add(
			new CylinderGeometry(0.72, 1, 1, 7, 1),
			place([cx, 2.5, cz], [hills * 46, 8, 52], [0, azimuth, 0]),
			land,
		);
		if (i === 2) {
			const lx = cx + ax * hills * 38;
			const lz = cz + az * hills * 38;
			builder.add(new CylinderGeometry(2.6, 4, 30, 6), place([lx, 20, lz]), pale);
			builder.add(new ConeGeometry(4.2, 7, 6), place([lx, 38.5, lz]), cap);
		}
	}
	return builder.build();
}
