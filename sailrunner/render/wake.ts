import {
	BufferAttribute,
	BufferGeometry,
	DoubleSide,
	DynamicDrawUsage,
	Mesh,
	MeshBasicMaterial,
} from "three";
import type { Palette } from "./palette";

/** Trail samples kept; one is dropped every `SPACING` world units sailed. */
const SAMPLES = 56;
const SPACING = 1.3;
const LIFE_S = 3.4;
/** Ribbon rows: the live stern plus every sample. */
const ROWS = SAMPLES + 1;

/** One foam ribbon: where it sits across the track and how it spreads with age. */
interface Strip {
	side: -1 | 0 | 1;
	offset: number;
	spread: number;
	width: number;
	widen: number;
	alpha: number;
}

/** Two diverging bow-wave arms and a churned centre line: a V-shaped wake. */
const STRIPS: readonly Strip[] = [
	{ side: -1, offset: 0.7, spread: 1.25, width: 0.34, widen: 0.3, alpha: 0.8 },
	{ side: 1, offset: 0.7, spread: 1.25, width: 0.34, widen: 0.3, alpha: 0.8 },
	{ side: 0, offset: 0, spread: 0, width: 0.9, widen: 0.55, alpha: 0.34 },
];

interface Sample {
	x: number;
	z: number;
	/** Unit vector across the track. */
	px: number;
	pz: number;
	born: number;
	/** Foam strength when it was shed (a slow boat leaves little). */
	gain: number;
}

/** The boat's wake: foam ribbons that spread into a V and fade behind the stern. */
export class Wake {
	readonly mesh: Mesh;
	private positions: Float32Array;
	private colors: Float32Array;
	private positionAttribute: BufferAttribute;
	private colorAttribute: BufferAttribute;
	private samples: Sample[] = [];
	private next = 0;
	private last: Sample | null = null;
	private material: MeshBasicMaterial;
	private color: { r: number; g: number; b: number };

	constructor(palette: Palette) {
		const vertices = STRIPS.length * ROWS * 2;
		this.positions = new Float32Array(vertices * 3);
		this.colors = new Float32Array(vertices * 4);
		this.positionAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
		this.colorAttribute = new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage);
		const index: number[] = [];
		for (let s = 0; s < STRIPS.length; s++) {
			for (let row = 0; row < ROWS - 1; row++) {
				const a = (s * ROWS + row) * 2;
				index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
			}
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute("position", this.positionAttribute);
		geometry.setAttribute("color", this.colorAttribute);
		geometry.setIndex(index);
		this.material = new MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			side: DoubleSide,
		});
		this.mesh = new Mesh(geometry, this.material);
		// The ribbon is rewritten every frame, far from the mesh origin.
		this.mesh.frustumCulled = false;
		this.color = palette.wake;
		for (let i = 0; i < SAMPLES; i++) this.samples.push({ x: 0, z: 0, px: 1, pz: 0, born: -99, gain: 0 });
	}

	setPalette(palette: Palette): void {
		this.color = palette.wake;
	}

	reset(): void {
		for (const sample of this.samples) sample.born = -99;
		this.last = null;
	}

	/**
	 * `stern` is the boat's stern in world space while it is moving, and
	 * `heading` its sim heading; pass no stern to let the wake fade out.
	 */
	update(timeSec: number, heading: number, strength: number, stern?: { x: number; z: number }): void {
		// Across the track: the boat's starboard direction in world (x, z).
		const px = Math.cos(heading);
		const pz = Math.sin(heading);
		if (stern) {
			const last = this.last;
			if (!last || Math.hypot(stern.x - last.x, stern.z - last.z) > SPACING) {
				const sample = this.samples[this.next]!;
				sample.x = stern.x;
				sample.z = stern.z;
				sample.px = px;
				sample.pz = pz;
				sample.born = timeSec;
				sample.gain = Math.min(1, strength * 1.4);
				this.next = (this.next + 1) % SAMPLES;
				this.last = sample;
			}
		}
		const { r, g, b } = this.color;
		const live = stern ? Math.min(1, strength * 1.4) : 0;
		STRIPS.forEach((strip, s) => {
			// Collapsed rows park on the last live row, so they draw nothing.
			let holdX = stern?.x ?? this.last?.x ?? 0;
			let holdZ = stern?.z ?? this.last?.z ?? 0;
			for (let row = 0; row < ROWS; row++) {
				let x = holdX;
				let z = holdZ;
				let ax = px;
				let az = pz;
				let age = 0;
				let fade = row === 0 ? live : 0;
				if (row > 0) {
					const sample = this.samples[(this.next - row + SAMPLES * 2) % SAMPLES]!;
					age = timeSec - sample.born;
					if (age < LIFE_S) {
						x = sample.x;
						z = sample.z;
						ax = sample.px;
						az = sample.pz;
						fade = sample.gain * (1 - age / LIFE_S) ** 1.5;
						holdX = x;
						holdZ = z;
					} else {
						age = 0;
					}
				}
				const centre = strip.side * (strip.offset + strip.spread * age);
				const half = fade > 0 ? (strip.width + strip.widen * age) / 2 : 0;
				const v = (s * ROWS + row) * 2;
				for (let edge = 0; edge < 2; edge++) {
					const across = fade > 0 ? centre + (edge === 0 ? -half : half) : 0;
					const p = (v + edge) * 3;
					this.positions[p] = x + ax * across;
					this.positions[p + 1] = 0.035;
					this.positions[p + 2] = z + az * across;
					const c = (v + edge) * 4;
					this.colors[c] = r;
					this.colors[c + 1] = g;
					this.colors[c + 2] = b;
					this.colors[c + 3] = strip.alpha * fade;
				}
			}
		});
		this.positionAttribute.needsUpdate = true;
		this.colorAttribute.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.material.dispose();
	}
}
