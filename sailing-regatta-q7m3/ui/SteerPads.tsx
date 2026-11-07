import type { PoeAPI } from "poe-tiles-sdk/v1/client.js";
import type { PointerEvent } from "react";

type Side = "left" | "right";

/** Two hold-to-steer pads in the bottom corners, inset from the back-swipe edges. */
export function SteerPads({
	onPad,
	haptics,
	hint = null,
}: {
	onPad(side: Side, down: boolean): void;
	haptics: PoeAPI["haptics"];
	/** The lesson coach highlights the pad it suggests pressing. */
	hint?: Side | null;
}) {
	const handlers = (side: Side) => ({
		onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			event.currentTarget.dataset.pressed = "true";
			haptics.selection();
			onPad(side, true);
		},
		onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
			event.currentTarget.dataset.pressed = "false";
			onPad(side, false);
		},
		onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
			event.currentTarget.dataset.pressed = "false";
			onPad(side, false);
		},
		onContextMenu: (event: PointerEvent<HTMLButtonElement> | React.MouseEvent) => event.preventDefault(),
	});
	return (
		<>
			<button
				type="button"
				className="pad pad-left"
				aria-label="Steer left"
				data-testid="pad-left"
				data-hint={hint === "left"}
				{...handlers("left")}
			>
				◀
			</button>
			<button
				type="button"
				className="pad pad-right"
				aria-label="Steer right"
				data-testid="pad-right"
				data-hint={hint === "right"}
				{...handlers("right")}
			>
				▶
			</button>
		</>
	);
}
