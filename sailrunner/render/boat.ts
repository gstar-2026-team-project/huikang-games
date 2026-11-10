import { DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial } from "three";
import { MAX_SPEED } from "../game/constants";
import { normalizeAngle, sailSide, trueWindAngle } from "../game/physics";
import {
	BOAT_LENGTH,
	BOAT_SCALE,
	boomGeometry,
	bowWaveGeometry,
	crewGeometry,
	hullGeometry,
	jibGeometry,
	mainsailGeometry,
	RIG,
	rudderGeometry,
	shadowGeometry,
} from "./boat-parts";
import type { Palette } from "./palette";
import { SUN_DIRECTION } from "./water";

export { BOAT_LENGTH, BOAT_SCALE };

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

/** Boom angle off the centreline for a given true wind angle (radians). */
function boomAngle(twa: number): number {
	const t = Math.min(1, Math.max(0, (twa - 0.66) / (Math.PI - 0.66)));
	return 0.12 + t * 1.25;
}

/** Sails collapse to nothing at scale 0, which breaks their normals; keep a sliver. */
function sailFill(value: number): number {
	if (Math.abs(value) >= 0.06) return value;
	return value < 0 ? -0.06 : 0.06;
}

/** Shadow centre offset and heading: it falls away from the sun. */
const SHADOW_REACH = 3.6;
const SUN_FLAT = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);
const SHADOW_X = -SUN_DIRECTION.x / SUN_FLAT;
const SHADOW_Z = -SUN_DIRECTION.z / SUN_FLAT;

