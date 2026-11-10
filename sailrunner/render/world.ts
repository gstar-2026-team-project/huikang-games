import { InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, type Scene } from "three";
import type { Point } from "../game/course";
import type { Palette } from "./palette";

/** Most dashes a guide path can draw; longer paths are cut short at the far end. */
const MAX_GUIDE_DASHES = 160;
const GUIDE_DASH_SPACING = 5;

/** The lesson's intended path, drawn as a dashed line on the water. */
export class GuidePath {
	readonly mesh: InstancedMesh;
	private dummy = new Object3D();

	constructor(palette: Palette) {
		const geometry = new PlaneGeometry(1.1, 3);
		geometry.rotateX(-Math.PI / 2);
		this.mesh = new InstancedMesh(
			geometry,
			new MeshBasicMaterial({ color: palette.buoyNext, transparent: true, opacity: 0.8, depthWrite: false }),
			MAX_GUIDE_DASHES,
		);
		this.mesh.count = 0;
		// Instances move far from the mesh origin; a stale bounding sphere would cull them.
		this.mesh.frustumCulled = false;
	}

	setPalette(palette: Palette): void {
		(this.mesh.material as MeshBasicMaterial).color.copy(palette.buoyNext);
	}

	/** Sim-space polyline (x, y); an empty path hides the guide. */
	setPath(points: readonly Point[]): void {
		let count = 0;
		for (let i = 1; i < points.length && count < MAX_GUIDE_DASHES; i++) {
			const a = points[i - 1]!;
			const b = points[i]!;
			const length = Math.hypot(b.x - a.x, b.y - a.y);
			const heading = Math.atan2(b.x - a.x, b.y - a.y);
			for (let d = GUIDE_DASH_SPACING / 2; d < length && count < MAX_GUIDE_DASHES; d += GUIDE_DASH_SPACING) {
				const f = d / length;
				this.dummy.position.set(a.x + (b.x - a.x) * f, 0.05, -(a.y + (b.y - a.y) * f));
				this.dummy.rotation.set(0, -heading, 0);
				this.dummy.updateMatrix();
				this.mesh.setMatrixAt(count++, this.dummy.matrix);
			}
		}
		this.mesh.count = count;
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		(this.mesh.material as MeshBasicMaterial).dispose();
	}
}

export function addToScene(scene: Scene, ...objects: Object3D[]): void {
	for (const object of objects) scene.add(object);
}
