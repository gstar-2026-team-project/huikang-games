import {
	BufferGeometry,
	type Color,
	CylinderGeometry,
	Euler,
	Float32BufferAttribute,
	Matrix4,
	Quaternion,
	Vector3,
} from "three";

export type Vec3 = readonly [number, number, number];

const UP = new Vector3(0, 1, 0);

/** Transform for {@link MeshBuilder.add}: position, then scale, then XYZ rotation. */
export function place(
	position: Vec3,
	scale: Vec3 | number = 1,
	rotation: Vec3 = [0, 0, 0],
): Matrix4 {
	const s = typeof scale === "number" ? ([scale, scale, scale] as const) : scale;
	return new Matrix4().compose(
		new Vector3(...position),
		new Quaternion().setFromEuler(new Euler(...rotation)),
		new Vector3(...s),
	);
}

/**
 * Collects flat-shaded, vertex-coloured triangles into one geometry, so a
 * model made of many parts and colours still costs a single draw call.
 * Draw the result double-sided: winding is not kept consistent.
 */
export class MeshBuilder {
	private positions: number[] = [];
	private colors: number[] = [];
	private scratch = new Vector3();

	tri(a: Vec3, b: Vec3, c: Vec3, color: Color): this {
		this.positions.push(...a, ...b, ...c);
		for (let i = 0; i < 3; i++) this.colors.push(color.r, color.g, color.b);
		return this;
	}

	quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color): this {
		return this.tri(a, b, c, color).tri(a, c, d, color);
	}

	/** Axis-aligned box from its minimum and maximum corners. */
	box(min: Vec3, max: Vec3, color: Color): this {
		const [x0, y0, z0] = min;
		const [x1, y1, z1] = max;
		this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color);
		this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
		this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
		this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color);
		this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], color);
		this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
		return this;
	}

	/** Copies a three.js primitive in, transformed; the source is disposed. */
	add(geometry: BufferGeometry, matrix: Matrix4, color: Color): this {
		const source = geometry.index ? geometry.toNonIndexed() : geometry;
		const position = source.getAttribute("position");
		for (let i = 0; i < position.count; i++) {
			this.scratch.fromBufferAttribute(position, i).applyMatrix4(matrix);
			this.positions.push(this.scratch.x, this.scratch.y, this.scratch.z);
			this.colors.push(color.r, color.g, color.b);
		}
		if (source !== geometry) source.dispose();
		geometry.dispose();
		return this;
	}

	/**
	 * Like {@link add}, but each triangle takes its colour from `shade`, given
	 * the triangle's centre and face normal after the transform. `warp` can
	 * move each transformed vertex first (rough up a hillside, say).
	 */
	addShaded(
		geometry: BufferGeometry,
		matrix: Matrix4,
		shade: (centre: Vector3, normal: Vector3) => Color,
		warp?: (vertex: Vector3) => void,
	): this {
		const source = geometry.index ? geometry.toNonIndexed() : geometry;
		const position = source.getAttribute("position");
		const corners = [new Vector3(), new Vector3(), new Vector3()];
		const centre = new Vector3();
		const normal = new Vector3();
		const edge = new Vector3();
		const origin = new Vector3().setFromMatrixPosition(matrix);
		for (let i = 0; i + 2 < position.count; i += 3) {
			for (let k = 0; k < 3; k++) {
				corners[k]!.fromBufferAttribute(position, i + k).applyMatrix4(matrix);
				warp?.(corners[k]!);
			}
			const [a, b, c] = corners as [Vector3, Vector3, Vector3];
			centre.copy(a).add(b).add(c).divideScalar(3);
			normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
			// Winding is not kept consistent: point the normal away from the part's origin.
			if (normal.dot(edge.copy(centre).sub(origin)) < 0) normal.negate();
			const color = shade(centre, normal);
			for (const p of corners) {
				this.positions.push(p.x, p.y, p.z);
				this.colors.push(color.r, color.g, color.b);
			}
		}
		if (source !== geometry) source.dispose();
		geometry.dispose();
		return this;
	}

	/** A tapered prism between two points (spars, poles). */
	tube(from: Vec3, to: Vec3, radius: number, color: Color, sides = 5, endRadius = radius): this {
		const a = new Vector3(...from);
		const b = new Vector3(...to);
		const axis = b.clone().sub(a);
		const length = axis.length();
		const matrix = new Matrix4().compose(
			a.clone().lerp(b, 0.5),
			new Quaternion().setFromUnitVectors(UP, axis.normalize()),
			new Vector3(1, 1, 1),
		);
		return this.add(new CylinderGeometry(endRadius, radius, length, sides), matrix, color);
	}

	build(): BufferGeometry {
		const geometry = new BufferGeometry();
		geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
		geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
		geometry.computeVertexNormals();
		return geometry;
	}
}