export function createBoatModel(palette: Palette): BoatModel {
	const solid = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
	// Sailcloth glows a little when backlit instead of going grey.
	const cloth = new MeshLambertMaterial({
		vertexColors: true,
		side: DoubleSide,
		emissive: palette.sail.clone().multiplyScalar(0.2),
	});
	const foam = new MeshBasicMaterial({
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
	});

	const group = new Group();
	/** Follows position and heading, and rides the swell. */
	const frame = new Group();
	/** Heels and pitches inside the frame. */
	const heel = new Group();
	frame.add(heel);
	frame.scale.setScalar(BOAT_SCALE);
	group.add(frame);

	heel.add(new Mesh(hullGeometry(palette), solid));

	const rudder = new Mesh(rudderGeometry(palette), solid);
	rudder.position.set(0, 0, BOAT_LENGTH / 2);
	heel.add(rudder);

	const crew = new Mesh(crewGeometry(palette), solid);
	crew.position.set(0, 0.92, 1.75);
	heel.add(crew);

	// Mainsail and boom pivot on the mast; the boom runs aft along +Z.
	const mainPivot = new Group();
	mainPivot.position.set(0, RIG.boomY, RIG.mastZ);
	heel.add(mainPivot);
	const main = new Mesh(mainsailGeometry(palette), cloth);
	main.position.y = 0.08;
	mainPivot.add(main, new Mesh(boomGeometry(palette), solid));

	// The jib swings about the forestay, which leans aft from tack to hoist.
	const stayRise = RIG.hoistY - RIG.tackY;
	const stayRun = RIG.mastZ - RIG.tackZ;
	const stayLean = Math.atan2(stayRun, stayRise);
	const jibStay = new Group();
	jibStay.position.set(0, RIG.tackY, RIG.tackZ);
	jibStay.rotation.x = stayLean;
	const jibPivot = new Group();
	jibStay.add(jibPivot);
	heel.add(jibStay);
	// Clew 0.35 up and 2.25 aft of the tack, expressed in the stay's frame.
	const clew = [
		0.35 * Math.cos(stayLean) + 2.25 * Math.sin(stayLean),
		-0.35 * Math.sin(stayLean) + 2.25 * Math.cos(stayLean),
	] as const;
	const jib = new Mesh(jibGeometry(palette, Math.hypot(stayRise, stayRun), clew), cloth);
	jibPivot.add(jib);

	const bowWave = new Mesh(bowWaveGeometry(palette.wake), foam);
	frame.add(bowWave);

	const shadow = new Mesh(shadowGeometry(palette.shadow), foam);
	shadow.rotation.y = Math.atan2(SHADOW_X, SHADOW_Z);
	shadow.renderOrder = -1;
	group.add(shadow);

	let rudderAngle = 0;
	let heelAngle = 0;
	let boomSwing = 0;
	let jibSwing = 0;
	let luff = 0;
	let spray = 0;

	return {
		group,
		update(pose, wind, steer, timeSec) {
			const twa = trueWindAngle(pose.heading, wind);
			const side = sailSide(pose.heading, wind);
			const power = Math.min(1, pose.speed / MAX_SPEED);
			const inIrons = twa < 0.7;
			// Ease the controls so the boat visibly reacts to every input.
			rudderAngle += (steer * 0.5 - rudderAngle) * 0.2;
			rudder.rotation.y = -rudderAngle;
			const targetHeel = inIrons ? 0 : -side * power * 0.4 * Math.sin(Math.min(twa, Math.PI / 2));
			heelAngle += (targetHeel - heelAngle) * 0.06;
			const targetBoom = side * boomAngle(twa);
			boomSwing += normalizeAngle(targetBoom - boomSwing) * 0.08;
			// Dead downwind the jib goes out the other side: wing on wing.
			const targetJib = twa > 2.55 ? -side * 1.05 : targetBoom * 0.85;
			jibSwing += normalizeAngle(targetJib - jibSwing) * 0.07;
			luff += ((inIrons ? 1 : 0) - luff) * 0.12;

			// Ride the swell: bob and pitch, a touch livelier at speed.
			const phase = timeSec * 1.15 + (pose.x - pose.y) * 0.06;
			frame.position.set(pose.x, Math.sin(phase) * 0.1 - 0.03, -pose.y);
			frame.rotation.y = -pose.heading;
			heel.rotation.z = heelAngle + Math.sin(timeSec * 1.7) * 0.025;
			heel.rotation.x = Math.cos(phase) * 0.03 + Math.sin(timeSec * 3.3) * 0.012 * power - power * 0.035;

			// Sails belly to leeward, swap sides as the boom crosses, and
			// flutter flat when the boat is head to wind.
			const flutter = Math.sin(timeSec * 21) * luff;
			const fill = Math.max(-1, Math.min(1, boomSwing / 0.1)) * (1 - luff * 0.8);
			mainPivot.rotation.y = boomSwing + flutter * 0.1;
			jibPivot.rotation.y = jibSwing + flutter * 0.16;
			main.scale.x = sailFill(fill + flutter * 0.45);
			const jibFill = Math.max(-1, Math.min(1, jibSwing / 0.1)) * (1 - luff * 0.8);
			jib.scale.x = sailFill(jibFill + Math.sin(timeSec * 26 + 1) * luff * 0.55);
			// The helmsman sits up to windward, opposite the boom.
			crew.position.x = -Math.max(-1, Math.min(1, boomSwing / 0.3)) * 0.5;

			spray += (Math.max(0, power - 0.25) / 0.75 - spray) * 0.1;
			bowWave.visible = spray > 0.03;
			const surge = 1 + 0.12 * Math.sin(timeSec * 13) + 0.08 * Math.sin(timeSec * 7.3);
			bowWave.scale.set(1, spray * 1.5 * surge, 0.6 + 0.5 * spray);
			bowWave.position.z = -(BOAT_LENGTH / 2) * (1 - (0.6 + 0.5 * spray));

			shadow.position.set(pose.x + SHADOW_X * SHADOW_REACH, 0.02, -pose.y + SHADOW_Z * SHADOW_REACH);
			shadow.scale.set(2.7, 1, 6.2);
		},
		dispose() {
			group.traverse((node) => {
				if (node instanceof Mesh) node.geometry.dispose();
			});
			for (const material of [solid, cloth, foam]) material.dispose();
		},
	};
}
