import {
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	type Color,
	DynamicDrawUsage,
	Points,
	PointsMaterial,
} from "three";

/** Droplets in flight at once; each relaunches from the bow on its own clock. */
const DROPS = 36;
/** Seconds a droplet is in the air. */
const FLIGHT_S = 0.75;
const GRAVITY = 9;

function hash(i: number, k: number): number {
	const h = Math.sin(i * 91.7 + k * 47.3) * 24634.6345;
	return h - Math.floor(h);
}

/** Soft round dot, drawn once. */
function dotTexture(): CanvasTexture | null {
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 32;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
	g.addColorStop(0, "rgba(255,255,255,1)");
	g.addColorStop(0.45, "rgba(255,255,255,0.8)");
	g.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 32, 32);
	return new CanvasTexture(canvas);
}

/**
 * Spray flung off both bows when the boat is fast: droplets thrown up and
 * out, falling back and streaming aft. Lives in the boat's own frame (bow
 * towards -Z), one draw call.
 */
export class BowSpray {
	readonly points: Points;
	private positions = new Float32Array(DROPS * 3);
	private colors = new Float32Array(DROPS * 4);
	private positionAttribute: BufferAttribute;
	private colorAttribute: BufferAttribute;
	private material: PointsMaterial;
	private color: Color;

	constructor(color: Color, bowZ: number) {
		this.color = color;
		this.bowZ = bowZ;
		const geometry = new BufferGeometry();
		this.positionAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
		this.colorAttribute = new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage);
		geometry.setAttribute("position", this.positionAttribute);
		geometry.setAttribute("color", this.colorAttribute);
		this.material = new PointsMaterial({
			size: 0.42,
			map: dotTexture(),
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			sizeAttenuation: true,
		});
		this.points = new Points(geometry, this.material);
		this.points.frustumCulled = false;
	}

	private bowZ: number;

	/** `amount` 0..1 (none below a brisk speed); `speed` in m/s to stream the drops aft. */
	update(timeSec: number, amount: number, speed: number): void {
		this.points.visible = amount > 0.02;
		if (!this.points.visible) return;
		const { r, g, b } = this.color;
		for (let i = 0; i < DROPS; i++) {
			const t = timeSec / FLIGHT_S + hash(i, 1);
			const age = (t - Math.floor(t)) * FLIGHT_S;
			const life = Math.floor(t);
			const side = i % 2 === 0 ? 1 : -1;
			const out = 1.6 + hash(i, life + 2) * 2.4;
			const up = 2.2 + hash(i, life + 3) * 2.6 * amount;
			const back = 0.6 + hash(i, life + 4) * 0.8 + speed * 0.16;
			const start = hash(i, life + 5) * 1.2;
			const p = i * 3;
			this.positions[p] = side * (0.55 + start * 0.4 + out * age);
			this.positions[p + 1] = 0.35 + up * age - 0.5 * GRAVITY * age * age;
			this.positions[p + 2] = this.bowZ + 0.4 + start + back * age;
			const fade = Math.sin((Math.PI * age) / FLIGHT_S) * amount * (this.positions[p + 1]! > 0 ? 1 : 0);
			const c = i * 4;
			this.colors[c] = r;
			this.colors[c + 1] = g;
			this.colors[c + 2] = b;
			this.colors[c + 3] = fade * 0.9;
		}
		this.positionAttribute.needsUpdate = true;
		this.colorAttribute.needsUpdate = true;
	}

	dispose(): void {
		this.points.geometry.dispose();
		this.material.map?.dispose();
		this.material.dispose();
	}
}
