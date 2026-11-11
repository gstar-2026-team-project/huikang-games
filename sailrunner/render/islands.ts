import {
	AdditiveBlending,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	Vector3,
} from "three";
import type { Point } from "../game/course";
import { beamGeometry, type IslandSpec, islandGeometry, islandSpecs } from "./island-geometry";
import type { Palette } from "./palette";
import { hazeMaterial } from "./sun";

/** Islands the water shades turquoise around (the near and middle ones). */
export const SHOAL_COUNT = 6;

/** Shallows for the water shader: world (x, z) and shoreline radius of each island. */
export const shoalUniforms = {
	uShoals: { value: Array.from({ length: SHOAL_COUNT }, () => new Vector3(0, 0, -1)) },
};

/**
 * Islands ringing the course in three depths: detailed near islands with
 * beaches, cypresses, a village and a lighthouse; bigger ones behind; and far
 * mountains that are little more than hazy silhouettes. At blue hour their
 * windows and the lighthouse light up.
 */
export class Islands {
	readonly root = new Group();
	private specs: IslandSpec[] = islandSpecs();
	private land: Mesh;
	private lamps: Mesh;
	private beam: Mesh;
	private material: MeshLambertMaterial;
	private lampMaterial = new MeshBasicMaterial({ vertexColors: true, fog: false });
	private beamMaterial = new MeshBasicMaterial({
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		fog: false,
	});

	constructor(palette: Palette) {
		this.material = hazeMaterial(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, fog: false }), 0.6);
		const geometry = islandGeometry(this.specs, palette);
		this.land = new Mesh(geometry.land, this.material);
		this.lamps = new Mesh(geometry.lamps, this.lampMaterial);
		this.beam = new Mesh(beamGeometry(palette.lamp), this.beamMaterial);
		this.beam.position.set(...geometry.lantern);
		for (const mesh of [this.land, this.lamps, this.beam]) mesh.frustumCulled = false;
		this.root.add(this.land, this.lamps, this.beam);
		this.setNight(palette.night);
	}

	private setNight(night: number): void {
		this.lamps.visible = night > 0.5;
		this.beam.visible = night > 0.5;
	}

	setPalette(palette: Palette): void {
		const geometry = islandGeometry(this.specs, palette);
		this.land.geometry.dispose();
		this.land.geometry = geometry.land;
		this.lamps.geometry.dispose();
		this.lamps.geometry = geometry.lamps;
		this.beam.geometry.dispose();
		this.beam.geometry = beamGeometry(palette.lamp);
		this.setNight(palette.night);
	}

	/** Centre the ring on the course so no island sits among the marks. */
	setCentre(start: Point): void {
		this.root.position.set(start.x, 0, -start.y);
		const shoals = this.specs.filter((spec) => spec.tier < 2).slice(0, SHOAL_COUNT);
		shoalUniforms.uShoals.value.forEach((shoal, i) => {
			const spec = shoals[i];
			if (spec) shoal.set(start.x + spec.x, -start.y + spec.z, spec.radius * 1.06);
			else shoal.set(0, 0, -1);
		});
	}

	/** Spots just off the near islands' beaches, facing the course, relative to its centre. */
	anchorages(): Array<{ x: number; z: number }> {
		return this.specs
			.filter((spec) => spec.tier === 0)
			.slice(1)
			.map((spec) => {
				const d = Math.hypot(spec.x, spec.z);
				const k = (d - spec.radius * 1.45) / d;
				return { x: spec.x * k, z: spec.z * k };
			});
	}

	/** Sweep the lighthouse beam (blue hour only). */
	update(timeSec: number): void {
		if (this.beam.visible) this.beam.rotation.y = timeSec * 0.5;
	}

	dispose(): void {
		for (const mesh of [this.land, this.lamps, this.beam]) mesh.geometry.dispose();
		this.material.dispose();
		this.lampMaterial.dispose();
		this.beamMaterial.dispose();
	}
}
