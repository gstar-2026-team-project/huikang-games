import {
	BufferGeometry,
	CylinderGeometry,
	DoubleSide,
	ExtrudeGeometry,
	Float32BufferAttribute,
	Group,
	Mesh,
	MeshLambertMaterial,
	Shape,
} from "three";
import { MAX_SPEED } from "../game/constants";
import { normalizeAngle, sailSide, trueWindAngle } from "../game/physics";
import type { Palette } from "./palette";

/** Boat length in world units; marks are a few boat lengths wide. */
export const BOAT_LENGTH = 6;

export interface BoatPose {
	x: number;
	y: number;
	heading: number;
	speed: number;
}

export interface BoatModel {
	group: Group;
	update(pose: BoatPose, wind: number, steer: number, timeSec: number): void;
	dispose(): void;
}

function hullGeometry(): ExtrudeGeometry {
	// Deck outline in the XZ plane, bow toward -Z.
	const half = BOAT_LENGTH / 2;
	const shape = new Shape();
	shape.moveTo(0, -half);
	shape.bezierCurveTo(1.1, -half * 0.55, 1.15, half * 0.3, 0.95, half);
	shape.lineTo(-0.95, half);
	shape.bezierCurveTo(-1.15, half * 0.3, -1.1, -half * 0.55, 0, -half);
	const geometry = new ExtrudeGeometry(shape, {
		depth: 0.7,
		bevelEnabled: true,
		bevelThickness: 0.25,
		bevelSize: 0.12,
		bevelSegments: 2,
		curveSegments: 10,
	});
	// Extrusion runs along +Z; lay it flat so the deck faces up.
	geometry.rotateX(Math.PI / 2);
	geometry.translate(0, 0.55, 0);
	return geometry;
}

function triangle(a: number[], b: number[], c: number[]): BufferGeometry {
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute([...a, ...b, ...c], 3));
	geometry.computeVertexNormals();
	return geometry;
}

/** Boom angle off the centreline for a given true wind angle (radians). */
function boomAngle(twa: number): number {
	const t = Math.min(1, Math.max(0, (twa - 0.66) / (Math.PI - 0.66)));
	return 0.12 + t * 1.25;
}

export function createBoatModel(palette: Palette): BoatModel {
	const material = (color: Palette[keyof Palette]) =>
		new MeshLambertMaterial({ color, side: DoubleSide });
	const hullMaterial = material(palette.hull);
	const deckMaterial = material(palette.deck);
	const sailMaterial = material(palette.sail);
	const accentMaterial = material(palette.accent);

	const group = new Group();
	const heel = new Group();
	group.add(heel);

	const hull = new Mesh(hullGeometry(), hullMaterial);
	heel.add(hull);
	const stripe = new Mesh(new CylinderGeometry(0.08, 0.08, BOAT_LENGTH * 0.62, 6), accentMaterial);
	stripe.rotation.x = Math.PI / 2;
	stripe.position.set(0, 0.62, 0.3);
	heel.add(stripe);
	const cockpit = new Mesh(new CylinderGeometry(0.55, 0.7, 0.3, 10), deckMaterial);
	cockpit.position.set(0, 0.7, 1.6);
	heel.add(cockpit);

	const mastX = 0;
	const mastZ = -0.7;
	const mastHeight = 8.5;
	const mast = new Mesh(new CylinderGeometry(0.07, 0.1, mastHeight, 6), deckMaterial);
	mast.position.set(mastX, 0.6 + mastHeight / 2, mastZ);
	heel.add(mast);

	// Mainsail pivots on the mast; its foot (the boom) runs aft along +Z.
	const mainPivot = new Group();
	mainPivot.position.set(mastX, 1.3, mastZ);
	heel.add(mainPivot);
	const main = new Mesh(triangle([0, 0, 0], [0, mastHeight - 1, 0], [0, 0, 3.4]), sailMaterial);
	mainPivot.add(main);
	const boomMesh = new Mesh(new CylinderGeometry(0.06, 0.06, 3.5, 5), deckMaterial);
	boomMesh.rotation.x = Math.PI / 2;
	boomMesh.position.set(0, 0, 1.75);
	mainPivot.add(boomMesh);

	// Jib pivots on the forestay near the bow.
	const jibPivot = new Group();
	jibPivot.position.set(0, 1.1, -BOAT_LENGTH / 2 + 0.4);
	heel.add(jibPivot);
	const jib = new Mesh(triangle([0, 0, 0], [0, mastHeight - 2, 2.1], [0, 0, 2.1]), sailMaterial);
	jibPivot.add(jib);

	const rudder = new Mesh(new CylinderGeometry(0.05, 0.05, 1.2, 4), deckMaterial);
	rudder.position.set(0, 0.2, BOAT_LENGTH / 2);
	heel.add(rudder);

	let rudderAngle = 0;
	let heelAngle = 0;
	let boomSwing = 0;

	return {
		group,
		update(pose, wind, steer, timeSec) {
			group.position.set(pose.x, 0, -pose.y);
			group.rotation.y = -pose.heading;
			const twa = trueWindAngle(pose.heading, wind);
			const side = sailSide(pose.heading, wind);
			const power = Math.min(1, pose.speed / MAX_SPEED);
			const inIrons = twa < 0.7;
			// Ease the controls so the boat visibly reacts to every input.
			rudderAngle += (steer * 0.5 - rudderAngle) * 0.2;
			rudder.rotation.y = -rudderAngle;
			const targetHeel = inIrons ? 0 : -side * power * 0.32 * Math.sin(Math.min(twa, Math.PI / 2));
			heelAngle += (targetHeel - heelAngle) * 0.06;
			const targetBoom = side * boomAngle(twa);
			boomSwing += normalizeAngle(targetBoom - boomSwing) * 0.08;
			const flutter = inIrons ? Math.sin(timeSec * 22) * 0.12 : 0;
			heel.rotation.z = heelAngle + Math.sin(timeSec * 1.7) * 0.025;
			heel.rotation.x = Math.sin(timeSec * 1.3 + 0.6) * 0.02 - power * 0.03;
			mainPivot.rotation.y = boomSwing + flutter;
			jibPivot.rotation.y = boomSwing * 0.7 + flutter * 1.4;
		},
		dispose() {
			group.traverse((node) => {
				if (node instanceof Mesh) node.geometry.dispose();
			});
			for (const m of [hullMaterial, deckMaterial, sailMaterial, accentMaterial]) m.dispose();
		},
	};
}
