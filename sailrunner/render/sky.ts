import {
	BackSide,
	type BufferGeometry,
	Color,
	IcosahedronGeometry,
	Mesh,
	MeshBasicMaterial,
	Group,
	ShaderMaterial,
	SphereGeometry,
	type Vector3,
} from "three";
import { createRng } from "../game/rng";
import { MeshBuilder, place } from "./mesh-builder";
import type { Palette } from "./palette";
import { hazeMaterial, SKY_GLSL, SUN_LIGHT, SUN_SET, SUN_VIEW, skyUniforms } from "./sun";

/** The dome and clouds ride with the camera, inside the far plane. */
const DOME_RADIUS = 1500;
const CLOUD_COUNT = 8;

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DOME_FRAGMENT = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
	vec3 dir = normalize(vDir);
	vec3 color = dir.y > 0.0 ? skyColor(dir) : horizonColor(dir);
	float sun = max(dot(dir, uSunDir), 0.0);
	// A hot white disc with a soft bloom around it.
	color += uSun * pow(sun, 900.0) * 0.8 * uSunDisc;
	color = mix(color, uSun * 1.25, smoothstep(0.99935, 0.99965, sun) * uSunDisc);
	gl_FragColor = vec4(color, 1.0);
	#include <colorspace_fragment>
}`;

/** Gradient sky with the low sun, and big cumulus; one draw call each. */
export class Sky {
	readonly root = new Group();
	private dome: Mesh;
	private domeMaterial: ShaderMaterial;
	private clouds: Mesh;
	private cloudMaterial: MeshBasicMaterial;

	constructor(palette: Palette) {
		this.domeMaterial = new ShaderMaterial({
			vertexShader: DOME_VERTEX,
			fragmentShader: DOME_FRAGMENT,
			uniforms: skyUniforms,
			side: BackSide,
			depthWrite: false,
			fog: false,
		});
		this.dome = new Mesh(new SphereGeometry(DOME_RADIUS, 32, 16), this.domeMaterial);
		this.dome.renderOrder = -2;
		this.dome.frustumCulled = false;

		// Lighting is baked into the cloud vertices; haze sinks their bases into the horizon.
		this.cloudMaterial = hazeMaterial(new MeshBasicMaterial({ vertexColors: true, fog: false }), 0.85);
		this.clouds = new Mesh(cloudGeometry(palette), this.cloudMaterial);
		this.clouds.frustumCulled = false;
		this.root.add(this.dome, this.clouds);
	}

	setPalette(palette: Palette): void {
		// The dome reads the shared sky uniforms; only the baked clouds need rebuilding.
		this.clouds.geometry.dispose();
		this.clouds.geometry = cloudGeometry(palette);
	}

	/** Keep the sky centred on the camera so it never gets nearer. */
	update(cameraX: number, cameraZ: number, timeSec: number): void {
		this.root.position.set(cameraX, 0, cameraZ);
		// A very slow drift: enough to feel alive, too slow to swing the baked light.
		this.clouds.rotation.y = timeSec * 0.0007;
	}

	dispose(): void {
		this.dome.geometry.dispose();
		this.domeMaterial.dispose();
		this.clouds.geometry.dispose();
		this.cloudMaterial.dispose();
	}
}

/** Sunlit tops, cool flat bases, and a warm edge on the side facing the sun. */
function cloudShader(palette: Palette, base: number, top: number) {
	const lit = palette.cloud;
	const shade = palette.cloudShade;
	const out = new Color();
	// After sunset only the faces turned to the afterglow stay pink; the rest go blue-grey.
	const night = palette.night > 0.5;
	const sunDir = night ? SUN_SET : SUN_LIGHT;
	return (centre: Vector3, normal: Vector3): Color => {
		const height = Math.min(1, Math.max(0, (centre.y - base) / (top - base)));
		const sun = normal.dot(sunDir) * 0.5 + 0.5;
		const up = Math.max(0, normal.y);
		const toward = Math.max(0, centre.clone().setY(0).normalize().dot(sunDir) / Math.hypot(sunDir.x, sunDir.z));
		const light = night
			? Math.min(1, 0.05 + 0.55 * sun * sun + 0.15 * height + 0.5 * toward * toward - (normal.y < -0.4 ? 0.3 : 0))
			: Math.min(1, 0.15 + 0.55 * sun + 0.35 * up + 0.35 * height - (normal.y < -0.4 ? 0.4 : 0));
		out.copy(shade).lerp(lit, light);
		// Facing the low sun, the edge goes golden.
		const towards = Math.max(0, normal.dot(SUN_VIEW));
		return out.lerp(palette.sunGlow, towards * towards * 0.35).clone();
	};
}

/** Towering cumulus low around the horizon, merged into one geometry. */
function cloudGeometry(palette: Palette): BufferGeometry {
	const rng = createRng(41);
	const builder = new MeshBuilder();
	for (let i = 0; i < CLOUD_COUNT; i++) {
		const azimuth = (i / CLOUD_COUNT) * Math.PI * 2 + rng() * 0.6;
		const distance = 950 + rng() * 300;
		const base = 70 + rng() * 60;
		const size = 34 + rng() * 34;
		const cx = Math.sin(azimuth) * distance;
		const cz = Math.cos(azimuth) * distance;
		// Puffs line up across the line of sight so each cloud reads as a broad bank.
		const ax = Math.cos(azimuth);
		const az = -Math.sin(azimuth);
		const width = 2 + Math.floor(rng() * 3);
		const top = base + size * (1.6 + rng() * 0.8);
		const shade = cloudShader(palette, base, top);
		const puff = (along: number, lift: number, radius: number, depth: number) => {
			builder.addShaded(
				new IcosahedronGeometry(1, 1),
				place(
					[cx + ax * along + Math.sin(azimuth) * depth, base + lift, cz + az * along + Math.cos(azimuth) * depth],
					[radius * 1.2, radius * 0.85, radius],
					[0, rng() * Math.PI, 0],
				),
				shade,
				// Flatten the underside: cumulus sit on a level base.
				(v) => {
					if (v.y < base + 2) v.y = base + 2 + (v.y - base - 2) * 0.15;
				},
			);
		};
		for (let p = 0; p < width; p++) {
			const along = (p - (width - 1) / 2) * size * 1.25;
			const middle = 1 - Math.abs(p - (width - 1) / 2) / width;
			const r = size * (0.7 + 0.5 * middle + rng() * 0.15);
			puff(along, r * 0.55, r, 0);
			// A second tier, then a tower over the middle.
			puff(along + (rng() - 0.5) * size * 0.4, r * 1.25, r * 0.72, -r * 0.2);
			if (middle > 0.6) puff(along + (rng() - 0.5) * size * 0.3, r * 1.9, r * 0.55, -r * 0.1);
		}
	}
	return builder.build();
}
